const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const checkpoint = require("./figma-engineering-checkpoint.js");

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function validImplementationEvidence() {
  return [
    "# Implementation Evidence — referral-home",
    "",
    "> Required coding gate. Do not implement from `implementation-spec.md` alone.",
    "",
    "## Required Files Before Coding",
    "| Evidence Type | File | Must Read | Purpose |",
    "|---|---|---|---|",
    "| UI Structure | ui-understanding.md | yes | layout, control shape, visible labels |",
    "| Design Tokens | design-token-patch.md | yes | dimensions, spacing, colors, radius, typography, states |",
    "| Implementation Spec | implementation-spec.md | yes | behavior, state, integration constraints |",
    "",
    "## Evidence by Module",
    "### ReferralHero",
    "- Structure evidence: `ui-understanding.md#referralhero`",
    "- Token evidence: `design-token-patch.md#referralhero`",
    "- Behavior/API evidence: `implementation-spec.md#referralhero`",
    "- Snapshot evidence: `snapshots/default.png`",
    "- Do not implement from assumption:",
    "  - Do not replace the hero CTA shape with a default primary button unless ui-understanding records it.",
    "",
    "## Conflict / Deviation Log",
    "| Item | Upstream Conflict or Deviation | Decision | Owner |",
    "|---|---|---|---|",
    "| none | none | follow upstream evidence | human |",
    "",
    "## Coding Gate Checklist",
    "- [ ] Style values were checked against token evidence from `design-token-patch.md`",
    "- [ ] Snapshot / visual baseline validation is required before completion",
    "- [ ] Intentional deviations are recorded in the deviation log",
    "",
  ].join("\n");
}

test("infers required pre-handoff prompts from feature products", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-checkpoint-"));
  write(path.join(featureDir, "implementation-spec.md"), "# Implementation Spec\n");
  write(path.join(featureDir, "open-questions.md"), "# Open Questions\n- [ ] confirm metric copy\n");
  write(path.join(featureDir, ".figma-cache/snapshots/baseline/metadata.file.1-2.json"), "{}\n");
  write(path.join(featureDir, ".figma-cache/snapshots/current/metadata.file.1-2.json"), "{}\n");

  const state = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });

  assert.equal(state.items.find((item) => item.skill === "figma-design-diff").status, "missing");
  assert.equal(state.items.find((item) => item.skill === "figma-design-diff").recommendation, "required_prompt");
  assert.equal(state.items.find((item) => item.skill === "figma-ui-handoff").recommendation, "recommended");
  assert.equal(state.items.find((item) => item.skill === "figma-assets-validate").recommendation, "required_prompt");
  assert.equal(state.items.find((item) => item.skill === "figma-implementation-verify").status, "missing");
  assert.equal(state.items.find((item) => item.skill === "figma-implementation-verify").recommendation, "required_prompt");
});

test("renders checkpoint and allows continue after required prompts are handled", () => {
  const state = {
    checkpoint: "pre-handoff",
    items: [
      {
        label: "Design diff",
        skill: "figma-design-diff",
        product: "design-diff.md",
        status: "generated",
        recommendation: "required_prompt",
        reason: "cache snapshots detected",
      },
      {
        label: "Assets / visual validation",
        skill: "figma-assets-validate",
        product: "assets-manifest.md, validation-report.md",
        status: "skipped",
        recommendation: "required_prompt",
        reason: "pre-handoff assets, visual baselines, and spec-snapshot checks are recommended before planning",
      },
    ],
  };

  assert.equal(checkpoint.canContinueToHandoff(state), true);
  const rendered = checkpoint.renderEngineeringCheckpoint(state);
  assert.match(rendered, /交接前工程化检查/);
  assert.doesNotMatch(rendered, /\bv4\b/i);
  assert.match(rendered, /figma-design-diff/);
  assert.match(rendered, /Assets \/ visual validation/);
  assert.match(rendered, /\[C\] Continue to handoff menu/);
});

test("requires every file in a combined product before marking it generated", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-combined-product-"));
  write(path.join(featureDir, "assets-manifest.md"), "# Assets\n");

  const state = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });
  const assets = state.items.find((item) => item.skill === "figma-assets-validate");

  assert.equal(assets.status, "missing");
});

