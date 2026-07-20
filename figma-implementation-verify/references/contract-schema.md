# Verification Contract Schema

## Contents

- [Lifecycle](#lifecycle)
- [Top-level shape](#top-level-shape)
- [Capture Scenario](#capture-scenario)
- [Locator](#locator)
- [Scenario Step DSL](#scenario-step-dsl)
- [Visual Assertion DSL](#visual-assertion-dsl)
- [Guardrails](#guardrails)

## Lifecycle

`verification-contract.draft.json` 可编辑但不能执行。`verification-contract.json` 由 `seal` 生成，包含 `sealed_at`、`approved_by`、verifier identity、浏览器版本和 `contract_hash`。

任何 baseline、source file、scenario、fixture、threshold、mask、assertion 或 Approved Deviation 变化都必须重新 seal。

## Top-level shape

```json
{
  "schema_version": 1,
  "status": "sealed",
  "feature": "sales-workbench",
  "verifier": {
    "name": "figma-implementation-verify-runtime",
    "version": "1.0.0",
    "source_sha256": "<generated-at-seal>"
  },
  "runtime": {
    "start_command": "npm run dev",
    "base_url": "http://127.0.0.1:5173",
    "readiness_path": "/",
    "readiness_timeout_ms": 60000
  },
  "platform": {
    "engine": "playwright-chromium",
    "browser_executable": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "browser_version": "142.0.7444.60",
    "locale": "en-US",
    "timezone": "UTC",
    "device_scale_factor": 1
  },
  "guardrails": {
    "calibrated": true,
    "pixel_threshold": 0.001,
    "stability_threshold": 0.0001,
    "pixelmatch_threshold": 0.1,
    "max_mask_ratio": 0.05,
    "repeated_captures": 2
  },
  "baselines": [],
  "scenarios": [],
  "approved_deviations": []
}
```

`start_command` 只运行用户在 seal 前批准的项目已有启动命令。不要在值中保存 secret。

`base_url` 必须指向 verifier 从当前 worktree 启动的 `localhost` / `127.0.0.1` / `::1` 应用。baseline、metadata 与 fixture 路径必须留在 `docs/design/<feature>/` 内；越界路径在 seal 前返回 BLOCKED。

## Capture Scenario

每个 required baseline 必须且只能映射一个 required scenario。

```json
{
  "id": "default",
  "required": true,
  "baseline_id": "default",
  "route": "/sales",
  "viewport": { "width": 1440, "height": 900 },
  "target": {
    "type": "element",
    "locator": { "by": "test-id", "value": "sales-workbench" }
  },
  "steps": [],
  "masks": [],
  "assertions": []
}
```

`target.type` 仅支持:

- `element`: 截取 locator 对应元素，尺寸不符直接 FAIL。
- `viewport`: 截取当前 viewport，不使用 full-page screenshot。

禁止在比较前自动缩放 baseline 或实现截图。

## Locator

优先使用 role/name，其次 test id，最后 CSS。

```json
{ "by": "role", "role": "button", "name": "筛选" }
{ "by": "test-id", "value": "sales-workbench" }
{ "by": "text", "value": "销售概览", "exact": true }
{ "by": "css", "value": ".sales-workbench" }
```

## Scenario Step DSL

| Type | Required fields | Purpose |
|---|---|---|
| `mock-route` | `url`, `fixture_path` | 用 feature 目录内 synthetic fixture 拦截请求 |
| `set-cookie` | `name`, `value`, `url` | 设置非敏感测试 cookie |
| `set-local-storage` | `key`, `value` | 页面加载前设置确定性状态 |
| `click` | `target` | 点击稳定 locator |
| `fill` | `target`, `value` | 填写确定性内容 |
| `select` | `target`, `value` | 选择固定 option |
| `wait-for` | `target` | 等待 visible/hidden/attached/detached |

PASS 路径不支持 `page.evaluate()`、任意 JavaScript hook 或未记录人工操作。

## Visual Assertion DSL

每条 assertion 必须包含 `id`、`type`、`target`、`expected` 和 `source`。

| Type | Extra fields | Comparison |
|---|---|---|
| `visible` | — | boolean |
| `text` | — | exact trimmed inner text |
| `count` | — | exact locator count |
| `bounding-box` | `tolerance_px` | x/y/width/height |
| `computed-style` | `property` | exact computed CSS value |
| `color` | `property` | exact computed color value |
| `alignment` | `related_target`, `axis`, `tolerance_px` | left/top/right/bottom/center-x/center-y |
| `gap` | `related_target`, `axis`, `tolerance_px` | x/y gap in CSS pixels |

mask 不得覆盖 assertion target；运行时检测到交叉时返回 BLOCKED。

## Guardrails

prototype 只证明阈值模型可行，不能替真实 feature 校准。`guardrails.calibrated` 必须由用户在真实 baseline/实现环境确认后改为 `true`。

- schema v1 使用 contract 级全局阈值；任何调整都必须重新获得用户批准并 seal。
- mask 总面积不能超过 `max_mask_ratio`。
- required scenario 固定采集两次；一次通过一次失败属于 BLOCKED。
- LLM 判断只能解释 diff，不能更改 outcome。
