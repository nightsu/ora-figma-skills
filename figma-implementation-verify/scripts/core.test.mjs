import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  contractHash,
  createDraft,
  deriveScenarioOutcome,
  hydrateFixtureHashes,
  overallOutcome,
  renderReport,
  sealDraft,
  validateDraftForSeal,
} from "./core.mjs";

function writePng(filePath, color = [255, 255, 255, 255]) {
  const png = new PNG({ width: 16, height: 12 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = color[3];
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function makeFeature() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-implementation-verify-"));
  const featureDir = path.join(rootDir, "docs/design/demo");
  fs.mkdirSync(path.join(featureDir, "snapshots"), { recursive: true });
  writePng(path.join(featureDir, "snapshots/default.png"));
  fs.writeFileSync(path.join(featureDir, "snapshots/default.json"), `${JSON.stringify({
    id: "default",
    image_path: "snapshots/default.png",
    required: "yes",
    original_width: 16,
    original_height: 12,
    figma_node_id: "1:2",
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(featureDir, "implementation-spec.md"), "# Implementation Spec\n");
  return { rootDir, featureDir };
}

test("prepare creates one draft scenario for each required baseline", () => {
  const { rootDir } = makeFeature();
  const { draft, unresolved } = createDraft(rootDir, "demo");
  assert.equal(draft.baselines.length, 1);
  assert.equal(draft.scenarios.length, 1);
  assert.equal(draft.scenarios[0].baseline_id, "default");
  assert.ok(unresolved.includes("/guardrails/calibrated"));
  assert.ok(unresolved.includes("/scenarios/0/target/locator/value"));
});

test("seal rejects unresolved fields and succeeds after explicit calibration", () => {
  const { rootDir } = makeFeature();
  const { draft } = createDraft(rootDir, "demo");
  assert.ok(validateDraftForSeal(draft).length > 0);
  draft.runtime.start_command = "npm run dev";
  draft.runtime.base_url = "http://127.0.0.1:4173";
  draft.platform.browser_executable = "/tmp/chrome";
  draft.guardrails.calibrated = true;
  draft.scenarios[0].route = "/demo";
  draft.scenarios[0].target.locator.value = "[data-demo]";
  draft.scenarios[0].assertions[0].target.value = "[data-demo]";
  const { contract, findings } = sealDraft(draft, "user", "Chromium 1");
  assert.deepEqual(findings, []);
  assert.equal(contract.status, "sealed");
  assert.equal(contract.contract_hash, contractHash(contract));
});

test("scenario outcome separates visual failure from unstable evidence", () => {
  const guardrails = { pixel_threshold: 0.01, stability_threshold: 0.001 };
  const assertions = [{ id: "visible", status: "pass" }];
  const base = {
    baseline_one: { dimensions_match: true, ratio: 0 },
    baseline_two: { dimensions_match: true, ratio: 0 },
    stability: { dimensions_match: true, ratio: 0 },
    assertions_one: assertions,
    assertions_two: assertions,
  };
  assert.equal(deriveScenarioOutcome(base, guardrails), "PASS");
  assert.equal(deriveScenarioOutcome({ ...base, baseline_one: { dimensions_match: true, ratio: 0.02 } }, guardrails), "FAIL");
  assert.equal(deriveScenarioOutcome({ ...base, stability: { dimensions_match: true, ratio: 0.02 } }, guardrails), "BLOCKED");
  assert.equal(overallOutcome([{ required: true, outcome: "PASS" }]), "PASS");
  assert.equal(overallOutcome([{ required: true, outcome: "FAIL" }]), "FAIL");
});

test("report rendering is deterministic", () => {
  const result = {
    feature: "demo",
    outcome: "PASS",
    contract_hash: "contract",
    subject: { digest: "subject", head: "head" },
    verifier: { name: "figma-implementation-verify-runtime", version: "1.0.0", source_sha256: "verifier" },
    browser: { version: "Chromium 1" },
    scenarios: [{
      id: "default",
      required: true,
      outcome: "PASS",
      baseline_one: { ratio: 0 },
      baseline_two: { ratio: 0 },
      stability: { ratio: 0 },
      assertions_one: [{ id: "visible", type: "visible", status: "pass", expected: true, actual: true }],
      assertions_two: [{ id: "visible", type: "visible", status: "pass", expected: true, actual: true }],
      evidence: { baseline: "baseline", implementation_one: "one", implementation_two: "two" },
    }],
    approved_deviations: [],
  };
  assert.equal(renderReport(result), renderReport(structuredClone(result)));
  assert.match(renderReport(result), /Status: PASS/);
  assert.match(renderReport(result), /Evidence Digests/);
});

test("seal validation rejects remote runtimes and fixture paths outside the feature", () => {
  const { rootDir, featureDir } = makeFeature();
  const { draft } = createDraft(rootDir, "demo");
  draft.runtime.start_command = "npm run dev";
  draft.runtime.base_url = "https://shared.example.com";
  draft.platform.browser_executable = "/tmp/chrome";
  draft.guardrails.calibrated = true;
  draft.scenarios[0].route = "/demo";
  draft.scenarios[0].target.locator.value = "[data-demo]";
  draft.scenarios[0].assertions[0].target.value = "[data-demo]";
  draft.scenarios[0].steps.push({
    type: "mock-route",
    url: "**/api/demo",
    fixture_path: "../../outside.json",
    synthetic: true,
  });
  assert.ok(validateDraftForSeal(draft).includes("runtime.base_url must target the verifier-managed local application"));
  const { findings } = hydrateFixtureHashes(draft, featureDir);
  assert.ok(findings.some((item) => item.includes("fixture missing")));
});
