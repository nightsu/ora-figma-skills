# Implementation Evidence Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the Figma workflow handoff gate so empty or generic `implementation-evidence.md` files cannot pass, and document the required post-coding verification audit.

**Architecture:** Keep the first iteration structural and local to existing workflow files. Add a small Markdown scanner to `figma-engineering-checkpoint.js`, drive it through focused Node tests, and update the `figma-emit-spec` / `figma-workflow` docs so downstream agents must use design tokens and snapshots before claiming implementation complete.

**Tech Stack:** Node.js built-ins (`node:fs`, `node:path`, `node:test`, `node:assert/strict`), Markdown skill docs, existing figma-workflow-suite repository structure.

---

## Spec Source

- `docs/superpowers/specs/2026-06-01-implementation-evidence-quality-gate-design.md`
- `figma-workflow/scripts/figma-engineering-checkpoint.js`
- `figma-workflow/scripts/figma-engineering-checkpoint.test.js`
- `figma-emit-spec/SKILL.md`
- `figma-emit-spec/references/spec-template.md`
- `figma-workflow/SKILL.md`
- `figma-workflow/references/progress-routing.md`

## File Structure

```text
figma-workflow/
├── SKILL.md
├── references/
│   └── progress-routing.md
└── scripts/
    ├── figma-engineering-checkpoint.js
    └── figma-engineering-checkpoint.test.js

figma-emit-spec/
├── SKILL.md
└── references/
    └── spec-template.md
```

## Responsibilities

| File | Responsibility |
|---|---|
| `figma-workflow/scripts/figma-engineering-checkpoint.js` | Infer pre-handoff engineering checkpoint status; add structural quality status for `implementation-evidence.md` |
| `figma-workflow/scripts/figma-engineering-checkpoint.test.js` | Cover missing, incomplete, valid, blocking, and audited skip evidence states |
| `figma-emit-spec/SKILL.md` | Strengthen Phase E generation instructions for evidence quality and post-coding verification |
| `figma-emit-spec/references/spec-template.md` | Strengthen template filling rules and add `implementation-verification.md` contract |
| `figma-workflow/SKILL.md` | Explain incomplete evidence gate behavior and post-coding audit requirement |
| `figma-workflow/references/progress-routing.md` | Update routing details, pre-handoff summary, and skip risk wording |

## Task List

- [ ] **Task 1:** Add failing tests for incomplete evidence quality states
- [ ] **Task 2:** Implement the evidence quality scanner and checkpoint status changes
- [ ] **Task 3:** Update emit-spec and workflow documentation contracts
- [ ] **Task 4:** Run verification, self-review, and commit implementation

---

### Task 1: Add Failing Tests for Incomplete Evidence Quality States

**Files:**
- Modify: `figma-workflow/scripts/figma-engineering-checkpoint.test.js`

- [ ] **Step 1: Add a valid evidence fixture helper**

In `figma-workflow/scripts/figma-engineering-checkpoint.test.js`, add this helper after the existing `write()` helper:

```js
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
```

- [ ] **Step 2: Add direct status tests**

Append these tests after `requires implementation evidence gate before handoff`:

```js
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

test("marks complete implementation evidence as generated", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-valid-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), validImplementationEvidence());

  assert.equal(checkpoint.implementationEvidenceStatus(featureDir), "generated");
});
```

- [ ] **Step 3: Add checkpoint behavior tests for incomplete and skipped evidence**

Append these tests after the direct status tests:

```js
test("blocks handoff when implementation evidence is incomplete", () => {
  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-incomplete-evidence-"));
  write(path.join(featureDir, "implementation-evidence.md"), "# Implementation Evidence — referral-home\n");
  write(path.join(featureDir, "assets-manifest.md"), "# Assets\n");
  write(path.join(featureDir, "validation-report.md"), "# Validation\n");

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
```

- [ ] **Step 4: Run tests and verify they fail**

Run:

```bash
node figma-workflow/scripts/figma-engineering-checkpoint.test.js
```

Expected:

```text
not ok
```

The failure should mention `checkpoint.implementationEvidenceStatus is not a function`. If it fails earlier for a syntax error, fix the test file syntax before continuing.

- [ ] **Step 5: Commit failing tests**

Run:

