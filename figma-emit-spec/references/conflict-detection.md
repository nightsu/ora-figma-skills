# Cross-Product Conflict 检测细节

本文档补充 `SKILL.md` 中的冲突检测规则,重点说明 conflict 的检测算法、
`label_drift` 的自动校正机制、`[deferred]` 的识别。

## conflict 类型一览

| 类型 | 检测对象 | 检测方式 | 处理 |
|---|---|---|---|
| `field_unbound` | api-mapping 字段 | api-mapping 字段名是否在 component-mapping 中出现 | 写入 open-questions |
| `module_missing_token` | component-mapping module | component-mapping module 名是否在 design-token-patch 中出现 | 写入 open-questions |
| `structured_token_gap` | 结构化布局 module | component-mapping / design-token-patch 显示该 module 是表格、列表、网格、卡片组、表单或工具栏,但 design-token-patch 缺少列宽/项宽/行高/槽位尺寸等可实现核对的子项 token | 写入 open-questions;implementation-evidence 标 `incomplete` |
| `module_drift` | ui-understanding module | ui-understanding module 名是否在 component-mapping 中出现 | 写入 open-questions |
| `label_drift` | component-mapping 槽位 label | component-mapping 槽位 label 是否等于 design-token-patch 同槽 label | **自动以 D 为准,不写入 open-questions** |

## `structured_token_gap` 检测规则

该冲突覆盖所有结构化布局,不针对某个业务字段或某一列。只要实现阶段需要根据 Figma 核对内部布局,就不能只依赖容器级 token 或截图。

触发信号包括但不限于:

- `component-mapping.md` 或 `design-token-patch.md` 出现 `table`、`grid`、`list`、`row`、`column`、`cell`、`repeat_group`、`list_item_*`、`*_header`、`*_cell`、`*_column`
- module 语义为表格 / 数据网格 / 列表 / 重复行 / 网格 / 卡片组 / 菜单组 / 表单 / 工具栏
- token 表只记录 `container.width`、`table.width`、`grid.width`、`list.width`、`padding`、`gap` 等外层值,但缺少可见子项尺寸

最低判断:

- 表格 / 数据网格:至少有总宽、每个可见列的列宽或列比例、行高、cell padding
- 列表 / 重复行:至少有容器宽、重复项宽高或 min-height、项间距、关键文本/图标槽位宽高
- 网格 / 卡片组:至少有容器宽、列数、item 宽高、row/column gap、关键槽位宽高
- 表单 / 工具栏:至少有容器宽、控件宽高、label/value 区域宽度、gap

输出到 `open-questions.md` 时使用稳定结构角色,不要用样本文案命名冲突。例如:

```markdown
- [ ] structured_token_gap: StudentDetails.nested.column.content.width 未从 design-token-patch.md 中抽出,实现前需补充列宽 token 或由设计确认。
```

若该问题未解决,`implementation-evidence.md` 不应被标为质量通过的 generated gate;handoff 前必须保持 `incomplete`,除非用户显式 skip 并写入 audit。

## `label_drift` 自动校正算法

### 为什么自动校正

来自 validation-findings.md F2:在 MVP 真实业务跑通中发现,
`figma-ui-api-mapper`(phase C2)如果只调 `get_metadata`,会拿到 Figma node.name(经常是 placeholder),
导致 label 推测大量错位(实测 12/15 错位 = 80%)。

`figma-design-token`(phase D)通过 `get_design_context` 拿到的 `characters` 是真实业务文案的事实来源。
冲突时以 D 为准,不需要人介入(答案已知)。

> 注:PR #3 修了 spec §4a 和 PR #4 修了 P1 SKILL.md,要求 mapper 同时调 get_design_context,
> 这大幅减少 label_drift 发生频率。但 edge case 仍存在(例:Figma 文本节点 characters 也是占位),
> 自动校正机制仍需保留。

### 算法

```
for each module in component-mapping.md:
  for each slot in module:
    if slot.label exists in design-token-patch.md (按 module + position 匹配):
      if c_low_label != d_label:
        record auto-correction:
          - module: <module>
          - slot position: <position>
          - c_low_label: <c_low_label>
          - d_label: <d_label>(真值)
        use d_label in implementation-spec.md
    else:
      skip (无法判定,留 c_low_label)
```

### 写入 implementation-spec.md metadata 段

```markdown
## Auto Corrections Metadata
- label_drift: N 个 label 已从 phase C2 自动校正为 phase D 真实值
- 校正详情:
  - DiamondPreviewCard.primary_value: "钻石余额" → "钻石数量"
  - OperationEntryGrid.list_item_label: "入口" → "运营入口"
```

## `[deferred]` 识别规则

### 触发

任何 open question(无论来自 phase A/B/C1/C2/D 哪个产物)前缀 `[deferred]`,即视为 deferred。

例:
```markdown
- [ ] [deferred] 趋势数据来源:接口完全无字段,本期不实现 trend badge
```

### 处理

- emit-spec 在 implementation-spec.md 对应 Module 段**显式标记**"本期不实现"
- deferred items 单独列在 open-questions.md 的 `## Deferred` 段(汇总,不重复散落)
- Verification Checklist 增加项:`[ ] 所有 deferred items 已确认本期不实现`

### 例子

#### 输入(`api-mapping.md` 或 `clarified-requirement.md`):

```markdown
## Open Questions
- [ ] [deferred] 趋势数据(每个卡片右下角 ↑/↓ X%):接口无对应字段,本期不实现 trend badge
- [ ] 列表是否分页?(待定,假定不分页)
```

#### 输出(`implementation-spec.md` 对应 Module 段):

```markdown
### N. PrimaryMetricCard - 趋势 Badge

> ⚠ Deferred: 趋势数据(每个卡片右下角 ↑/↓ X%):接口无对应字段,本期不实现 trend badge

(本元素不参与本期实施)
```

#### 输出(`open-questions.md` 顶部汇总):

```markdown
## Deferred (auto-detected from [deferred] prefix)
- [ ] [Phase A] 趋势数据(每个卡片右下角 ↑/↓ X%):接口无对应字段,本期不实现 trend badge
```

## 检测的边界 / false positive

- MVP 检测是粗粒度字符串匹配,可能 false positive(例:字段名拼写差异、module 名大小写)
- 用户可以直接在 open-questions.md 中标 `[x]` 表示已确认非冲突,emit-spec 不重写该段
- `label_drift` 自动校正只对**已经明确语义对应**的槽位生效;若槽位对应关系本身不确定,留给人工(写入 open-questions 的 module_drift)

## 不做的事

- ❌ 不"猜"字段对应(只做字符串匹配,不做 fuzzy match / 同义词)
- ❌ 不自动改写上游产物(只在 implementation-spec.md 中用校正后的值;上游保持原样)
- ❌ 不无限递归 deferred(若一个 module 全部 deferred,整个 module 段标 deferred,但内部 slot 不重复标)
