---
name: figma-implementation-verify
description: 为 figma-workflow feature 建立并执行 coding 后视觉硬门禁。用于从 required Figma baselines 生成 Verification Contract Draft、在用户批准后 seal、对真实本地实现页面执行 Playwright Chromium 双次截图与视觉断言、生成机器可重算的 implementation-verification.md，以及在声明 coding complete 前运行 check。适用于用户要求视觉还原验证、实现截图对比、post-coding design QA 或阻止未验证实现完成的场景。
---

# Figma Implementation Verify

## Boundary

本 skill 只读业务代码。它可以启动当前 worktree 的应用、控制浏览器、读取 DOM、写入 `docs/design/<feature>/` 验证产物，但不能修改业务实现。

`figma-assets-validate` 负责设计侧 Figma baselines；本 skill 负责 coding 前冻结验证契约和 coding 后验证真实实现。

## Prerequisites

- 当前目录是业务仓库根目录。
- 使用 `feature=<kebab-case>`，对应 `docs/design/<feature>/`。
- 已运行 `figma-assets-validate`，每个 required baseline 都有 `snapshots/<id>.png` 与 `<id>.json`。
- Node.js 与本地 Chrome/Chromium 可用。
- runtime 依赖缺失时，在本 skill 的 `scripts/` 目录运行 `npm install --ignore-scripts`；不要写入业务项目依赖。

脚本入口:

```bash
node <skill-dir>/scripts/figma-implementation-verify.mjs <command> --root <business-repo> --feature <feature>
```

## Workflow

### 1. Prepare Draft

在 Phase E/P15 后、planning 前运行:

```bash
node <skill-dir>/scripts/figma-implementation-verify.mjs prepare --root "$PWD" --feature <feature>
```

脚本读取 required baseline metadata 与现有 A-E/P15 产物，生成:

```text
docs/design/<feature>/verification-contract.draft.json
```

把 draft 交给 planning。逐项补齐脚本打印的 unresolved JSON pointers。完整 schema、Scenario Step DSL 和 Visual Assertion DSL 见 [references/contract-schema.md](references/contract-schema.md)。

不要把 draft 当作可执行契约。不要根据常见 UI 形态自动确认 locator、route、fixture、threshold 或 mask。

### 2. Review and Seal

planning 完成后、任何业务代码修改前:

1. 展示全部 required baseline → Capture Scenario 映射。
2. 展示 runtime、synthetic fixtures、capture targets、assertions、thresholds、masks 和未覆盖范围。
3. 等待用户明确批准。
4. 只有批准后运行:

```bash
node <skill-dir>/scripts/figma-implementation-verify.mjs seal --root "$PWD" --feature <feature> --approved-by <user-label>
```

`seal` 会阻止以下情况:

- draft 仍含 `<confirm...>` / `<missing>` / null
- guardrails 未标记 calibrated
- required baseline 没有且仅有一个 required scenario
- required scenario 没有视觉断言
- baseline、metadata 或浏览器信息无效
- mask 面积超过 guardrail

sealed contract 路径:

```text
docs/design/<feature>/verification-contract.json
```

未 seal 时不得进入 coding。coding agent 不得修改 sealed contract；变更必须回到用户 review 并重新 seal。

### 3. Verify After Coding

实现完成后运行:

```bash
node <skill-dir>/scripts/figma-implementation-verify.mjs verify --root "$PWD" --feature <feature>
```

`verify` 必须:

- 校验 sealed contract、上游文件和 baseline hashes
- 校验 verifier source digest,并要求采集前后 Verification Subject 保持不变
- 从当前 worktree 启动受管应用进程
- 使用 contract 锁定的 Playwright Chromium 版本
- 每个 required scenario 使用独立 browser context 采集两次
- 同时执行 pixel diff、stability diff 和 Visual Assertion DSL
- required scenario 不允许 skip
- 不修改业务代码；失败只生成 blocking findings

结果语义:

| Outcome | Meaning | Exit code |
|---|---|---:|
| `PASS` | 全部 required scenarios 稳定通过 | 0 |
| `FAIL` | 有效比较发现实现偏差 | 2 |
| `BLOCKED` | 契约、状态、环境或证据不足以形成有效结论 | 3 |
| `ERROR` | verifier 自身未分类故障 | 4 |

只有 PASS 会更新 Canonical Verification Evidence。FAIL/BLOCKED/ERROR 保留在本地 `.figma-cache/implementation-verification-runs/`。

### 4. Check Before Coding Complete

声明 coding complete 前必须运行:

```bash
node <skill-dir>/scripts/figma-implementation-verify.mjs check --root "$PWD" --feature <feature>
```

`check` 重新计算:

- sealed contract 与 baseline/source hashes
- 当前 Verification Subject digest
- canonical screenshots 的 baseline/stability diff
- scenario 与 overall outcome
- `implementation-verification.md` 的确定性渲染结果

没有当前 subject 对应的纯 PASS，不能声明 coding complete。build、unit test、人工截图或手填 Markdown 都不能替代 check。

## Fix Loop

FAIL 后由 downstream coding agent 根据 diff 与 assertion findings 修复业务代码，再重新运行 verify。局部 scenario 检查只能作为 Diagnostic Capture；任何业务代码变化后，最终必须全量运行全部 required scenarios。

intentional deviation 只能由用户批准。把 deviation 写入 draft，重新 seal，然后从头 verify；不能直接把既有 FAIL 改成 PASS。

## Evidence and Privacy

正式 PASS 产物见 [references/evidence-layout.md](references/evidence-layout.md)。

- 只使用 synthetic verification data。
- 不把 cookie、token、Authorization header 或环境变量值写入产物。
- mask 只影响比较，不是安全脱敏。
- 发现真实个人信息或凭证时返回 BLOCKED。
- PASS 只代表 Verification Coverage 内通过，不声称所有状态、viewport 或浏览器都已验证。

## Never Do

- 不手填 `implementation-verification.md`
- 不连接外部已有服务生成 PASS
- 不使用线上或共享环境数据生成 PASS
- 不在 FAIL 后放宽 threshold、扩大 mask 或移除 required assertion
- 不执行任意 JavaScript assertion / scenario hook
- 不让 LLM 视觉判断覆盖确定性失败
- 不自动修复业务代码
- 不把 partial run 当作 Coding Complete
