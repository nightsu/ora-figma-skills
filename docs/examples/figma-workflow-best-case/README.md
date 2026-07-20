# Figma Workflow Best-Case Example

本目录是 `figma-workflow-suite` 的最佳案例入口。它不替代各 skill 的 fixture,而是把分散在 A-E phase 和工程化检查中的 expected output 串成一条可阅读、可 review、可回归的 golden path。

## 目标

- 让使用者能快速理解每个 phase 的输入、输出和 review gate 重点。
- 让维护者能一眼看出哪些 phase 已有完整 expected fixture,哪些仍只是局部 fixture。
- 保持 raw Figma evidence 与 Phase A-E Markdown 产物分离。
- 明确 Phase E 之后仍然不能直接写业务代码,必须先完成 handoff / planning / explicit coding confirmation。

## Golden Path Overview

```text
Phase A  figma-clarify-requirement  -> clarified-requirement.md
Phase B  figma-ui-understand        -> ui-understanding.md
Phase C1 figma-api-first            -> api-mapping.md
Phase C2 figma-ui-api-mapper        -> component-mapping.md
Phase D  figma-design-token         -> design-token-patch.md
Phase E  figma-emit-spec            -> implementation-spec.md
                                           implementation-evidence.md
                                           open-questions.md

Pre-handoff engineering checks:
figma-design-diff       -> design-diff.md
figma-ui-handoff        -> ui-handoff.md
figma-assets-validate   -> assets-manifest.md + validation-report.md
```

## Phase-by-Phase Reference

| Phase | Skill | Fixture | Best-case output to inspect | Review gate focus |
|---|---|---|---|---|
| A | `figma-clarify-requirement` | `figma-clarify-requirement/tests/fixtures/sales-workbench/` | `expected/clarified-requirement.md` | Goal / Scope / Out of Scope 清楚,非阻塞问题进入 Open Questions |
| B | `figma-ui-understand` | `figma-ui-understand/tests/fixtures/sales-workbench/` | `expected/ui-understanding.md` | 结构、重复模式、疑似组件来自 Figma evidence,不做 API 绑定 |
| C1 | `figma-api-first` | `figma-api-first/tests/fixtures/sales-workbench/` | `expected/api-mapping.md` | API facts 展开为 dotted path,不从 UI 槽位伪造字段 |
| C2 | `figma-ui-api-mapper` | `figma-ui-api-mapper/tests/fixtures/course-list/` | `expected/component-mapping.md` | 区分 `api_bound` / `ui_static` / `ui_copy` / `unknown` |
| D | `figma-design-token` | `figma-design-token/tests/fixtures/referral-home/` | `expected/design-token-patch.md` | module-level token 完整,结构化布局包含子项尺寸 |
| E | `figma-emit-spec` | `figma-emit-spec/tests/fixtures/referral-home/` | `expected/implementation-spec.md`, `expected/implementation-evidence.md`, `expected/open-questions.md` | spec / evidence / open questions 分工清楚,evidence gate 阻止只读 spec 就编码 |

## Engineering Check Reference

| Check | Skill | Fixture | Output to inspect | Purpose |
|---|---|---|---|---|
| Design diff | `figma-design-diff` | `figma-design-diff/tests/fixtures/sales-workbench/` | `expected/design-diff.md` | 根据 before/current cache evidence 判断建议重跑阶段 |
| UI handoff | `figma-ui-handoff` | `figma-ui-handoff/tests/fixtures/sales-workbench/` | `expected/ui-handoff.md` | 给设计/产品补齐 selection、文案、状态、资源标注 |
| Assets validation | `figma-assets-validate` | `figma-assets-validate/tests/fixtures/sales-workbench/` | `expected/assets-manifest.md`, `expected/validation-report.md` | 收口资源引用、visual baseline 和 handoff 前验证 |
| Workflow routing | `figma-workflow` | `figma-workflow/tests/fixtures/` | `*.expected.md` | 验证进度面板、工程化检查和 handoff boundary |

## Current Shape

当前仓库已经做到每个主 phase 都有 expected output,但还不是单一 feature 从 A 到 E 串到底:

- `sales-workbench`: A / B / C1 / diff / UI handoff / assets validate 覆盖较完整。
- `course-list`: C2 继承旧 mapper 案例,适合验证 UI/API 绑定分类。
- `referral-home`: D / E 覆盖较完整,适合验证 token 提取、label drift 自动校正和 evidence gate。

如果需要真正的一条业务主题贯穿链路,下一步应补 `sales-workbench` 的 C2 / D / E fixtures,再把本目录中的表格切换为单一 feature golden path。

## Raw Evidence Boundary

- `.figma-cache/` 和 `tests/fixtures/**/inputs/*.json` 是 evidence 或模拟 Figma 输入,不是 Phase A-E Markdown 输出。
- Phase A-E 的 `.md` 产物只记录可 review 的工程事实,不要复制 raw Figma JSON。
- `snapshots/*.png` / `snapshots/*.json` 是 P15 visual baseline handoff artifact,不是生产图片资源。

## Handoff Boundary

Phase E 产出 `implementation-spec.md` 后仍不能默认进入业务代码修改。正确顺序是:

1. Review `implementation-spec.md`, `implementation-evidence.md`, `open-questions.md`。
2. 处理或审计 `figma-design-diff`, `figma-ui-handoff`, `figma-assets-validate`。
3. 选择 builtin / `superpowers:writing-plans` / manual / pause handoff。
4. 用户明确确认 coding 后,下游 coding agent 才能修改业务项目代码。
5. P15 后运行 `figma-implementation-verify prepare`,planning 后由用户批准并 seal。
6. coding agent 完成前必须运行 `figma-implementation-verify verify` 与 `check`,由验证器机器生成 `implementation-verification.md`。