```bash
git add figma-workflow/scripts/figma-engineering-checkpoint.test.js
git commit -m "test: cover implementation evidence quality gate"
```

Expected commit output includes:

```text
test: cover implementation evidence quality gate
```

---

### Task 2: Implement the Evidence Quality Scanner and Checkpoint Status Changes

**Files:**
- Modify: `figma-workflow/scripts/figma-engineering-checkpoint.js`

- [ ] **Step 1: Add Markdown section helpers**

In `figma-workflow/scripts/figma-engineering-checkpoint.js`, add these helpers after `readTextIfExists()`:

```js
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownSection(text, heading) {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = headingPattern.exec(text);
  if (!match) return "";

  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const nextHeading = /^##\s+/m.exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function evidenceModuleBlocks(text) {
  const section = markdownSection(text, "Evidence by Module");
  if (!section.trim()) return [];

  const headingMatches = [...section.matchAll(/^###\s+.+$/gm)];
  return headingMatches.map((match, index) => {
    const start = match.index + match[0].length;
    const next = headingMatches[index + 1];
    const end = next ? next.index : section.length;
    return {
      heading: match[0],
      body: section.slice(start, end),
    };
  });
}
```

- [ ] **Step 2: Add the evidence quality status function**

Add this function after `productStatus()`:

```js
function implementationEvidenceStatus(featureDir) {
  const evidencePath = path.join(featureDir, "implementation-evidence.md");
  if (!exists(evidencePath)) return "missing";

  const text = readTextIfExists(evidencePath);
  if (!text.trim()) return "incomplete";

  const requiredWholeFilePatterns = [
    /^#\s+Implementation Evidence\b/im,
    /^##\s+Required Files Before Coding\s*$/im,
    /ui-understanding\.md/i,
    /design-token-patch\.md/i,
    /implementation-spec\.md/i,
    /^##\s+Evidence by Module\s*$/im,
    /^##\s+Coding Gate Checklist\s*$/im,
  ];

  if (!requiredWholeFilePatterns.every((pattern) => pattern.test(text))) {
    return "incomplete";
  }

  const moduleBlocks = evidenceModuleBlocks(text);
  if (moduleBlocks.length === 0) return "incomplete";

  const requiredModulePatterns = [
    /Structure evidence/i,
    /Token evidence/i,
    /Behavior\/API evidence/i,
    /Snapshot evidence/i,
    /Do not implement from assumption/i,
  ];

  if (!moduleBlocks.every((block) => requiredModulePatterns.every((pattern) => pattern.test(block.body)))) {
    return "incomplete";
  }

  const checklist = markdownSection(text, "Coding Gate Checklist");
  const hasTokenChecklist = /token|design-token-patch\.md|样式值|Design Tokens?/i.test(checklist);
  const hasSnapshotChecklist = /snapshot|visual baseline|visual validation|视觉验证|视觉基线/i.test(checklist);

  return hasTokenChecklist && hasSnapshotChecklist ? "generated" : "incomplete";
}
```

- [ ] **Step 3: Use the evidence status in `inferEngineeringCheckpoint()`**

In the `Implementation evidence gate` item, replace the `status` property with:

```js
    status: checkpoint === "pre-handoff"
      ? implementationEvidenceStatus(featureDir)
      : "not_applicable",
```

In the same item, replace `reason` and `risk` with:

```js
    reason: checkpoint === "pre-handoff"
      ? "pre-handoff must include module-level structure, token, behavior, and snapshot evidence"
      : "available when the user asks about implementation evidence or handoff readiness",
    risk: "implementation may ignore design-token-patch.md or skip snapshot validation",
```

- [ ] **Step 4: Let audited skip handle incomplete status**

Replace `applyAuditedSkips()` with:

```js
function applyAuditedSkips(featureDir, checkpoint, items) {
  return items.map((item) => {
    const skippableStatus = ["missing", "incomplete"].includes(item.status);
    if (!skippableStatus || !hasSkipAudit(featureDir, checkpoint, item.skill)) {
      return item;
    }

    return { ...item, status: "skipped" };
  });
}
```

- [ ] **Step 5: Export the status helper for tests**

In `module.exports`, add `implementationEvidenceStatus`:

