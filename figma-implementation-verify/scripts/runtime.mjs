import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { chromium } from "playwright-core";

import { compareImages, deriveScenarioOutcome, overallOutcome, resolveFeaturePath, sha256File, verificationSubject } from "./core.mjs";

export class BlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedError";
  }
}

function locatorFor(page, descriptor) {
  if (!descriptor || !descriptor.by) throw new BlockedError("locator descriptor is missing");
  if (descriptor.by === "role") return page.getByRole(descriptor.role, descriptor.name ? { name: descriptor.name, exact: descriptor.exact ?? true } : {});
  if (descriptor.by === "test-id") return page.getByTestId(descriptor.value);
  if (descriptor.by === "text") return page.getByText(descriptor.value, { exact: descriptor.exact ?? true });
  if (descriptor.by === "css") return page.locator(descriptor.value);
  throw new BlockedError(`unsupported locator type: ${descriptor.by}`);
}

function absoluteUrl(baseUrl, route) {
  return new URL(route || "/", baseUrl).toString();
}

async function waitForReady(baseUrl, readinessPath, timeoutMs, processHandle) {
  const deadline = Date.now() + timeoutMs;
  const url = absoluteUrl(baseUrl, readinessPath || "/");
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      throw new BlockedError(`managed application exited before readiness with code ${processHandle.exitCode ?? processHandle.signalCode}`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The managed server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new BlockedError(`managed application did not become ready within ${timeoutMs}ms: ${url}`);
}

export async function startManagedRuntime(rootDir, runtime) {
  if (!runtime?.start_command) throw new BlockedError("runtime.start_command is required");
  const child = spawn(runtime.start_command, {
    cwd: rootDir,
    env: process.env,
    shell: true,
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  };
  try {
    await waitForReady(runtime.base_url, runtime.readiness_path, runtime.readiness_timeout_ms, child);
    return { child, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function detectBrowserVersion(executablePath) {
  if (!fs.existsSync(executablePath)) throw new BlockedError(`browser executable does not exist: ${executablePath}`);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    return browser.version();
  } finally {
    await browser.close();
  }
}

async function registerPreNavigationSteps(context, page, scenario, featureDir) {
  const localStorage = [];
  for (const step of scenario.steps || []) {
    if (step.type === "mock-route") {
      const fixturePath = resolveFeaturePath(featureDir, step.fixture_path);
      if (!fixturePath || !fs.existsSync(fixturePath)) throw new BlockedError(`fixture does not exist inside feature: ${step.fixture_path}`);
      const body = fs.readFileSync(fixturePath, "utf8");
      await page.route(step.url, (route) => route.fulfill({
        status: step.status || 200,
        contentType: step.content_type || "application/json",
        body,
      }));
    } else if (step.type === "set-cookie") {
      await context.addCookies([{ name: step.name, value: step.value, url: step.url }]);
    } else if (step.type === "set-local-storage") {
      localStorage.push({ key: step.key, value: step.value });
    }
  }
  if (localStorage.length) {
    await page.addInitScript((items) => {
      for (const item of items) window.localStorage.setItem(item.key, item.value);
    }, localStorage);
  }
}

async function runPostNavigationSteps(page, scenario) {
  for (const step of scenario.steps || []) {
    if (["mock-route", "set-cookie", "set-local-storage"].includes(step.type)) continue;
    if (step.type === "click") await locatorFor(page, step.target).click();
    else if (step.type === "fill") await locatorFor(page, step.target).fill(step.value);
    else if (step.type === "select") await locatorFor(page, step.target).selectOption(step.value);
    else if (step.type === "wait-for") await locatorFor(page, step.target).waitFor({ state: step.state || "visible", timeout: step.timeout_ms || 10000 });
    else throw new BlockedError(`unsupported scenario step: ${step.type}`);
  }
}

function numericPass(actual, expected, tolerance = 0) {
  return Math.abs(actual - expected) <= tolerance;
}

function boxProjection(box, axis) {
  if (axis === "left") return box.x;
  if (axis === "top") return box.y;
  if (axis === "right") return box.x + box.width;
  if (axis === "bottom") return box.y + box.height;
  if (axis === "center-x") return box.x + box.width / 2;
  if (axis === "center-y") return box.y + box.height / 2;
  throw new BlockedError(`unsupported alignment axis: ${axis}`);
}

async function measureAssertion(page, assertion, captureBox) {
  const locator = locatorFor(page, assertion.target);
  const type = assertion.type;
  let actual;
  let status = "fail";
  const box = type === "count" ? null : await locator.boundingBox();
  const assertionBoxes = box ? [box] : [];

  if (type === "visible") {
    actual = await locator.isVisible();
    status = actual === assertion.expected ? "pass" : "fail";
  } else if (type === "text") {
    actual = (await locator.innerText()).trim();
    status = actual === assertion.expected ? "pass" : "fail";
  } else if (type === "count") {
    actual = await locator.count();
    assertionBoxes.push(...await locator.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })));
    status = actual === assertion.expected ? "pass" : "fail";
  } else if (type === "bounding-box") {
    actual = box;
    if (box) {
      const tolerance = assertion.tolerance_px || 0;
      status = ["x", "y", "width", "height"].every((key) => numericPass(box[key], assertion.expected[key], tolerance)) ? "pass" : "fail";
    }
  } else if (type === "computed-style" || type === "color") {
    actual = await locator.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property).trim(), assertion.property);
    status = actual === assertion.expected ? "pass" : "fail";
  } else if (type === "alignment") {
    const relatedBox = await locatorFor(page, assertion.related_target).boundingBox();
    if (relatedBox) assertionBoxes.push(relatedBox);
    actual = box && relatedBox ? Math.abs(boxProjection(box, assertion.axis) - boxProjection(relatedBox, assertion.axis)) : null;
    status = actual !== null && numericPass(actual, 0, assertion.tolerance_px || 0) ? "pass" : "fail";
  } else if (type === "gap") {
    const relatedBox = await locatorFor(page, assertion.related_target).boundingBox();
    if (relatedBox) assertionBoxes.push(relatedBox);
    if (box && relatedBox) {
      actual = assertion.axis === "x" ? relatedBox.x - (box.x + box.width) : relatedBox.y - (box.y + box.height);
      status = numericPass(actual, assertion.expected, assertion.tolerance_px || 0) ? "pass" : "fail";
    } else actual = null;
  } else {
    throw new BlockedError(`unsupported assertion type: ${type}`);
  }

  const relativeBoxes = captureBox ? assertionBoxes.map((item) => ({
    x: item.x - captureBox.x,
    y: item.y - captureBox.y,
    width: item.width,
    height: item.height,
  })) : [];
  return { id: assertion.id, type, status, expected: assertion.expected, actual, relative_boxes: relativeBoxes };
}

