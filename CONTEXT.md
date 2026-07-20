# ORA Figma Workflow

本上下文描述 Figma workflow 从实施证据准备到实现后视觉验收所使用的统一语言。

## Language

**机器生成的视觉验证证据**:
由真实浏览器采集并由验证程序生成的实现截图、来源元数据、内容哈希和判定结果；任何手工修改或证据替换都必须能被重新校验发现。它不表示由可信第三方签名的密码学证明。
_Avoid_: 不可伪造的验证文件、手填验证记录、自我声明式视觉验证

**完成契约**:
采用本 workflow 的实施过程在声明完成前必须满足的机器可检查条件；外部工具通过同一验证命令和 PASS manifest 接入。
_Avoid_: 完成建议、可选检查清单

**Coding Complete**:
当前 Verification Subject 已通过完成契约，且存在与该 subject 和 required baselines 对应的 PASS manifest。它不表示本 workflow 能约束未接入完成契约的外部 agent。
_Avoid_: 代码已写完、构建通过、agent 自报完成

**Capture Driver**:
按照统一输入和输出契约控制真实浏览器、采集实现页面截图并记录采集元数据的验证适配器。
_Avoid_: 手工截图、agent 自述观察结果

**可信验证链**:
从 required baseline、Capture Driver 采集结果到完成判定的可重算证据链；只有该链路产生且校验通过的结果才能形成 PASS manifest。
_Avoid_: 人工勾选通过、调试截图、无法重放的浏览器观察

**受管验证运行时**:
由验证器从当前 worktree 启动、检查就绪并在采集后清理的应用实例。只有该运行时产生的实现证据能够参与 PASS 判定。
_Avoid_: 无法确认来源的已有服务、手工启动但未记录来源的页面

**Diagnostic Capture**:
从外部已有服务或不完整环境采集、仅用于排查问题的截图与观察；它不能进入可信验证链或形成 PASS manifest。
_Avoid_: 验收截图、通过证据

**Capture Scenario**:
一个 required baseline 在实现侧的唯一可重放视觉状态，明确页面位置、viewport、状态准备、就绪条件、动态区域规则和实现截图目标。一份 required baseline 必须且只能映射一个 Capture Scenario。
_Avoid_: 测一下这个页面、默认截图、多状态共用的模糊验收项

**确定性视觉状态**:
由固定 fixture、可重置的本地测试服务和显式浏览器环境共同构造的可重放页面状态。只有确定性视觉状态能够参与 PASS 判定。
_Avoid_: 线上数据状态、共享测试环境当前状态、依赖人工预先操作的状态

**关键视觉断言**:
Capture Scenario 中必须满足的可测视觉关系，例如模块数量、元素边界、对齐、间距、字号和颜色。它与像素差异共同决定 PASS，不能由主观视觉判断替代。
_Avoid_: 看起来差不多、模型认为一致、只检查截图存在

**Visual PASS**:
Capture Scenario 的环境、像素差异和全部关键视觉断言均满足已批准验证契约后的结果。
_Avoid_: 已生成截图、仅像素通过、仅断言通过

**Verification Contract**:
coding 前经用户批准并冻结的 required baselines、Capture Scenarios、数据状态、阈值、mask 和关键视觉断言集合。实现期间的任何变更都会使验证进入 BLOCKED，直至用户重新批准。
_Avoid_: 可由实现者调整的测试配置、实现后生成的验收规则

**Verification Outcome**:
验证运行的唯一总体结果：`PASS` 表示全部 required scenarios 满足契约，`FAIL` 表示有效比较发现实现偏差，`BLOCKED` 表示证据或环境不足以形成有效结论，`ERROR` 表示验证器自身故障。只有 `PASS` 能满足 Coding Complete。
_Avoid_: pass with warning、required scenario skipped、基本通过

**Verification Result**:
验证运行保存的机器可读结果快照；它必须能由 `check` 根据冻结契约、当前 commit 和原始证据重新计算，不能凭文件中的 PASS 字段获得信任。
_Avoid_: 权威 PASS 文件、手写结果 JSON

**Implementation Verification Report**:
从 Verification Result 确定性渲染并由 `check` 校验的人类可读报告，固定输出为 `implementation-verification.md`。
_Avoid_: 人工填写的验收表、验证事实来源

