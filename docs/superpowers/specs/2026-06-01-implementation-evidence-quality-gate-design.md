# Implementation Evidence Quality Gate — Design Spec

> Date: 2026-06-01
> Status: Draft, awaiting user review
> Owner: @su
> Builds on:
> - `docs/superpowers/specs/2026-05-21-figma-workflow-suite-v4/README.md`
> - `docs/superpowers/specs/2026-05-21-figma-assets-validation/README.md`
> - `figma-workflow/scripts/figma-engineering-checkpoint.js`
> - `figma-emit-spec/references/spec-template.md`

---

## TL;DR

The latest evidence gate makes `implementation-evidence.md` a required pre-handoff artifact, but it only checks whether the file exists. That does not address the observed failure mode: a downstream coding agent receives the workflow outputs, then ignores `design-token-patch.md` and does not use snapshots or visual baselines for validation.

This change adds a lightweight quality gate:

- pre-handoff must treat missing or incomplete `implementation-evidence.md` as unhandled
- `implementation-evidence.md` must include module-level structure, token, behavior/API, snapshot, and anti-assumption evidence
- handoff guidance must require a post-coding `implementation-verification.md` audit before claiming implementation complete

The goal is to force design-token and snapshot evidence into the implementation path without turning the workflow into a full Markdown AST or cross-file semantic validator.

---

## Problem

The workflow currently has a real gap between "evidence exists" and "evidence is used."

The concrete failure case:

- Figma workflow outputs were handed to an agent.
- The agent did not follow `design-token-patch.md`.
- The agent did not use snapshot or visual baseline comparison during verification.
- The resulting implementation could pass normal engineering checks while still drifting from the Figma design evidence.

The existing `figma-engineering-checkpoint.js` prevents silent absence of `implementation-evidence.md`, but it does not prevent empty, generic, or template-only evidence from passing the handoff gate.

---

## Goals

- Detect low-quality `implementation-evidence.md` before handoff.
- Make token evidence and snapshot verification explicit per module.
- Keep user-controlled skip behavior, but make the risk explicit in `inputs.md`.
- Require downstream coding completion to leave a verification audit.
- Preserve the current repository boundary: these skills prepare implementation materials and do not modify business project code.

## Non-Goals

- Do not parse raw Figma JSON.
- Do not validate token values against Figma or business CSS.
- Do not perform pixel-level visual regression.
- Do not automatically inspect or modify downstream business implementation code.
- Do not fully parse Markdown with an AST in the first iteration.
- Do not block deliberate user skip; only make skip explicit and auditable.

---

## Proposed Approach

Use a two-stage control:

1. **Pre-handoff quality gate**
   `figma-workflow/scripts/figma-engineering-checkpoint.js` checks whether `implementation-evidence.md` is missing, incomplete, generated, skipped, or not applicable.

2. **Post-coding verification audit**
   `figma-emit-spec` and `figma-workflow` documentation require downstream coding agents to produce `implementation-verification.md` before claiming implementation complete.

This is intentionally stronger than documentation-only guidance but lighter than full cross-file consistency validation.

---

## Pre-Handoff Quality Gate

Add a focused helper, for example:

```js
function implementationEvidenceStatus(featureDir) {
  // returns "missing" | "incomplete" | "generated"
}
```

The checkpoint item for `figma-emit-spec` should use this helper instead of `productStatus(featureDir, "implementation-evidence.md")`.

### Status Rules

| Status | Meaning | Handoff Effect |
|---|---|---|
| `missing` | `implementation-evidence.md` does not exist | blocks unless skipped |
| `incomplete` | file exists but fails the minimum quality contract | blocks unless skipped |
| `generated` | file exists and satisfies the minimum quality contract | handled |
| `skipped` | user explicitly skipped and audit exists | handled with recorded risk |
| `not_applicable` | checkpoint is not `pre-handoff` | handled |

`canContinueToHandoff()` should continue to allow only handled required prompts. `incomplete` is not handled.

### Minimum Quality Contract

`implementation-evidence.md` is `generated` only when it contains all of the following:

- `# Implementation Evidence`
- `## Required Files Before Coding`
- references to `ui-understanding.md`
- references to `design-token-patch.md`
- references to `implementation-spec.md`
- `## Evidence by Module`
- at least one module heading under Evidence by Module
- for each module block:
  - `Structure evidence`
  - `Token evidence`
  - `Behavior/API evidence`
  - `Snapshot evidence`
  - `Do not implement from assumption`
- `## Coding Gate Checklist`
- checklist language that mentions token evidence
- checklist language that mentions snapshot, visual baseline, or visual validation

The first implementation can use conservative line and section scanning. It should avoid a broad Markdown parser until the workflow needs deeper cross-file validation.

### Module Block Boundary

The module contract applies to `###` headings inside `## Evidence by Module`. The scanner should stop when it reaches the next `##` section.

If there are no module headings, the file is `incomplete`.

---

## Post-Coding Verification Audit

The downstream implementation stage should not be able to claim completion with only build/test output. The handoff materials should require a verification artifact:

```text
docs/design/<feature>/implementation-verification.md
```

Suggested template:

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

This repository will document the audit requirement. It will not verify business code or decide whether the downstream implementation is visually correct.

---

## Skill and Template Updates

### `figma-emit-spec`

Update `figma-emit-spec/SKILL.md` and `figma-emit-spec/references/spec-template.md` to clarify:

- `implementation-evidence.md` is a coding gate, not a summary.
- Each module must bind structure, token, behavior/API, and snapshot evidence.
- Token evidence must be module-level. It cannot only say "see `design-token-patch.md`."
- Snapshot evidence must name a baseline or explicitly use `<missing>` / `<待 P15 回填>`.
- Missing evidence should be surfaced as an open question or verification risk.
- Downstream coding must produce `implementation-verification.md` before completion.

### `figma-workflow`

Update `figma-workflow/SKILL.md` and `figma-workflow/references/progress-routing.md` to clarify:

- Missing and incomplete `implementation-evidence.md` both block pre-handoff.
- Skip is allowed only with audit.
- Skip risk must mention design token non-compliance and missing snapshot validation.
- Handoff guidance includes the post-coding verification audit requirement.

---

## Error Handling

| Case | Behavior |
|---|---|
| Evidence file missing | status `missing`, required prompt blocks handoff |
| Evidence file exists but empty | status `incomplete`, required prompt blocks handoff |
| Evidence file has required sections but no module block | status `incomplete`, required prompt blocks handoff |
| A module block lacks token evidence | status `incomplete`, required prompt blocks handoff |
| A module block lacks snapshot evidence | status `incomplete`, required prompt blocks handoff |
| Snapshot evidence is explicitly `<missing>` or `<待 P15 回填>` | allowed by quality gate, but documentation must treat it as verification risk |
| User skips the gate | status `skipped` after audit; handoff may continue with recorded risk |

The quality gate checks presence of evidence fields, not truthfulness. That trade-off is deliberate for the first iteration.

---

## Testing Plan

Add focused tests to `figma-workflow/scripts/figma-engineering-checkpoint.test.js`:

- missing `implementation-evidence.md` returns `missing`
- empty `implementation-evidence.md` returns `incomplete`
- title-only evidence returns `incomplete`
- evidence without `Evidence by Module` returns `incomplete`
- evidence without module headings returns `incomplete`
- evidence with a module missing `Token evidence` returns `incomplete`
- evidence with a module missing `Snapshot evidence` returns `incomplete`
- valid evidence returns `generated`
- incomplete evidence prevents `canContinueToHandoff(state)`
- audited skip turns incomplete evidence into `skipped`

Existing checkpoint tests should keep passing, with fixture expected output updated to include the new status where relevant.

---

## Rollout

1. Update the checkpoint script and tests.
2. Update `figma-emit-spec` templates and instructions.
3. Update `figma-workflow` orchestration and routing docs.
4. Run the Node test suite for workflow scripts.
5. Manually review fixture docs for wording drift.

This is small enough for one implementation plan.

---

## Future Upgrade Path

If agents still ignore evidence after this change, move to a stronger consistency gate:

- parse module names from `implementation-spec.md`
- ensure `implementation-evidence.md` covers every module
- compare evidence modules against `design-token-patch.md` module names
- require `validation-report.md` to include visual baseline references
- optionally check `implementation-verification.md` after coding

That stronger version should be a separate design because it changes the workflow from a structural quality gate to cross-file consistency validation.