test("marks implementation verification draft generated before planning handoff", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-verification-draft-"));
  write(path.join(featureDir, "verification-contract.draft.json"), "{\"status\":\"draft\"}\n");

  const state = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });
  const verification = state.items.find((item) => item.skill === "figma-implementation-verify");

  assert.equal(verification.product, "verification-contract.draft.json");
  assert.equal(verification.status, "generated");
  assert.equal(verification.recommendation, "required_prompt");
});

test("requires implementation evidence gate before handoff", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-evidence-gate-"));
  write(path.join(featureDir, "implementation-spec.md"), "# Implementation Spec\n");
  write(path.join(featureDir, "assets-manifest.md"), "# Assets\n");
  write(path.join(featureDir, "validation-report.md"), "# Validation\n");

  const state = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });
  const evidence = state.items.find((item) => item.skill === "figma-emit-spec");

  assert.equal(evidence.label, "Implementation evidence gate");
  assert.equal(evidence.product, "implementation-evidence.md");
  assert.equal(evidence.status, "missing");
  assert.equal(evidence.recommendation, "required_prompt");
  assert.equal(checkpoint.canContinueToHandoff(state), false);
});

test("marks empty implementation evidence as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-empty-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), "");

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("marks title-only implementation evidence as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-title-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), "# Implementation Evidence — referral-home\n");

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("marks implementation evidence without module blocks as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-no-module-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), [
    "# Implementation Evidence — referral-home",
    "",
    "## Required Files Before Coding",
    "- ui-understanding.md",
    "- design-token-patch.md",
    "- implementation-spec.md",
    "",
    "## Evidence by Module",
    "",
    "## Coding Gate Checklist",
    "- [ ] Token evidence was checked",
    "- [ ] Snapshot validation was checked",
    "",
  ].join("\n"));

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("marks implementation evidence without token evidence as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-no-token-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence().replace(
    "- Token evidence: `design-token-patch.md#referralhero`\n",
    ""
  ));

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("marks implementation evidence without snapshot evidence as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-no-snapshot-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence().replace(
    "- Snapshot evidence: `snapshots/default.png`\n",
    ""
  ));

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("marks missing token evidence value as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-missing-token-value-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence().replace(
    "- Token evidence: `design-token-patch.md#referralhero`",
    "- Token evidence: <missing>"
  ));

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("marks missing snapshot evidence value as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-missing-snapshot-value-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence().replace(
    "- Snapshot evidence: `snapshots/default.png`",
    "- Snapshot evidence: <missing>"
  ));

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("marks complete implementation evidence as generated", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-valid-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence());

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "generated");
});

test("marks unresolved structured layout token gaps as incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-structured-token-gap-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence());
  write(path.join(featureDir, "open-questions.md"), [
    "# Open Questions — structured-layout",
    "",
    "## From Phase D (design-token-patch.md, INFERRED)",
    "- [ ] StudentDetails.nested.column.content.width 未从 Figma evidence 中抽出,实现前需补充列宽 token 或由设计确认。",
    "",
  ].join("\n"));

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "incomplete");
});

test("ignores resolved structured layout token questions", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-resolved-structured-token-gap-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence());
  write(path.join(featureDir, "open-questions.md"), [
    "# Open Questions — structured-layout",
    "",
    "## From Phase D (design-token-patch.md, INFERRED)",
    "- [x] StudentDetails.nested.column.content.width 已由设计确认。",
    "",
  ].join("\n"));

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "generated");
});

test("blocks handoff when implementation evidence is incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-incomplete-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), "# Implementation Evidence — referral-home\n");
  write(path.join(featureDir, "assets-manifest.md"), "# Assets\n");
  write(path.join(featureDir, "validation-report.md"), "# Validation\n");
  write(path.join(featureDir, "verification-contract.draft.json"), "{\"status\":\"draft\"}\n");

  const state = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });
  const evidence = state.items.find((item) => item.skill === "figma-emit-spec");

  assert.equal(evidence.status, "incomplete");
  assert.equal(evidence.recommendation, "required_prompt");
  assert.equal(checkpoint.canContinueToHandoff(state), false);
});