**Verification Contract Draft**:
由上游设计与实施材料推导、尚含待确认项的候选验证规则。它可以进入 planning，但不能进入 coding 或参与 PASS 判定；只有用户明确批准并 seal 后才成为 Verification Contract。
_Avoid_: 自动批准的验证契约、可直接用于完成判定的推断配置

**Capture Target**:
Capture Scenario 在实现页面中唯一明确的截图范围，类型为 viewport 或 element，并包含 locator、预期尺寸和已批准裁剪规则。实现截图不能通过自动缩放来适配 baseline。
_Avoid_: 默认整页截图、比较前自动缩放、未声明的裁剪范围

**Comparison Guardrail**:
由 suite 固定的像素阈值与 mask 安全上限；Capture Scenario 只能收紧，不能自行放宽。具体数值必须通过代表性 prototype 校准。
_Avoid_: 场景自定义无限阈值、失败后扩大 mask、未经校准的默认值

**Visual Assertion DSL**:
用于声明关键视觉断言的受限、可审计语言，只允许 suite 定义的断言类型和 locator，不执行任意断言代码。
_Avoid_: Playwright 脚本片段、任意 JavaScript assertion、agent 主观观察

**Scenario Step DSL**:
用于准备确定性视觉状态的受限、可审计步骤语言，只允许 suite 定义的导航、环境设置、fixture、交互和等待操作。
_Avoid_: 任意 JavaScript hook、未记录的人工操作、依赖外部当前状态的步骤

**Approved Deviation**:
由用户明确批准并写入重新冻结的 Verification Contract 的设计偏差。它不会修改既有结果，必须通过新的完整验证运行生效。
_Avoid_: agent 自批偏差、FAIL 报告中的免责说明、用 mask 隐藏偏差

**Reproducible Scenario**:
在同一受管验证运行时中经过两次独立状态准备和采集，并得到稳定结果的 required Capture Scenario。偶发通过不能形成 Visual PASS。
_Avoid_: 任意一次重试通过、只采集一次、忽略不稳定结果

**Verification Subject**:
一次验证实际覆盖的实施内容，由验证时的 HEAD commit 和排除验证产物后的业务文件摘要共同标识。任何影响实现的内容变化都会使既有 PASS 失效。
_Avoid_: 只记录 commit ID、忽略脏工作树、把验证产物计入实施摘要

**Canonical Verification Evidence**:
当前有效 PASS 对应、可提交并能由 `check` 重算的最小正式证据集。失败、阻塞、错误和诊断运行只属于本地调试缓存。
_Avoid_: 提交全部运行历史、只保留最终 Markdown、把失败缓存当正式证据

**Synthetic Verification Data**:
专为 Capture Scenario 准备、不会暴露真实人员、凭证或生产数据的确定性 fixture 内容。正式 PASS 证据只能使用此类数据。
_Avoid_: 线上数据、共享环境真实数据、脱敏状态不明确的数据

**Coding Ready**:
实施计划已完成且 Verification Contract 已由用户批准并冻结的状态。未达到该状态时，本 workflow 不允许开始业务代码修改。
_Avoid_: plan 已写好、draft 已生成、先实现再补验证规则

**Blocking Verification Requirement**:
prepare 或 verify 发现、必须由 planning 或 downstream coding 解决后才能形成有效验证的缺口。verifier 只报告该要求，不直接修改业务代码。
_Avoid_: verifier 自动修复、非阻塞建议、留到验收时再处理

**Partial Verification Run**:
只执行部分 Capture Scenarios、用于缩短修复反馈时间的诊断运行。它不能形成总体 PASS 或满足 Coding Complete。
_Avoid_: 增量 PASS、复用旧场景结果完成验收

**Full Verification Run**:
针对当前 Verification Subject 重新执行全部 required scenarios 的正式运行。只有该运行能够生成 Canonical Verification Evidence。
_Avoid_: 只重跑失败场景、拼接多个 subject 的历史结果

**Verification Coverage**:
冻结 Verification Contract 中 required Capture Scenarios 明确覆盖的页面状态、目标和 viewport 范围。Visual PASS 只对该范围有效。
_Avoid_: 整个功能全面一致、所有状态已验证、所有浏览器已验证

**Verification Platform**:
Verification Coverage 所声明的固定浏览器与渲染环境。v1 仅包含固定版本的 Playwright Chromium，响应式差异由 viewport scenarios 表达。
_Avoid_: 所有浏览器已验证、真实设备验证、未记录版本的本机浏览器
