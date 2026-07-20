# figma-emit-spec

Part of the **figma-workflow-suite** —— phase E(最后一环).
合并 5 份上游 .md 产物 → `implementation-spec.md`(planning/spec authoring 主输入)+ `implementation-evidence.md`(coding 前证据门禁)+ `open-questions.md`,
并在出口处提供 handoff 选择(builtin / superpowers / manual / pause)。

## Quick start

调用 skill:

```
figma-emit-spec feature=<feature-name>
```

(或由 `figma-workflow feature=<feature-name>` 在 phase E 自动路由调用)

## Prerequisites

`docs/design/<feature>/` 目录下必须**已有 5 份产物**:
- `clarified-requirement.md`(phase A)
- `ui-understanding.md`(phase B)
- `api-mapping.md`(phase C1)
- `component-mapping.md`(phase C2)
- `design-token-patch.md`(phase D)

## Outputs

- `docs/design/<feature>/implementation-spec.md` — planning/spec authoring 主输入
- `docs/design/<feature>/implementation-evidence.md` — coding 前证据门禁;按 module 绑定 structure / token / behavior/API / snapshot evidence
- `docs/design/<feature>/open-questions.md` — 跨阶段未决问题汇总
- `docs/design/<feature>/inputs.md` — 追加一条 audit 记录
- (handoff = builtin)`task-breakdown.md`
- (handoff = superpowers)调用 `superpowers:writing-plans` 转 implementation plan

## Evidence gate

`implementation-evidence.md` 不是 `implementation-spec.md` 的摘要。它必须让后续 coding agent 在编码前读取:

- `ui-understanding.md` 中的结构、控件形态和可见文案
- `design-token-patch.md` 中的 module-level token evidence
- `implementation-spec.md` / `api-mapping.md` 中的行为、状态和接口依据
- snapshot / visual baseline evidence

handoff 前的 workflow 会检查 `implementation-evidence.md` 的质量。缺少 module-level token evidence、结构化布局子项 token evidence、Snapshot evidence 字段或 Coding Gate Checklist 时,状态为 `incomplete`,除非用户显式 skip 并写入 audit。

P15 后由 `figma-implementation-verify prepare` 生成 verification contract draft,planning 后由用户批准并 seal。下游 coding agent 在声明 coding complete 前必须运行 `verify` 与 `check`;`implementation-verification.md` 由验证器机器生成,禁止手填。

## 详细规约

- Skill 使用说明:[SKILL.md](./SKILL.md)
- 冲突检测算法 + label_drift 自动校正:[references/conflict-detection.md](./references/conflict-detection.md)
- spec 模板填充规则:[references/spec-template.md](./references/spec-template.md)
- 端到端 fixture:[tests/fixtures/referral-home/](./tests/fixtures/referral-home/)
- Best-case 入口:[../docs/examples/figma-workflow-best-case/README.md](../docs/examples/figma-workflow-best-case/README.md)

## 上下游

```
phase A/B/C1/C2/D       →  figma-emit-spec       →  planning / coding handoff
5 份 .md 产物                    implementation-spec      superpowers:writing-plans
                                + implementation-        或 OpenSpec / task-breakdown
                                  evidence
                                + open-questions
                                + (optional) task-
                                  breakdown
```

## Suite spec

完整套件设计:`docs/superpowers/specs/2026-05-20-figma-workflow-suite/README.md`
