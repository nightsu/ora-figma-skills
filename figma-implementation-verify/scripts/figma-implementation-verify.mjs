#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  EXIT_CODES,
  canonicalResult,
  compareImages,
  contractHash,
  createDraft,
  deriveScenarioOutcome,
  featurePaths,
  hydrateFixtureHashes,
  overallOutcome,
  renderReport,
  resolveFeaturePath,
  sealDraft,
  sha256File,
  stableStringify,
  validateSealedContract,
  verificationSubject,
} from "./core.mjs";
import { BlockedError, detectBrowserVersion, runVerification } from "./runtime.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) options[key] = true;
    else {
      options[key] = value;
      index += 1;
    }
  }
  return { command, options };
}

function requireFeature(options) {
  if (!options.feature) throw new BlockedError("--feature is required");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.feature)) throw new BlockedError("feature must use kebab-case");
  return options.feature;
}

function rootFrom(options) {
  return path.resolve(options.root || process.cwd());
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, canonicalResult(value));
}

function timestampId() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function copyCanonicalEvidence(paths, result, runDir) {
  const nextDir = `${paths.canonicalDir}.next`;
  fs.rmSync(nextDir, { recursive: true, force: true });
  fs.mkdirSync(nextDir, { recursive: true });
  for (const scenario of result.scenarios) {
    fs.cpSync(path.join(runDir, scenario.id), path.join(nextDir, scenario.id), { recursive: true });
  }
  fs.rmSync(paths.canonicalDir, { recursive: true, force: true });
  fs.renameSync(nextDir, paths.canonicalDir);
}

async function prepareCommand(rootDir, feature) {
  const { paths, unresolved } = createDraft(rootDir, feature);
  console.log(`draft: ${paths.draftPath}`);
  console.log(`unresolved: ${unresolved.length}`);
  for (const pointer of unresolved) console.log(`- ${pointer}`);
  return 0;
}

async function sealCommand(rootDir, feature, options) {
  const paths = featurePaths(rootDir, feature);
  if (!fs.existsSync(paths.draftPath)) throw new BlockedError(`draft does not exist: ${paths.draftPath}`);
  const draftInput = readJson(paths.draftPath);
  const { draft, findings: fixtureFindings } = hydrateFixtureHashes(draftInput, paths.featureDir);
  if (fixtureFindings.length) throw new BlockedError(`contract fixtures are invalid:\n${fixtureFindings.map((item) => `- ${item}`).join("\n")}`);
  const browserPath = draft.platform?.browser_executable;
  if (!browserPath || !fs.existsSync(browserPath)) throw new BlockedError(`browser executable does not exist: ${browserPath}`);
  const browserVersion = await detectBrowserVersion(browserPath);
  const { contract, findings } = sealDraft(draft, options.approved_by, browserVersion);
  if (findings.length) throw new BlockedError(`contract cannot be sealed:\n${findings.map((item) => `- ${item}`).join("\n")}`);
  const sealedFindings = validateSealedContract(paths.featureDir, contract);
  if (sealedFindings.length) throw new BlockedError(`contract evidence changed before seal:\n${sealedFindings.map((item) => `- ${item}`).join("\n")}`);
  writeJson(paths.contractPath, contract);
  console.log(`sealed: ${paths.contractPath}`);
  console.log(`contract_hash: ${contract.contract_hash}`);
  return 0;
}