function intersects(a, b) {
  return a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function ensureMasksDoNotHideAssertions(masks, assertions) {
  for (const mask of masks || []) {
    for (const assertion of assertions) {
      if ((assertion.relative_boxes || []).some((box) => intersects(mask, box))) {
        throw new BlockedError(`mask intersects assertion target: ${assertion.id}`);
      }
    }
  }
}

async function captureOnce(browser, contract, scenario, featureDir, outputPath) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: contract.platform.device_scale_factor,
    locale: contract.platform.locale,
    timezoneId: contract.platform.timezone,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await registerPreNavigationSteps(context, page, scenario, featureDir);
    await page.goto(absoluteUrl(contract.runtime.base_url, scenario.route), { waitUntil: "networkidle" });
    await runPostNavigationSteps(page, scenario);

    let captureBox = { x: 0, y: 0, width: scenario.viewport.width, height: scenario.viewport.height };
    if (scenario.target.type === "element") {
      const target = locatorFor(page, scenario.target.locator);
      await target.waitFor({ state: "visible" });
      captureBox = await target.boundingBox();
      if (!captureBox) throw new BlockedError(`capture target has no bounding box: ${scenario.id}`);
      await target.screenshot({ path: outputPath, animations: "disabled" });
    } else if (scenario.target.type === "viewport") {
      await page.screenshot({ path: outputPath, animations: "disabled", fullPage: false });
    } else {
      throw new BlockedError(`unsupported capture target type: ${scenario.target.type}`);
    }

    const assertions = [];
    for (const assertion of scenario.assertions || []) assertions.push(await measureAssertion(page, assertion, captureBox));
    ensureMasksDoNotHideAssertions(scenario.masks, assertions);
    return { assertions, capture_box: captureBox };
  } finally {
    await context.close();
  }
}