test("treats audited incomplete implementation evidence skip as handled", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-skip-incomplete-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), "# Implementation Evidence — referral-home\n");
  write(path.join(featureDir, "assets-manifest.md"), "# Assets\n");
  write(path.join(featureDir, "validation-report.md"), "# Validation\n");
  write(path.join(featureDir, "verification-contract.draft.json"), "{\"status\":\"draft\"}\n");

  const firstState = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });
  const skipped = firstState.items.filter((item) => item.skill === "figma-emit-spec");

  checkpoint.appendSkipAudit(featureDir, {
    checkpoint: "pre-handoff",
    phaseContext: "after_phase_e_review",
    skipped,
    continueField: "continue_to_handoff",
    now: "2026-06-01T12:00:00+08:00",
  });

  const nextState = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });
  const evidence = nextState.items.find((item) => item.skill === "figma-emit-spec");

  assert.equal(evidence.status, "skipped");
  assert.equal(checkpoint.canContinueToHandoff(nextState), true);
});

test("appends skip audit without changing products", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-skip-audit-"));
  const item = {
    skill: "figma-assets-validate",
    product: "assets-manifest.md, validation-report.md",
    recommendation: "required_prompt",
    reason: "pre-handoff assets, visual baselines, and spec-snapshot checks are recommended before planning",
    risk: "assets, visual baselines, and spec-snapshot consistency not reviewed before handoff",
  };

  checkpoint.appendSkipAudit(featureDir, {
    checkpoint: "pre-handoff",
    phaseContext: "after_phase_e_review",
    skipped: [item],
    continueField: "continue_to_handoff",
    now: "2026-05-21T12:00:00+08:00",
  });

  const audit = fs.readFileSync(path.join(featureDir, "inputs.md"), "utf8");
  assert.match(audit, /figma-workflow@v4-checkpoint/);
  assert.doesNotMatch(audit, /engineering-checkpoint/);
  assert.match(audit, /skill: figma-assets-validate/);
  assert.match(audit, /continue_to_handoff: true/);
  assert.equal(fs.existsSync(path.join(featureDir, "assets-manifest.md")), false);
});

test("treats audited skips as handled on later inference", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-skip-state-"));
  write(path.join(featureDir, ".figma-cache/snapshots/baseline/metadata.file.1-2.json"), "{}\n");
  write(path.join(featureDir, ".figma-cache/snapshots/current/metadata.file.1-2.json"), "{}\n");

  const firstState = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });
  const skipped = firstState.items.filter((item) => item.recommendation === "required_prompt");

  checkpoint.appendSkipAudit(featureDir, {
    checkpoint: "pre-handoff",
    phaseContext: "after_phase_e_review",
    skipped,
    continueField: "continue_to_handoff",
    now: "2026-05-21T12:00:00+08:00",
  });

  const nextState = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });

  assert.equal(nextState.items.find((item) => item.skill === "figma-design-diff").status, "skipped");
  assert.equal(nextState.items.find((item) => item.skill === "figma-assets-validate").status, "skipped");
  assert.equal(checkpoint.canContinueToHandoff(nextState), true);
});

test("recognizes legacy engineering-checkpoint skip audits", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-legacy-skip-"));
  write(path.join(featureDir, ".figma-cache/snapshots/baseline/metadata.file.1-2.json"), "{}\n");
  write(path.join(featureDir, ".figma-cache/snapshots/current/metadata.file.1-2.json"), "{}\n");
  write(path.join(featureDir, "inputs.md"), [
    "## 2026-05-21T12:00:00+08:00 — figma-workflow@engineering-checkpoint",
    "",
    "- checkpoint: pre-handoff",
    "- phase_context: after_phase_e_review",
    "- action: skip",
    "- skipped:",
    "  - skill: figma-design-diff",
    "    product: design-diff.md",
    "    recommendation: required_prompt",
    "    reason: cache snapshots detected",
    "    risk: design changes not reviewed before handoff",
    "",
  ].join("\n"));

  const state = checkpoint.inferEngineeringCheckpoint(featureDir, { checkpoint: "pre-handoff" });

  assert.equal(state.items.find((item) => item.skill === "figma-design-diff").status, "skipped");
});