async function verifyCommand(rootDir, feature) {
  const paths = featurePaths(rootDir, feature);
  if (!fs.existsSync(paths.contractPath)) throw new BlockedError(`sealed contract does not exist: ${paths.contractPath}`);
  const contract = readJson(paths.contractPath);
  const findings = validateSealedContract(paths.featureDir, contract);
  if (findings.length) throw new BlockedError(`sealed contract is invalid:\n${findings.map((item) => `- ${item}`).join("\n")}`);
  const runDir = path.join(paths.runsDir, timestampId());
  let result;
  try {
    result = await runVerification(rootDir, paths.featureDir, contract, runDir);
  } catch (error) {
    const outcome = error instanceof BlockedError ? "BLOCKED" : "ERROR";
    const diagnostic = { feature, generated_at: new Date().toISOString(), outcome, error: error.stack || error.message };
    writeJson(path.join(runDir, "verification-result.json"), diagnostic);
    fs.writeFileSync(path.join(runDir, "implementation-verification.md"), `# Implementation Verification — ${feature}\n\n- Status: ${outcome}\n- Error: ${error.message}\n`);
    throw error;
  }
  writeJson(path.join(runDir, "verification-result.json"), result);
  fs.writeFileSync(path.join(runDir, "implementation-verification.md"), renderReport(result));
  console.log(`run: ${runDir}`);
  console.log(`outcome: ${result.outcome}`);
  if (result.outcome === "PASS") {
    const canonical = structuredClone(result);
    copyCanonicalEvidence(paths, canonical, runDir);
    writeJson(paths.resultPath, canonical);
    fs.writeFileSync(paths.reportPath, renderReport(canonical));
    console.log(`canonical_report: ${paths.reportPath}`);
  }
  return EXIT_CODES[result.outcome];
}

function recomputeCanonicalScenario(paths, contract, storedScenario, checkDir) {
  const scenario = contract.scenarios.find((item) => item.id === storedScenario.id);
  const baseline = contract.baselines.find((item) => item.id === scenario?.baseline_id);
  if (!scenario || !baseline) throw new BlockedError(`canonical scenario is not in contract: ${storedScenario.id}`);
  const scenarioDir = path.join(paths.canonicalDir, scenario.id);
  const implementationOne = path.join(scenarioDir, "implementation-1.png");
  const implementationTwo = path.join(scenarioDir, "implementation-2.png");
  const baselinePath = resolveFeaturePath(paths.featureDir, baseline.image_path);
  for (const filePath of [implementationOne, implementationTwo, baselinePath]) {
    if (!fs.existsSync(filePath)) throw new BlockedError(`canonical evidence missing: ${filePath}`);
  }
  for (const [captureName, assertions] of [["one", storedScenario.assertions_one], ["two", storedScenario.assertions_two]]) {
    if (!Array.isArray(assertions)) throw new BlockedError(`scenario ${scenario.id} assertions_${captureName} are missing`);
    const expectedIds = scenario.assertions.map((item) => item.id);
    const actualIds = assertions.map((item) => item.id);
    if (stableStringify(actualIds) !== stableStringify(expectedIds)) throw new BlockedError(`scenario ${scenario.id} assertion coverage changed in capture ${captureName}`);
    for (let index = 0; index < scenario.assertions.length; index += 1) {
      const expected = scenario.assertions[index];
      const actual = assertions[index];
      if (actual.type !== expected.type || stableStringify(actual.expected) !== stableStringify(expected.expected)) {
        throw new BlockedError(`scenario ${scenario.id} assertion ${expected.id} contract fields changed in capture ${captureName}`);
      }
      if (!new Set(["pass", "fail"]).has(actual.status)) throw new BlockedError(`scenario ${scenario.id} assertion ${expected.id} has invalid status`);
    }
  }
  const options = { masks: scenario.masks, pixelmatchThreshold: contract.guardrails.pixelmatch_threshold };
  const scenarioCheckDir = path.join(checkDir, scenario.id);
  fs.mkdirSync(scenarioCheckDir, { recursive: true });
  const baselineOne = compareImages(baselinePath, implementationOne, path.join(scenarioCheckDir, "baseline-1.diff.png"), options);
  const baselineTwo = compareImages(baselinePath, implementationTwo, path.join(scenarioCheckDir, "baseline-2.diff.png"), options);
  const stability = compareImages(implementationOne, implementationTwo, path.join(scenarioCheckDir, "stability.diff.png"), options);
  const comparisons = {
    baseline_one: baselineOne,
    baseline_two: baselineTwo,
    stability,
    assertions_one: storedScenario.assertions_one,
    assertions_two: storedScenario.assertions_two,
  };
  const evidence = {
    baseline: sha256File(baselinePath),
    implementation_one: sha256File(implementationOne),
    implementation_two: sha256File(implementationTwo),
  };
  if (stableStringify(storedScenario.evidence) !== stableStringify(evidence)) {
    throw new BlockedError(`scenario ${scenario.id} evidence digest changed`);
  }
  return {
    ...storedScenario,
    required: scenario.required,
    baseline_id: scenario.baseline_id,
    outcome: deriveScenarioOutcome(comparisons, contract.guardrails),
    ...comparisons,
    evidence,
  };
}

