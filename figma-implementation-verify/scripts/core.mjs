import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const SCHEMA_VERSION = 1;
export const EXIT_CODES = Object.freeze({ PASS: 0, FAIL: 2, BLOCKED: 3, ERROR: 4 });

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function contractHash(contract) {
  const copy = structuredClone(contract);
  delete copy.contract_hash;
  return sha256(stableStringify(copy));
}

export function verifierIdentity() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const files = ["core.mjs", "runtime.mjs", "figma-implementation-verify.mjs", "package.json", "package-lock.json"];
  const packageJson = readJson(path.join(scriptDir, "package.json"));
  const sourceFiles = Object.fromEntries(files.map((name) => [name, sha256File(path.join(scriptDir, name))]));
  return {
    name: packageJson.name,
    version: packageJson.version,
    source_sha256: sha256(stableStringify(sourceFiles)),
  };
}

export function featurePaths(rootDir, feature) {
  const featureDir = path.join(rootDir, "docs", "design", feature);
  return {
    rootDir,
    featureDir,
    snapshotsDir: path.join(featureDir, "snapshots"),
    draftPath: path.join(featureDir, "verification-contract.draft.json"),
    contractPath: path.join(featureDir, "verification-contract.json"),
    resultPath: path.join(featureDir, "verification-result.json"),
    reportPath: path.join(featureDir, "implementation-verification.md"),
    canonicalDir: path.join(featureDir, "verification"),
    runsDir: path.join(featureDir, ".figma-cache", "implementation-verification-runs"),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isRequired(value) {
  return value === true || value === "yes" || value === "required";
}

function relativeToFeature(featureDir, filePath) {
  return path.relative(featureDir, filePath).split(path.sep).join("/");
}

export function resolveFeaturePath(featureDir, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) return null;
  const root = path.resolve(featureDir);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return resolved;
}

export function discoverRequiredBaselines(paths) {
  if (!fs.existsSync(paths.snapshotsDir)) return [];
  return fs.readdirSync(paths.snapshotsDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const metadataPath = path.join(paths.snapshotsDir, name);
      const metadata = readJson(metadataPath);
      const declaredImagePath = metadata.image_path || `snapshots/${path.basename(name, ".json")}.png`;
      const imagePath = resolveFeaturePath(paths.featureDir, declaredImagePath);
      return {
        id: metadata.id || path.basename(name, ".json"),
        metadata,
        metadataPath,
        imagePath,
      };
    })
    .filter((baseline) => isRequired(baseline.metadata.required));
}

function sourceFileHashes(featureDir) {
  const names = [
    "clarified-requirement.md",
    "ui-understanding.md",
    "api-mapping.md",
    "component-mapping.md",
    "design-token-patch.md",
    "implementation-spec.md",
    "implementation-evidence.md",
    "open-questions.md",
    "design-diff.md",
    "ui-handoff.md",
    "assets-manifest.md",
    "validation-report.md",
  ];
  return Object.fromEntries(names
    .map((name) => [name, path.join(featureDir, name)])
    .filter(([, filePath]) => fs.existsSync(filePath))
    .map(([name, filePath]) => [name, sha256File(filePath)]));
}

