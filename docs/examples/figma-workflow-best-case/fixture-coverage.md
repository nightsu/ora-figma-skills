# Fixture Coverage Matrix

本表用于回答两个问题:

1. 每个 phase 是否有可检查的 expected output?
2. 这些 expected output 是否属于同一个端到端业务链路?

## Main Phase Coverage

| Phase | Skill | Feature in fixture | Inputs | Expected outputs | Complete expected set | Same-feature golden path |
|---|---|---|---|---|---|---|
| A | `figma-clarify-requirement` | `sales-workbench` | `inputs/user-request.md` | `expected/clarified-requirement.md` | yes | partial |
| B | `figma-ui-understand` | `sales-workbench` | `inputs/clarified-requirement.md`, `inputs/figma-node-summary.md` | `expected/ui-understanding.md` | yes | partial |
| C1 | `figma-api-first` | `sales-workbench` | `inputs/api-response-type.ts`, `inputs/clarified-requirement.md`, `inputs/ui-understanding.md` | `expected/api-mapping.md` | yes | partial |
| C2 | `figma-ui-api-mapper` | `course-list` | `inputs/clarified-requirement.md`, `inputs/ui-understanding.md`, `inputs/api-mapping.md`, `inputs/figma-node.json` | `expected/component-mapping.md` | yes | no |
| D | `figma-design-token` | `referral-home` | `inputs/component-mapping.md`, `inputs/figma-node.json` | `expected/design-token-patch.md` | yes | no |
| E | `figma-emit-spec` | `referral-home` | A-D simulated `.md` inputs | `expected/implementation-spec.md`, `expected/implementation-evidence.md`, `expected/open-questions.md` | yes | no |

## Engineering Check Coverage

| Capability | Skill | Feature in fixture | Inputs | Expected outputs | Complete expected set |
|---|---|---|---|---|---|
| Workflow routing | `figma-workflow` | progress-state fixtures | simulated artifact states | `empty-feature.expected.md`, `ready-for-d.expected.md` | yes |
| Engineering checkpoint | `figma-workflow` | engineering-checkpoint fixtures | simulated post-phase states | `mid-workflow.expected.md`, `pre-handoff.expected.md` | yes |
| Design diff | `figma-design-diff` | `sales-workbench` | before/current `.figma-cache` snapshots | `expected/design-diff.md` | yes |
| UI handoff | `figma-ui-handoff` | `sales-workbench` | upstream phase outputs + design diff | `expected/ui-handoff.md` | yes |
| Assets validation | `figma-assets-validate` | `sales-workbench` | spec/token/diff/handoff inputs | `expected/assets-manifest.md`, `expected/validation-report.md` | yes |

## Gaps and Follow-up Options

| Gap | Impact | Recommended follow-up |
|---|---|---|
| A-E expected outputs use multiple feature themes | Good for unit/regression fixtures, weaker as one walkthrough | Add `sales-workbench` C2 / D / E fixtures |
| C2 fixture uses `course-list` legacy mapper scenario | Preserves migration behavior but does not continue `sales-workbench` | Keep it as regression fixture; add new `sales-workbench` C2 fixture separately |
| D/E fixtures use `referral-home` | Good for label drift and token evidence, not same-feature golden path | Keep it as conflict/evidence fixture; add `sales-workbench` token/spec fixture if a single golden path is required |