```js
module.exports = {
  appendSkipAudit,
  canContinueToHandoff,
  implementationEvidenceStatus,
  inferEngineeringCheckpoint,
  renderEngineeringCheckpoint,
};
```

- [ ] **Step 6: Run the checkpoint tests**

Run:

```bash
node figma-workflow/scripts/figma-engineering-checkpoint.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 7: Commit implementation**

Run:

```bash
git add figma-workflow/scripts/figma-engineering-checkpoint.js
git commit -m "feat: validate implementation evidence quality"
```

Expected commit output includes:

```text
feat: validate implementation evidence quality
```

---

### Task 3: Update Emit-Spec and Workflow Documentation Contracts

**Files:**
- Modify: `figma-emit-spec/SKILL.md`
- Modify: `figma-emit-spec/references/spec-template.md`
- Modify: `figma-workflow/SKILL.md`
- Modify: `figma-workflow/references/progress-routing.md`

- [ ] **Step 1: Update `figma-emit-spec/SKILL.md` evidence workflow**

In `figma-emit-spec/SKILL.md`, within workflow step 5, replace the current evidence bullets with:

```markdown
   - 按 feature 汇总后续实现必须读取的证据链
   - `implementation-evidence.md` 是 coding gate,不是 `implementation-spec.md` 的摘要
   - 每个 module 必须包含 Structure evidence / Token evidence / Behavior/API evidence / Snapshot evidence / Do not implement from assumption
   - 结构、控件形态、可见文案来自 `ui-understanding.md`
   - 尺寸、间距、颜色、圆角、字号、状态样式来自 `design-token-patch.md`
   - Token evidence 必须是 module 级证据,不能只写"见 design-token-patch.md"
   - 接口、状态、交互、异常态来自 `implementation-spec.md` 与 `api-mapping.md`
   - 视觉基线来自 `snapshots/default.png`、`assets-manifest.md` 或 `validation-report.md`;若 P15 尚未运行,写 `<missing>` / `<待 P15 回填>` 并标为 verification risk
   - 列出 `Do Not Implement From Assumption` 清单,禁止用常见 AntD 组件形态替代 Figma 证据
   - 下游 coding 完成前必须产出 `implementation-verification.md`
```

- [ ] **Step 2: Update the `implementation-evidence.md` template in `figma-emit-spec/SKILL.md`**

Replace the template block under `### implementation-evidence.md 模板` with:

````markdown
```markdown
# Implementation Evidence — <feature>

> Required coding gate. Do not implement from `implementation-spec.md` alone.
> Generated by figma-emit-spec@<version> at <ISO8601>

## Required Files Before Coding
| Evidence Type | File | Must Read | Purpose |
|---|---|---|---|
| Requirement | clarified-requirement.md | yes | scope / copy / constraints |
| UI Structure | ui-understanding.md | yes | layout, control shape, visible labels, non-implementation notes |
| API Mapping | api-mapping.md | yes | endpoint and field source |
| Component Mapping | component-mapping.md | yes | UI slot to API binding |
| Design Tokens | design-token-patch.md | yes | module-level dimensions, spacing, colors, radius, typography, states |
| Implementation Spec | implementation-spec.md | yes | behavior, state, integration constraints |
| Snapshot | snapshots/default.png | when present | visual baseline validation |

## Evidence by Module
### <ModuleName>
- Structure evidence: `ui-understanding.md#...`
- Token evidence: `design-token-patch.md#...` plus key tokens: `<token-name>=<value>`
- Behavior/API evidence: `implementation-spec.md#...` / `api-mapping.md#...`
- Snapshot evidence: `snapshots/default.png` / `<missing>` / `<待 P15 回填>`
- Do not implement from assumption:
  - <例如: 不要把表头排序实现成顶部 Tab / Radio,除非 ui-understanding 明确如此>

## Conflict / Deviation Log
| Item | Upstream Conflict or Deviation | Decision | Owner |
|---|---|---|---|
| <待记录> | <冲突描述> | <采用依据> | <human/agent> |

