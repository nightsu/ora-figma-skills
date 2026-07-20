# Post-coding Visual Validation Prototype

## 验证问题

验证一个本地、只读的 visual gate 是否能够使用真实 Chromium 页面，稳定区分以下结果:

- 实现与 baseline 一致 → `PASS`
- 实现存在确定性视觉偏差 → `FAIL`
- 两次独立采集结果不一致 → `BLOCKED`
- 人工修改验证报告 → `BLOCKED`

prototype 使用一次性的 throwaway Node.js 程序完成。它使用 `playwright-core` 启动系统 Chrome，以 `pixelmatch` 比较 PNG，并通过纯状态机展示 `PASS / FAIL / BLOCKED / ERROR` 结果。探索目录在结论固化后已清理，正式回归覆盖保留在 `figma-implementation-verify/scripts/`。

## 结果

| Scenario | Baseline Diff 1 | Baseline Diff 2 | Stability Diff | Outcome | Recheck |
|---|---:|---:|---:|---|---|
| match | 0 | 0 | 0 | `PASS` | `PASS` |
| mismatch | 0.026910 | 0.026910 | 0 | `FAIL` | `FAIL` |
| unstable | 0 | 0.016007 | 0.016007 | `BLOCKED` | `BLOCKED` |
| tampered report | — | — | — | — | `BLOCKED` |

## 已验证结论

1. `playwright-core` 可以复用系统 Chrome 完成真实页面截图，不需要在业务项目安装浏览器依赖。
2. 同一 scenario 使用两个独立 browser context 采集，可以识别单次截图无法发现的不稳定状态。
3. 确定性视觉偏差与采集不稳定需要分开建模:`FAIL` 表示实现偏差，`BLOCKED` 表示无法形成稳定结论。
4. `check` 重新计算图片差异并确定性渲染 Markdown，可以发现手工修改的 `implementation-verification.md`。
5. baseline、implementation captures、diff、机器结果和派生报告足以组成一个可审查的最小证据链。

## 尚未由 prototype 确定

- production pixel threshold
- stability threshold
- mask 最大面积与边界规则
- 真实 Figma 图片与浏览器渲染之间的抗锯齿容差
- 多 module / 多 viewport 下的运行时间

这些参数不能使用当前玩具页面的结果直接决定。正式 skill 应先提供保守默认值，并要求在至少一个真实 feature 上校准后再冻结 Comparison Guardrail。

## 正式回归命令

运行确定性单元测试:

```bash
npm --prefix figma-implementation-verify/scripts test
```

启用本机 Chrome，运行完整 `seal → verify → check → tamper BLOCKED` 链路:

```bash
FIGMA_VERIFY_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm --prefix figma-implementation-verify/scripts test
```

原 prototype 不属于正式 skill；以上命令运行的是经过边界补强后的正式实现测试。