function browserCandidate() {
  const candidates = [
    process.env.FIGMA_VERIFY_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "<confirm-browser-executable>";
}

export function createDraft(rootDir, feature) {
  const paths = featurePaths(rootDir, feature);
  if (!fs.existsSync(paths.featureDir)) throw new Error(`Feature directory does not exist: ${paths.featureDir}`);
  const baselines = discoverRequiredBaselines(paths);
  const draft = {
    schema_version: SCHEMA_VERSION,
    status: "draft",
    feature,
    created_at: new Date().toISOString(),
    source_hashes: sourceFileHashes(paths.featureDir),
    runtime: {
      start_command: "<confirm-start-command>",
      base_url: "<confirm-base-url>",
      readiness_path: "/",
      readiness_timeout_ms: 60000,
    },
    platform: {
      engine: "playwright-chromium",
      browser_executable: browserCandidate(),
      browser_version: "<recorded-at-seal>",
      locale: "en-US",
      timezone: "UTC",
      device_scale_factor: 1,
    },
    guardrails: {
      calibrated: false,
      pixel_threshold: 0.001,
      stability_threshold: 0.0001,
      pixelmatch_threshold: 0.1,
      max_mask_ratio: 0.05,
      repeated_captures: 2,
    },
    subject: {
      exclude: [
        ".scratch/**",
        `docs/design/${feature}/verification/**`,
        `docs/design/${feature}/.figma-cache/implementation-verification-runs/**`,
        `docs/design/${feature}/verification-result.json`,
        `docs/design/${feature}/implementation-verification.md`,
        `docs/design/${feature}/verification-contract.draft.json`,
        `docs/design/${feature}/verification-contract.json`,
      ],
    },
    baselines: baselines.map(({ id, metadata, metadataPath, imagePath }) => ({
      id,
      required: true,
      image_path: imagePath ? relativeToFeature(paths.featureDir, imagePath) : "<missing-outside-feature>",
      metadata_path: relativeToFeature(paths.featureDir, metadataPath),
      image_sha256: imagePath && fs.existsSync(imagePath) ? sha256File(imagePath) : "<missing>",
      metadata_sha256: sha256File(metadataPath),
      figma_node_id: metadata.figma_node_id || "<confirm-figma-node-id>",
      width: Number(metadata.original_width) || null,
      height: Number(metadata.original_height) || null,
    })),
    scenarios: baselines.map(({ id, metadata }) => ({
      id,
      required: true,
      baseline_id: id,
      route: "<confirm-route>",
      viewport: {
        width: Number(metadata.original_width) || null,
        height: Number(metadata.original_height) || null,
      },
      target: {
        type: "element",
        locator: { by: "css", value: "<confirm-capture-target>" },
      },
      steps: [],
      masks: [],
      assertions: [
        {
          id: `${id}-target-visible`,
          type: "visible",
          target: { by: "css", value: "<confirm-capture-target>" },
          expected: true,
          source: `snapshots/${id}.json`,
        },
      ],
    })),
  };
  fs.writeFileSync(paths.draftPath, `${JSON.stringify(draft, null, 2)}\n`);
  return { paths, draft, unresolved: unresolvedDraftFields(draft) };
}

function walkValues(value, pointer = "") {
  if (Array.isArray(value)) return value.flatMap((item, index) => walkValues(item, `${pointer}/${index}`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => walkValues(item, `${pointer}/${key}`));
  }
  return [{ pointer: pointer || "/", value }];
}

export function unresolvedDraftFields(draft) {
  const unresolved = walkValues(draft)
    .filter(({ value }) => value === null || (typeof value === "string" && /^<(confirm|missing|recorded-at-seal)/.test(value)))
    .map(({ pointer }) => pointer);
  if (!draft.guardrails?.calibrated) unresolved.push("/guardrails/calibrated");
  if (!draft.baselines?.length) unresolved.push("/baselines");
  return [...new Set(unresolved)].sort();
}

function validateMasks(contract) {
  const findings = [];
  for (const scenario of contract.scenarios || []) {
    const baseline = (contract.baselines || []).find((item) => item.id === scenario.baseline_id);
    const width = baseline?.width;
    const height = baseline?.height;
    if (!width || !height) continue;
    const total = width * height;
    for (const mask of scenario.masks || []) {
      const values = [mask.x, mask.y, mask.width, mask.height];
      if (!values.every(Number.isFinite) || mask.x < 0 || mask.y < 0 || mask.width <= 0 || mask.height <= 0) {
        findings.push(`scenario ${scenario.id} mask must use finite positive geometry inside the viewport`);
      } else if (mask.x + mask.width > width || mask.y + mask.height > height) {
        findings.push(`scenario ${scenario.id} mask exceeds the viewport`);
      }
    }
    const masked = (scenario.masks || []).reduce((sum, mask) => sum + Math.max(0, mask.width || 0) * Math.max(0, mask.height || 0), 0);
    if (Number.isFinite(contract.guardrails?.max_mask_ratio) && masked / total > contract.guardrails.max_mask_ratio) {
      findings.push(`scenario ${scenario.id} mask ratio ${(masked / total).toFixed(4)} exceeds ${contract.guardrails.max_mask_ratio}`);
    }
  }
  return findings;
}

const STEP_TYPES = new Set(["mock-route", "set-cookie", "set-local-storage", "click", "fill", "select", "wait-for"]);
const ASSERTION_TYPES = new Set(["visible", "text", "count", "bounding-box", "computed-style", "color", "alignment", "gap"]);
const ALIGNMENT_AXES = new Set(["left", "top", "right", "bottom", "center-x", "center-y"]);
const WAIT_STATES = new Set(["visible", "hidden", "attached", "detached"]);

function validId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function validateLocator(locator, label) {
  const findings = [];
  if (!locator || typeof locator !== "object") return [`${label} locator is required`];
  if (locator.by === "role") {
    if (typeof locator.role !== "string" || !locator.role) findings.push(`${label} role locator requires role`);
  } else if (["test-id", "text", "css"].includes(locator.by)) {
    if (typeof locator.value !== "string" || !locator.value) findings.push(`${label} ${locator.by} locator requires value`);
  } else findings.push(`${label} uses unsupported locator type: ${locator.by || "<missing>"}`);
  return findings;
}

function hasExpected(assertion) {
  return Object.prototype.hasOwnProperty.call(assertion, "expected");
}

function validateAssertion(assertion, scenarioId) {
  const label = `scenario ${scenarioId} assertion ${assertion?.id || "<missing>"}`;
  const findings = [];
  if (!validId(assertion?.id)) findings.push(`${label} id must use kebab-case`);
  if (!ASSERTION_TYPES.has(assertion?.type)) findings.push(`${label} uses unsupported type: ${assertion?.type || "<missing>"}`);
  findings.push(...validateLocator(assertion?.target, label));
  if (!hasExpected(assertion || {})) findings.push(`${label} requires expected`);
  if (typeof assertion?.source !== "string" || !assertion.source) findings.push(`${label} requires source`);
  if (assertion?.type === "visible" && typeof assertion.expected !== "boolean") findings.push(`${label} expected must be boolean`);
  if (assertion?.type === "text" && typeof assertion.expected !== "string") findings.push(`${label} expected must be string`);
  if (assertion?.type === "count" && (!Number.isInteger(assertion.expected) || assertion.expected < 0)) findings.push(`${label} expected must be a non-negative integer`);
  if (assertion?.type === "bounding-box") {
    const expected = assertion.expected;
    if (!expected || !["x", "y", "width", "height"].every((key) => Number.isFinite(expected[key]))) findings.push(`${label} expected must include finite x/y/width/height`);
  }
  if (["computed-style", "color"].includes(assertion?.type) && (typeof assertion.property !== "string" || !assertion.property)) findings.push(`${label} requires property`);
  if (["alignment", "gap"].includes(assertion?.type)) findings.push(...validateLocator(assertion.related_target, `${label} related target`));
  if (assertion?.type === "alignment" && !ALIGNMENT_AXES.has(assertion.axis)) findings.push(`${label} uses unsupported axis`);
  if (assertion?.type === "gap" && !["x", "y"].includes(assertion.axis)) findings.push(`${label} gap axis must be x or y`);
  if (assertion?.type === "gap" && !Number.isFinite(assertion.expected)) findings.push(`${label} expected must be numeric`);
  if (assertion?.tolerance_px !== undefined && (!Number.isFinite(assertion.tolerance_px) || assertion.tolerance_px < 0)) findings.push(`${label} tolerance_px must be non-negative`);
  return findings;
}

function validateStep(step, scenarioId) {
  const label = `scenario ${scenarioId} step ${step?.type || "<missing>"}`;
  const findings = [];
  if (!STEP_TYPES.has(step?.type)) return [`${label} is unsupported`];
  if (step.type === "mock-route") {
    if (typeof step.url !== "string" || !step.url) findings.push(`${label} requires url`);
    if (typeof step.fixture_path !== "string" || !step.fixture_path) findings.push(`${label} requires fixture_path`);
    if (step.synthetic !== true) findings.push(`${label} must declare synthetic=true`);
  } else if (step.type === "set-cookie") {
    for (const key of ["name", "value", "url"]) if (typeof step[key] !== "string" || !step[key]) findings.push(`${label} requires ${key}`);
  } else if (step.type === "set-local-storage") {
    for (const key of ["key", "value"]) if (typeof step[key] !== "string") findings.push(`${label} requires string ${key}`);
  } else {
    findings.push(...validateLocator(step.target, label));
    if (["fill", "select"].includes(step.type) && typeof step.value !== "string") findings.push(`${label} requires string value`);
    if (step.type === "wait-for" && step.state !== undefined && !WAIT_STATES.has(step.state)) findings.push(`${label} uses unsupported state`);
  }
  return findings;
}

function duplicateValues(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export function validateDraftForSeal(draft) {
  const findings = unresolvedDraftFields(draft);
  if (draft.schema_version !== SCHEMA_VERSION) findings.push(`/schema_version must be ${SCHEMA_VERSION}`);
  if (!validId(draft.feature)) findings.push("feature must use kebab-case");
  if (typeof draft.runtime?.start_command !== "string" || !draft.runtime.start_command) findings.push("runtime.start_command is required");
  else if (/(bearer\s+[a-z0-9._-]+|\b(authorization|api[_-]?key|password|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*=)/i.test(draft.runtime.start_command)) findings.push("runtime.start_command must not contain credentials");
  if (!Number.isFinite(draft.runtime?.readiness_timeout_ms) || draft.runtime.readiness_timeout_ms <= 0) findings.push("runtime.readiness_timeout_ms must be positive");
  if (draft.platform?.engine !== "playwright-chromium") findings.push("platform.engine must be playwright-chromium");
  if (draft.platform?.device_scale_factor !== 1) findings.push("platform.device_scale_factor must be 1 in schema v1");
  if (typeof draft.platform?.locale !== "string" || !draft.platform.locale) findings.push("platform.locale is required");
  if (typeof draft.platform?.timezone !== "string" || !draft.platform.timezone) findings.push("platform.timezone is required");
  for (const key of ["pixel_threshold", "stability_threshold", "pixelmatch_threshold", "max_mask_ratio"]) {
    const value = draft.guardrails?.[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) findings.push(`guardrails.${key} must be between 0 and 1`);
  }
  try {
    const baseUrl = new URL(draft.runtime?.base_url);
    if (!new Set(["localhost", "127.0.0.1", "::1"]).has(baseUrl.hostname)) findings.push("runtime.base_url must target the verifier-managed local application");
  } catch {
    findings.push("runtime.base_url must be a valid local URL");
  }
  const baselineIds = (draft.baselines || []).map((item) => item.id);
  const scenarioIds = (draft.scenarios || []).map((item) => item.id);
  for (const id of baselineIds) if (!validId(id)) findings.push(`baseline id must use kebab-case: ${id || "<missing>"}`);
  for (const id of scenarioIds) if (!validId(id)) findings.push(`scenario id must use kebab-case: ${id || "<missing>"}`);
  for (const id of duplicateValues(baselineIds)) findings.push(`duplicate baseline id: ${id}`);
  for (const id of duplicateValues(scenarioIds)) findings.push(`duplicate scenario id: ${id}`);
  for (const baseline of draft.baselines || []) {
    if (!Number.isInteger(baseline.width) || baseline.width <= 0 || !Number.isInteger(baseline.height) || baseline.height <= 0) findings.push(`baseline ${baseline.id} dimensions must be positive integers`);
    if (typeof baseline.figma_node_id !== "string" || !baseline.figma_node_id) findings.push(`baseline ${baseline.id} requires figma_node_id`);
  }
  const allBaselines = new Set(baselineIds);
  const allScenarios = draft.scenarios || [];
  const requiredBaselines = new Set((draft.baselines || []).filter((item) => item.required).map((item) => item.id));
  const requiredScenarios = allScenarios.filter((item) => item.required);
  for (const baselineId of requiredBaselines) {
    const matches = requiredScenarios.filter((scenario) => scenario.baseline_id === baselineId);
    if (matches.length !== 1) findings.push(`required baseline ${baselineId} must map to exactly one required scenario`);
  }
  for (const scenario of allScenarios) {
    if (!allBaselines.has(scenario.baseline_id)) findings.push(`scenario ${scenario.id} references a missing baseline`);
    if (scenario.required && !requiredBaselines.has(scenario.baseline_id)) findings.push(`required scenario ${scenario.id} references a non-required baseline`);
    if (scenario.required && !scenario.assertions?.length) findings.push(`required scenario ${scenario.id} must include at least one visual assertion`);
    if (!Number.isInteger(scenario.viewport?.width) || scenario.viewport.width <= 0 || !Number.isInteger(scenario.viewport?.height) || scenario.viewport.height <= 0) findings.push(`scenario ${scenario.id} viewport must use positive integer dimensions`);
    if (typeof scenario.route !== "string" || !scenario.route) findings.push(`scenario ${scenario.id} route is required`);
    if (scenario.target?.type === "element") findings.push(...validateLocator(scenario.target.locator, `scenario ${scenario.id} capture target`));
    else if (scenario.target?.type !== "viewport") findings.push(`scenario ${scenario.id} target.type must be element or viewport`);
    for (const step of scenario.steps || []) findings.push(...validateStep(step, scenario.id));
    const assertionIds = (scenario.assertions || []).map((item) => item.id);
    for (const id of duplicateValues(assertionIds)) findings.push(`scenario ${scenario.id} has duplicate assertion id: ${id}`);
    for (const assertion of scenario.assertions || []) findings.push(...validateAssertion(assertion, scenario.id));
  }
  if (draft.guardrails?.repeated_captures !== 2) findings.push("guardrails.repeated_captures must be 2 in schema v1");
  findings.push(...validateMasks(draft));
  return [...new Set(findings)].sort();
}

export function hydrateFixtureHashes(draft, featureDir) {
  const copy = structuredClone(draft);
  const findings = [];
  const sensitivePattern = /(bearer\s+[a-z0-9._-]+|["']?(authorization|api[_-]?key|password|client[_-]?secret|access[_-]?token|refresh[_-]?token)["']?\s*[:=])/i;
  for (const scenario of copy.scenarios || []) {
    for (const step of scenario.steps || []) {
      if (step.type !== "mock-route") continue;
      const fixturePath = resolveFeaturePath(featureDir, step.fixture_path);
      if (!fixturePath || !fs.existsSync(fixturePath)) {
        findings.push(`scenario ${scenario.id} fixture missing: ${step.fixture_path || "<missing>"}`);
        continue;
      }
      const contents = fs.readFileSync(fixturePath, "utf8");
      if (sensitivePattern.test(contents)) findings.push(`scenario ${scenario.id} fixture may contain a credential: ${step.fixture_path}`);
      step.fixture_sha256 = sha256(contents);
    }
  }
  return { draft: copy, findings };
}

export function sealDraft(draft, approvedBy, browserVersion) {
  const contract = structuredClone(draft);
  contract.platform ||= {};
  contract.platform.browser_version = browserVersion;
  contract.verifier = verifierIdentity();
  const findings = validateDraftForSeal(contract);
  if (!approvedBy) findings.push("approved_by is required");
  if (findings.length) return { contract: null, findings };
  contract.status = "sealed";
  contract.sealed_at = new Date().toISOString();
  contract.approved_by = approvedBy;
  contract.contract_hash = contractHash(contract);
  return { contract, findings: [] };
}

function wildcardPrefix(pattern) {
  return pattern.endsWith("/**") ? pattern.slice(0, -3) : pattern;
}

function isExcluded(relativePath, patterns) {
  return patterns.some((pattern) => relativePath === pattern || relativePath.startsWith(`${wildcardPrefix(pattern)}/`));
}

export function verificationSubject(rootDir, contract) {
  const output = execFileSync("git", ["-C", rootDir, "ls-files", "-co", "--exclude-standard", "-z"]);
  const files = output.toString("utf8").split("\0").filter(Boolean).sort();
  const included = files.filter((relativePath) => !isExcluded(relativePath, contract.subject?.exclude || []));
  const hash = crypto.createHash("sha256");
  for (const relativePath of included) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }
  const head = execFileSync("git", ["-C", rootDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { head, digest: hash.digest("hex"), file_count: included.length };
}

function maskImages(expected, actual, masks) {
  for (const mask of masks || []) {
    const left = Math.max(0, Math.floor(mask.x));
    const top = Math.max(0, Math.floor(mask.y));
    const right = Math.min(expected.width, Math.ceil(mask.x + mask.width));
    const bottom = Math.min(expected.height, Math.ceil(mask.y + mask.height));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * expected.width + x) * 4;
        actual.data[index] = expected.data[index];
        actual.data[index + 1] = expected.data[index + 1];
        actual.data[index + 2] = expected.data[index + 2];
        actual.data[index + 3] = expected.data[index + 3];
      }
    }
  }
}

export function compareImages(expectedPath, actualPath, diffPath, options = {}) {
  const expected = PNG.sync.read(fs.readFileSync(expectedPath));
  const actual = PNG.sync.read(fs.readFileSync(actualPath));
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return { dimensions_match: false, expected_size: `${expected.width}x${expected.height}`, actual_size: `${actual.width}x${actual.height}`, ratio: 1 };
  }
  maskImages(expected, actual, options.masks);
  const diff = new PNG({ width: expected.width, height: expected.height });
  const mismatched = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, {
    threshold: options.pixelmatchThreshold ?? 0.1,
    includeAA: false,
  });
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return {
    dimensions_match: true,
    expected_size: `${expected.width}x${expected.height}`,
    actual_size: `${actual.width}x${actual.height}`,
    mismatched_pixels: mismatched,
    ratio: mismatched / (expected.width * expected.height),
  };
}

export function deriveScenarioOutcome({ baseline_one, baseline_two, stability, assertions_one = [], assertions_two = [] }, guardrails) {
  if (!baseline_one.dimensions_match || !baseline_two.dimensions_match) return "FAIL";
  if (!stability.dimensions_match || stability.ratio > guardrails.stability_threshold) return "BLOCKED";
  const assertionsStable = assertions_one.length === assertions_two.length && assertions_one.every((item, index) => item.status === assertions_two[index]?.status);
  if (!assertionsStable) return "BLOCKED";
  if (assertions_one.some((item) => item.status !== "pass") || assertions_two.some((item) => item.status !== "pass")) return "FAIL";
  if (baseline_one.ratio > guardrails.pixel_threshold || baseline_two.ratio > guardrails.pixel_threshold) return "FAIL";
  return "PASS";
}

export function overallOutcome(scenarios) {
  const required = scenarios.filter((scenario) => scenario.required);
  if (required.some((scenario) => scenario.outcome === "ERROR")) return "ERROR";
  if (required.some((scenario) => scenario.outcome === "BLOCKED")) return "BLOCKED";
  if (required.some((scenario) => scenario.outcome === "FAIL")) return "FAIL";
  return required.length > 0 && required.every((scenario) => scenario.outcome === "PASS") ? "PASS" : "BLOCKED";
}

export function canonicalResult(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function renderReport(result) {
  const rows = result.scenarios.map((scenario) => `| ${scenario.id} | ${scenario.required ? "yes" : "no"} | ${scenario.baseline_one.ratio.toFixed(6)} | ${scenario.baseline_two.ratio.toFixed(6)} | ${scenario.stability.ratio.toFixed(6)} | ${scenario.outcome} |`).join("\n");
  const coverage = result.scenarios.map((scenario) => `- ${scenario.id}: ${scenario.required ? "required" : "optional"}, ${scenario.outcome}`).join("\n");
  const inlineJson = (value) => String(stableStringify(value)).replaceAll("|", "\\|").replaceAll("`", "\\`");
  const assertionRows = result.scenarios.flatMap((scenario) => [
    ...(scenario.assertions_one || []).map((item) => `| ${scenario.id} | 1 | ${item.id} | ${item.type} | ${item.status} | \`${inlineJson(item.expected)}\` | \`${inlineJson(item.actual)}\` |`),
    ...(scenario.assertions_two || []).map((item) => `| ${scenario.id} | 2 | ${item.id} | ${item.type} | ${item.status} | \`${inlineJson(item.expected)}\` | \`${inlineJson(item.actual)}\` |`),
  ]).join("\n");
  const evidenceRows = result.scenarios.map((scenario) => `| ${scenario.id} | \`${scenario.evidence.baseline}\` | \`${scenario.evidence.implementation_one}\` | \`${scenario.evidence.implementation_two}\` |`).join("\n");
  return `# Implementation Verification — ${result.feature}\n\n> Generated by figma-implementation-verify. Manual edits invalidate check.\n\n## Outcome\n\n- Status: ${result.outcome}\n- Contract hash: \`${result.contract_hash}\`\n- Verification Subject: \`${result.subject.digest}\`\n- HEAD at capture: \`${result.subject.head}\`\n- Verifier: ${result.verifier.name}@${result.verifier.version} \`${result.verifier.source_sha256}\`\n- Browser: ${result.browser.version}\n\n## Scenario Results\n\n| Scenario | Required | Diff 1 | Diff 2 | Stability | Outcome |\n|---|---|---:|---:|---:|---|\n${rows}\n\n## Visual Assertions\n\n| Scenario | Capture | Assertion | Type | Status | Expected | Actual |\n|---|---:|---|---|---|---|---|\n${assertionRows}\n\n## Evidence Digests\n\n| Scenario | Baseline | Implementation 1 | Implementation 2 |\n|---|---|---|---|\n${evidenceRows}\n\n## Verification Coverage\n\n${coverage}\n\n## Intentional Deviations\n\n${result.approved_deviations?.length ? result.approved_deviations.map((item) => `- ${item.id}: ${item.reason}`).join("\n") : "- None"}\n`;
}

export function validateSealedContract(featureDir, contract) {
  const findings = validateDraftForSeal(contract);
  if (contract.status !== "sealed") findings.push("contract status is not sealed");
  if (typeof contract.sealed_at !== "string" || !contract.sealed_at) findings.push("contract sealed_at is missing");
  if (typeof contract.approved_by !== "string" || !contract.approved_by) findings.push("contract approved_by is missing");
  if (contract.contract_hash !== contractHash(contract)) findings.push("contract hash mismatch");
  if (stableStringify(contract.verifier) !== stableStringify(verifierIdentity())) findings.push("sealed verifier identity does not match the current verifier");
  for (const baseline of contract.baselines || []) {
    const imagePath = resolveFeaturePath(featureDir, baseline.image_path);
    const metadataPath = resolveFeaturePath(featureDir, baseline.metadata_path);
    if (!imagePath || !fs.existsSync(imagePath)) findings.push(`baseline image missing or outside feature: ${baseline.image_path}`);
    else {
      if (sha256File(imagePath) !== baseline.image_sha256) findings.push(`baseline image changed: ${baseline.id}`);
      try {
        const image = PNG.sync.read(fs.readFileSync(imagePath));
        if (image.width !== baseline.width || image.height !== baseline.height) findings.push(`baseline dimensions changed: ${baseline.id}`);
      } catch {
        findings.push(`baseline image is not a readable PNG: ${baseline.id}`);
      }
    }
    if (!metadataPath || !fs.existsSync(metadataPath)) findings.push(`baseline metadata missing or outside feature: ${baseline.metadata_path}`);
    else if (sha256File(metadataPath) !== baseline.metadata_sha256) findings.push(`baseline metadata changed: ${baseline.id}`);
  }
  for (const [name, expectedHash] of Object.entries(contract.source_hashes || {})) {
    const filePath = path.join(featureDir, name);
    if (!fs.existsSync(filePath)) findings.push(`sealed source missing: ${name}`);
    else if (sha256File(filePath) !== expectedHash) findings.push(`sealed source changed: ${name}`);
  }
  for (const scenario of contract.scenarios || []) {
    for (const step of scenario.steps || []) {
      if (step.type !== "mock-route") continue;
      const fixturePath = resolveFeaturePath(featureDir, step.fixture_path);
      if (!fixturePath || !fs.existsSync(fixturePath)) findings.push(`sealed fixture missing or outside feature: ${step.fixture_path}`);
      else if (sha256File(fixturePath) !== step.fixture_sha256) findings.push(`sealed fixture changed: ${step.fixture_path}`);
    }
  }
  return findings;
}