## Coding Gate Checklist
- [ ] 每个 feature 编码前已读完 Required Files
- [ ] 控件形态有 `ui-understanding.md` 依据
- [ ] 样式值有 `design-token-patch.md` 的 module-level token evidence
- [ ] 视觉验证使用 snapshot / visual baseline,但不以 snapshot 替代 token
- [ ] 任何 intentional deviation 已写入 Conflict / Deviation Log
```
````

- [ ] **Step 3: Add the `implementation-verification.md` template to `figma-emit-spec/SKILL.md`**

After the `implementation-evidence.md` template, add:

````markdown
### `implementation-verification.md` 下游审计模板

```markdown
# Implementation Verification — <feature>

> Required before claiming coding complete.

## Evidence Read
| File | Read | Notes |
|---|---|---|
| implementation-evidence.md | yes/no |  |
| ui-understanding.md | yes/no |  |
| design-token-patch.md | yes/no |  |
| implementation-spec.md | yes/no |  |
| assets-manifest.md / validation-report.md | yes/no/none |  |

## Token Application
| Module | Token Source | Applied In | Notes |
|---|---|---|---|

## Snapshot / Visual Baseline Check
| Baseline | Compared | Result | Notes |
|---|---|---|---|

## Intentional Deviations
| Item | Deviation | Reason | Approved By |
|---|---|---|---|

## Final Checklist
- [ ] Style values were taken from `design-token-patch.md`
- [ ] Control shape and visible copy were checked against `ui-understanding.md`
- [ ] Required snapshots or visual baselines were compared
- [ ] Intentional deviations are recorded above
```
````

- [ ] **Step 4: Update `figma-emit-spec/references/spec-template.md`**

Mirror the same `implementation-evidence.md` template and `implementation-verification.md` downstream audit template in `figma-emit-spec/references/spec-template.md`. In the `Evidence by Module` rules, replace the current token and snapshot bullets with:

```markdown
- Token evidence 必须指向 `design-token-patch.md` 中的具体 token 段,并列出关键 token 名和值
- Snapshot evidence 必须指向 `snapshots/default.png`、P15 visual baseline,或显式写 `<missing>` / `<待 P15 回填>`
- 若某类证据缺失,写 `<missing>` 并同步写入 `open-questions.md` 或 verification risk
- 下游 coding 完成前必须填写 `implementation-verification.md`
```

- [ ] **Step 5: Update `figma-workflow/SKILL.md` implementation evidence gate section**

In `figma-workflow/SKILL.md`, replace the first paragraph under `### Implementation evidence gate` with:

```markdown
`implementation-spec.md` 不是编码阶段的唯一输入。handoff 前必须生成质量合格的 `implementation-evidence.md`,或由用户显式 skip 并写入 audit。缺失和不完整都不能静默进入 handoff。
```

Add this paragraph after the existing evidence bullet list:

```markdown
`implementation-evidence.md` 若缺少 module-level token evidence、snapshot evidence、coding checklist,工程化检查状态为 `incomplete`。`incomplete` 与 `missing` 一样会阻止 handoff,除非用户显式 skip。skip 风险必须说明:后续实现可能不遵守 `design-token-patch.md`,也可能不做 snapshot / visual baseline validation。
```

Add this paragraph after the paragraph that starts with `下游实现 agent`:

```markdown
下游 coding agent 完成实现前必须留下 `implementation-verification.md`,记录已读证据文件、token 应用位置、snapshot / visual baseline 对比结果和 intentional deviations。只有普通构建或单元测试通过,不能视为完成设计验证。
```

- [ ] **Step 6: Update `figma-workflow/references/progress-routing.md`**

Replace the existing sentence:

```markdown
`implementation-spec.md` 不是 coding 阶段唯一输入。handoff 前必须生成或显式 skip `implementation-evidence.md`;后续实现 agent 必须根据该文件读取 `ui-understanding.md`、`design-token-patch.md`、`implementation-spec.md` 和 snapshot baseline。
```

with:

```markdown
`implementation-spec.md` 不是 coding 阶段唯一输入。handoff 前必须生成质量合格的 `implementation-evidence.md`,或显式 skip 并写入 audit。缺失或不完整都会阻止 handoff。后续实现 agent 必须根据该文件读取 `ui-understanding.md`、`design-token-patch.md`、`implementation-spec.md` 和 snapshot baseline,并在完成前留下 `implementation-verification.md`。
```

In the `Risk notes` example, add:

