# Expected 工程化检查 — pre-handoff

```text
交接前工程化检查:

[figma-design-diff] Design diff
  status: missing
  recommendation: required_prompt
  reason: cache snapshots detected
  actions: [R] run  [V] view  [S] skip

[figma-ui-handoff] UI handoff
  status: missing
  recommendation: recommended
  reason: unknown or open questions detected
  actions: [R] run  [V] view  [S] skip

[figma-emit-spec] Implementation evidence gate
  status: missing
  recommendation: required_prompt
  reason: pre-handoff must include module-level structure, token, behavior, and snapshot evidence
  actions: [R] run  [V] view  [S] skip

[figma-assets-validate] Assets / visual validation
  status: missing
  recommendation: required_prompt
  reason: pre-handoff assets, visual baselines, and spec-snapshot checks are recommended before planning
  actions: [R] run  [V] view  [S] skip

[figma-implementation-verify] Implementation verification contract draft
  status: missing
  recommendation: required_prompt
  reason: planning needs required baseline scenarios before the contract can be sealed for coding
  actions: [R] run  [V] view  [S] skip

Handle required prompts before continuing to handoff.
```

## Expected behavior

- User can run, view, or skip `figma-design-diff` / `figma-ui-handoff` / `figma-assets-validate` / `figma-implementation-verify` draft preparation.
- P15 generates or validates `assets-manifest.md`, `validation-report.md`, and required visual baselines.
- `figma-implementation-verify prepare` generates a draft for planning; coding still requires user-approved seal.
- Required prompts must be handled before handoff menu appears.
- Skip writes `figma-workflow@v4-checkpoint` audit to `inputs.md`.
- No business code is written.
