# ora-figma-skills

面向 Codex 和 Claude Code 的 Figma workflow skills 仓库。

`ora-figma-skills` 聚焦把 Figma 设计上下文、需求说明、接口结构和 UI/API 映射整理成 coding 前可审阅的工程交接材料。它只负责设计实现准备和工程化检查,不会直接写业务代码。

## figma-workflow-suite

`figma-workflow` 是入口编排器,按 `docs/design/<feature>/` 下的产物状态推进 Phase A-E,并在 handoff 前展示工程化检查点。

```mermaid
flowchart LR
  A["Phase A<br/>需求澄清<br/>clarified-requirement.md"] --> B["Phase B<br/>UI 理解<br/>ui-understanding.md"]
  B --> C1["Phase C1<br/>API 优先映射<br/>api-mapping.md"]
  C1 --> C2["Phase C2<br/>UI/API 组件映射<br/>component-mapping.md"]
  C2 --> D["Phase D<br/>设计 Token 提取<br/>design-token-patch.md"]
  D --> E["Phase E<br/>实施规格生成<br/>implementation-spec.md<br/>open-questions.md"]

  Cache["Cache evidence<br/>.figma-cache/"] -.-> C2
  Cache -.-> D
  Cache -.-> Diff["Design Diff<br/>design-diff.md"]
  Diff -.-> Gate["交接前工程化检查"]
  UIHandoff["UI Handoff<br/>ui-handoff.md"] -.-> Gate
  Assets["Assets / Validation<br/>assets-manifest.md<br/>validation-report.md"] -.-> Gate

  E --> Gate
  Gate --> Planning["OpenSpec / planning / task-breakdown"]
  Planning --> Coding["用户确认后进入 coding"]
```

主链路保持 7 个 skill:`figma-workflow` + Phase A-E 的 6 个阶段 skill。工程化能力按需使用,不改变 Phase A-E 的 coding boundary。

### 主链路技能

- `figma-workflow`:按 `docs/design/<feature>/` 产物状态驱动 workflow,展示进度面板、review gate、工程化检查和 handoff 出口
- `figma-clarify-requirement`:把用户需求整理成 `clarified-requirement.md`(phase A)
- `figma-ui-understand`:从 Figma node 提取页面结构和 UI 语义,输出 `ui-understanding.md`(phase B)
- `figma-api-first`:把接口结构整理成 `api-mapping.md`(phase C1)
- `figma-ui-api-mapper`:清理 Figma 节点,合并 `api-mapping.md`,输出 `component-mapping.md`(phase C2,renamed from `figma-api-mapper`)
- `figma-design-token`:从 Figma node 抽取视觉 token,输出 `design-token-patch.md`(phase D)
- `figma-emit-spec`:合并上游产物,输出 `implementation-spec.md` + `open-questions.md`,提供 handoff 出口(phase E)

### 工程化技能

- P12 `figma cache layer`:在 `docs/design/<feature>/.figma-cache/` 缓存 Figma MCP evidence,供 C2/D 和后续 diff 复用
- P13 `figma-design-diff`:基于 `.figma-cache/` before/current evidence 生成 `design-diff.md`,提示 recommended rerun phases
- P14 `figma-ui-handoff`:生成 `ui-handoff.md`,帮助设计/产品补齐上游交接信息
- P15 `figma-assets-validate`:生成 `assets-manifest.md` 与 `validation-report.md`,收口资源交付和自动化验证

## 安装

推荐使用混合安装：

- Codex 使用 standalone skills
- Claude Code 使用 `ora-figma-skills` plugin

```bash
./scripts/install.sh
```

执行后：

- Codex 会把技能同步到本地 `~/.codex/skills`
- Claude Code 会自动注册本仓库为 marketplace，并安装或更新 `ora-figma-skills@ora-figma-skills`
- 脚本会顺手清理这套仓库在相反安装形态下留下的重复项

如果你明确想以 standalone skills 方式安装，再执行：

```bash
./scripts/install.sh skills
```

这会只安装到 Codex 的 `~/.codex/skills`，不会再改动 Claude Code。

## 更新

仓库更新后，重新运行同一个脚本即可刷新已安装内容。推荐继续使用默认混合模式：

```bash
./scripts/install.sh
```

如果你使用的是 standalone skills 模式，再执行：

```bash
./scripts/install.sh update
```

`update` 会刷新默认混合模式，也就是：

- Codex 更新 standalone skills
- Claude Code 更新 `ora-figma-skills` plugin
- 清理这套仓库在另一种安装形态下留下的重复项

## 目标路径

- Codex skills：`~/.codex/skills`
- Claude Code skills：`~/.claude/skills`
- Claude Code plugin：`~/.claude/plugins/ora-figma-skills`

## 技能结构

每个技能都放在独立目录里，并保持统一结构：

- `SKILL.md`
- `agents/openai.yaml`
- `references/`
- `scripts/`