```markdown
  - implementation-evidence.md skipped: downstream implementation may ignore design-token-patch.md or skip snapshot validation
```

- [ ] **Step 7: Run documentation grep checks**

Run:

```bash
rg -n "implementation-verification|module-level|incomplete|snapshot validation|design-token-patch.md" figma-emit-spec figma-workflow
```

Expected:

```text
figma-emit-spec/SKILL.md
figma-emit-spec/references/spec-template.md
figma-workflow/SKILL.md
figma-workflow/references/progress-routing.md
figma-workflow/scripts/figma-engineering-checkpoint.js
```

The exact line numbers may differ.

- [ ] **Step 8: Commit documentation updates**

Run:

```bash
git add figma-emit-spec/SKILL.md figma-emit-spec/references/spec-template.md figma-workflow/SKILL.md figma-workflow/references/progress-routing.md
git commit -m "docs: require evidence verification audit"
```

Expected commit output includes:

```text
docs: require evidence verification audit
```

---

### Task 4: Run Verification, Self-Review, and Commit Implementation

**Files:**
- Verify: `figma-workflow/scripts/figma-engineering-checkpoint.test.js`
- Verify: `figma-workflow/scripts/figma-validate-contracts.test.js`
- Verify: `figma-workflow/scripts/figma-cache.test.js`
- Verify: `figma-workflow/scripts/figma-diff.test.js`
- Verify: `figma-workflow/scripts/figma-validate-contracts.js`

- [ ] **Step 1: Run focused checkpoint tests**

Run:

```bash
node figma-workflow/scripts/figma-engineering-checkpoint.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 2: Run all workflow script tests**

Run:

```bash
node --test figma-workflow/scripts/*.test.js
```

Expected:

```text
# pass
```

- [ ] **Step 3: Run whitespace check on all changes**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 4: Review changed files**

Run:

```bash
git status --short
git diff --stat
git diff -- figma-workflow/scripts/figma-engineering-checkpoint.js
git diff -- figma-workflow/scripts/figma-engineering-checkpoint.test.js
```

Expected:

- changed files match this plan
- no business project files are changed
- `implementationEvidenceStatus` returns only `missing`, `incomplete`, or `generated`
- `applyAuditedSkips` handles both `missing` and `incomplete`
- `canContinueToHandoff` still treats only `generated`, `skipped`, and `not_applicable` as handled required prompt statuses

- [ ] **Step 5: Review documentation changes**

Run:

```bash
git diff -- figma-emit-spec/SKILL.md figma-emit-spec/references/spec-template.md figma-workflow/SKILL.md figma-workflow/references/progress-routing.md
```

Expected:

- docs say `implementation-evidence.md` is a coding gate, not a summary
- docs say incomplete evidence blocks handoff
- docs require module-level token evidence
- docs require snapshot or visual baseline validation
- docs require `implementation-verification.md` before coding completion

- [ ] **Step 6: Create final implementation commit if Tasks 1-3 were not committed separately**

If previous tasks were committed separately, skip this step. If changes are still unstaged, run:

```bash
git add figma-workflow/scripts/figma-engineering-checkpoint.js \
        figma-workflow/scripts/figma-engineering-checkpoint.test.js \
        figma-emit-spec/SKILL.md \
        figma-emit-spec/references/spec-template.md \
        figma-workflow/SKILL.md \
        figma-workflow/references/progress-routing.md
git commit -m "feat: enforce implementation evidence quality gate"
```

Expected commit output includes:

```text
feat: enforce implementation evidence quality gate
```

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short --branch
git log --oneline -4
```

Expected:

- working tree is clean
- recent commits include the evidence quality gate implementation and documentation commits

---

## Self-Review Checklist

- [ ] The plan covers pre-handoff quality scanning.
- [ ] The plan covers `missing`, `incomplete`, `generated`, and `skipped` statuses.
- [ ] The plan covers audited skip for incomplete evidence.
- [ ] The plan covers design-token and snapshot failure modes from the user report.
- [ ] The plan covers post-coding `implementation-verification.md` documentation.
- [ ] The plan does not require raw Figma JSON, business code inspection, pixel regression, or a Markdown AST parser.
- [ ] The plan keeps the repository boundary intact: skills prepare handoff materials and do not modify business project code.
