# Verification Evidence Layout

```text
docs/design/<feature>/
├── verification-contract.draft.json
├── verification-contract.json
├── verification-result.json
├── implementation-verification.md
├── verification/
│   └── <scenario-id>/
│       ├── implementation-1.png
│       ├── implementation-2.png
│       ├── baseline-1.diff.png
│       ├── baseline-2.diff.png
│       └── stability.diff.png
└── .figma-cache/
    └── implementation-verification-runs/
        └── <timestamp>/
```

## Canonical Evidence

只有 PASS 更新以下正式产物:

- `verification-result.json`
- `implementation-verification.md`
- `verification/<scenario-id>/` 下的最新 required screenshots 与 diff

这些文件可以提交并供 code review。既有 PASS 在业务代码变化后会因 Verification Subject digest 不一致而失效。

## Diagnostic Evidence

FAIL、BLOCKED、ERROR 与 partial runs 保存在 `.figma-cache/implementation-verification-runs/`。默认不提交完整失败历史；CLI 会打印具体 run 路径供 coding agent 修复。

## Trust Model

`verification-result.json` 保存机器结果，但不是单独可信的 PASS 声明。sealed contract 绑定 verifier version/source digest,采集前后 Verification Subject 必须一致。`check` 会重新计算 contract/source/baseline hashes、当前 verifier identity、Verification Subject、required scenario/assertion coverage、evidence digests、PNG diff 和 canonical Markdown。Markdown 同时列出两次 capture 的 assertion 结果与证据摘要。

该模型可检测常见手工修改，但不提供第三方签名或密码学证明。