function scenarioResult(contract, scenario, baselinePath, runDir, captureOne, captureTwo) {
  const options = { masks: scenario.masks, pixelmatchThreshold: contract.guardrails.pixelmatch_threshold };
  const baselineOne = compareImages(baselinePath, captureOne.path, path.join(runDir, "baseline-1.diff.png"), options);
  const baselineTwo = compareImages(baselinePath, captureTwo.path, path.join(runDir, "baseline-2.diff.png"), options);
  const stability = compareImages(captureOne.path, captureTwo.path, path.join(runDir, "stability.diff.png"), options);
  const comparisons = {
    baseline_one: baselineOne,
    baseline_two: baselineTwo,
    stability,
    assertions_one: captureOne.assertions,
    assertions_two: captureTwo.assertions,
  };
  return {
    id: scenario.id,
    required: scenario.required,
    baseline_id: scenario.baseline_id,
    outcome: deriveScenarioOutcome(comparisons, contract.guardrails),
    ...comparisons,
    evidence: {
      baseline: sha256File(baselinePath),
      implementation_one: sha256File(captureOne.path),
      implementation_two: sha256File(captureTwo.path),
    },
  };
}

export async function runVerification(rootDir, featureDir, contract, runDir) {
  const subjectBefore = verificationSubject(rootDir, contract);
  fs.mkdirSync(runDir, { recursive: true });
  const managed = await startManagedRuntime(rootDir, contract.runtime);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: contract.platform.browser_executable, headless: true });
    const version = browser.version();
    if (version !== contract.platform.browser_version) {
      throw new BlockedError(`browser version changed: expected ${contract.platform.browser_version}, got ${version}`);
    }
    const scenarios = [];
    for (const scenario of contract.scenarios) {
      const baseline = contract.baselines.find((item) => item.id === scenario.baseline_id);
      if (!baseline) throw new BlockedError(`baseline missing for scenario: ${scenario.id}`);
      const scenarioDir = path.join(runDir, scenario.id);
      fs.mkdirSync(scenarioDir, { recursive: true });
      const implementationOne = path.join(scenarioDir, "implementation-1.png");
      const implementationTwo = path.join(scenarioDir, "implementation-2.png");
      const first = await captureOnce(browser, contract, scenario, featureDir, implementationOne);
      const second = await captureOnce(browser, contract, scenario, featureDir, implementationTwo);
      scenarios.push(scenarioResult(
        contract,
        scenario,
        resolveFeaturePath(featureDir, baseline.image_path),
        scenarioDir,
        { ...first, path: implementationOne },
        { ...second, path: implementationTwo },
      ));
    }
    const subject = verificationSubject(rootDir, contract);
    if (subject.digest !== subjectBefore.digest || subject.head !== subjectBefore.head) {
      throw new BlockedError("Verification Subject changed during capture");
    }
    return {
      schema_version: 1,
      feature: contract.feature,
      generated_at: new Date().toISOString(),
      outcome: overallOutcome(scenarios),
      contract_hash: contract.contract_hash,
      subject,
      verifier: contract.verifier,
      browser: { engine: "playwright-chromium", version },
      scenarios,
      approved_deviations: contract.approved_deviations || [],
    };
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await managed.stop();
    }
  }
}