async function checkCommand(rootDir, feature) {
  const paths = featurePaths(rootDir, feature);
  for (const requiredPath of [paths.contractPath, paths.resultPath, paths.reportPath, paths.canonicalDir]) {
    if (!fs.existsSync(requiredPath)) throw new BlockedError(`canonical verification evidence missing: ${requiredPath}`);
  }
  const contract = readJson(paths.contractPath);
  const stored = readJson(paths.resultPath);
  const findings = validateSealedContract(paths.featureDir, contract);
  if (findings.length) throw new BlockedError(findings.join("\n"));
  if (stored.schema_version !== 1 || stored.feature !== contract.feature) throw new BlockedError("canonical result identity does not match the contract");
  if (stored.outcome !== "PASS") throw new BlockedError("canonical result is not PASS");
  if (stored.contract_hash !== contractHash(contract)) throw new BlockedError("result contract hash does not match sealed contract");
  if (stableStringify(stored.verifier) !== stableStringify(contract.verifier)) throw new BlockedError("canonical verifier does not match sealed contract");
  if (stored.browser?.engine !== "playwright-chromium" || stored.browser?.version !== contract.platform.browser_version) throw new BlockedError("canonical browser does not match sealed contract");
  if (stableStringify(stored.approved_deviations || []) !== stableStringify(contract.approved_deviations || [])) throw new BlockedError("canonical deviations do not match sealed contract");
  const expectedScenarioIds = contract.scenarios.map((scenario) => scenario.id);
  const storedScenarioIds = (stored.scenarios || []).map((scenario) => scenario.id);
  if (stableStringify(storedScenarioIds) !== stableStringify(expectedScenarioIds)) throw new BlockedError("canonical scenario coverage does not match sealed contract");
  const subject = verificationSubject(rootDir, contract);
  if (subject.digest !== stored.subject.digest) throw new BlockedError("Verification Subject changed after PASS");
  const checkDir = path.join(paths.runsDir, `check-${timestampId()}`);
  const scenarios = stored.scenarios.map((scenario) => recomputeCanonicalScenario(paths, contract, scenario, checkDir));
  const recomputedOutcome = overallOutcome(scenarios);
  if (recomputedOutcome !== stored.outcome) throw new BlockedError(`stored outcome ${stored.outcome} differs from recomputed ${recomputedOutcome}`);
  const recomputed = { ...stored, scenarios, outcome: recomputedOutcome };
  if (fs.readFileSync(paths.reportPath, "utf8") !== renderReport(recomputed)) throw new BlockedError("implementation-verification.md was edited or is stale");
  console.log(`outcome: ${recomputedOutcome}`);
  console.log(`subject: ${subject.digest}`);
  return EXIT_CODES[recomputedOutcome];
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const feature = requireFeature(options);
  const rootDir = rootFrom(options);
  if (command === "prepare") return prepareCommand(rootDir, feature);
  if (command === "seal") return sealCommand(rootDir, feature, options);
  if (command === "verify") return verifyCommand(rootDir, feature);
  if (command === "check") return checkCommand(rootDir, feature);
  throw new BlockedError("command must be one of: prepare, seal, verify, check");
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    const outcome = error instanceof BlockedError ? "BLOCKED" : "ERROR";
    console.error(`${outcome}: ${error.message}`);
    process.exitCode = EXIT_CODES[outcome];
  });
