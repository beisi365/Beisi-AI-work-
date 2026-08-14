# CP2.1 能力评估与历史对比 · 完整规划

> 状态：**规划交付，未编码**。CP2.0 骨架已落地（`cp2-development` 分支，提交 `97f235a`）。
> 字段策略：**提案制**——默认复用 21 张现有表；确需新增/修改字段时，仅在本文"字段变更提案"小节提交最小提案，经确认方可实施。
> 约束：`featureFlags.assessments` 在开发与内部测试阶段保持 `false`，不向正式导航开放；验收通过后再单独确认开启。

---

## 1. CP1 能力摘要 与 CP2 完整评估 的职责边界（避免重复）

| 维度 | CP1 已提供（职责边界） | CP2.1 新增（不重复建设） |
|---|---|---|
| 数据底座 | `ability_assessments` 表 + 种子（基线/后续快照） | 不重建表，复用同一张表 |
| 单点展示 | 学员档案 `AbilityCell`：显示**当前等级** + **迷你 Sparkline 历史趋势**（按维度） | 保留 `AbilityCell` 作为档案入口；CP2.1 升级为**完整多维对比页** |
| 当前等级口径 | `getAbilityCurrent()`：最新快照的 `teacher_confirmed_level ?? level` | 复用同一口径，确保与档案一致 |
| 班级分布 | `LocalDataLayer` ~380 行已做班级六维 `avg + dist` 聚合 | 复用该聚合，封装为正式查询供对比页调用 |
| 录入/确认 | 无（CP1 仅种子数据，无录入 UI） | 教师端录入→确认→发布→修正流程 |
| 历史版本 | 仅迷你趋势 | 完整历史时间轴 + 前后对比结论 |

**去重原则**：
- 学员档案的 `AbilityCell` **保留并作为数据入口**，CP2.1 不重建档案能力块，仅新增独立对比页与录入能力。
- CP2.1 的"当前等级""历史"全部调用 `getAbilityCurrent` / `getAbilityHistory`，**与档案同源**，杜绝双数据源漂移。
- 与作业状态（`submissions.status`）、学习记录（`learning_records`）、教师评语（`teacher_reviews`）**互不影响**：评估是独立维度，不改变作业状态，也不被作业状态驱动。

---

## 2. 现有 `ability_assessments` 数据结构、关联键、可复用字段、缺口

来源：`src/data/types.ts` 第 270–283 行。`DBShape` 键名 = `ability_assessments`。

| 字段 | 类型 | 可复用 | 说明 / 缺口 |
|---|---|---|---|
| `id` | string | ✅ | 主键 |
| `student_id` | string | ✅ | 关联 `students.id`（学员归属） |
| `dimension` | AbilityDimension | ✅ | 六维之一 |
| `level` | AbilityLevel | ✅ | 当前等级；**建议语义：仅"已发布"时非 null** |
| `source` | AssessmentSource | ✅ | `baseline`/`self`/`teacher`/`ai`/`work`，表达来源 |
| `evidence_id` | string \| null | ✅ | 关联 `submissions`/`work_versions`（证据） |
| `ai_suggested_level` | AbilityLevel \| null | ⚠️ | AI 草稿建议；**学员不可见、CP2.1 不自动生成** |
| `teacher_confirmed_level` | AbilityLevel \| null | ✅ | 教师确认等级；发布时与 `level` 一致 |
| `assessed_at` | number | ✅ | 评估时间＝版本排序键 |
| `created_at` / `updated_at` | number | ✅ | 时间戳 |
| `created_by` | string | ✅ | 操作人（用户 id） |
| **`status`** | — | ❌ **缺口** | 无显式状态字段（见 §9 字段提案） |

**关联键**：`student_id → students`；`evidence_id → submissions/work_versions`；`created_by → users`。
**可直接复用查询**：`getAbilityHistory(sid, dim)`（按 `assessed_at` 升序）、`getAbilityCurrent(sid)`（权威当前等级）、班级六维聚合（约 `LocalDataLayer:380` 的 `abilitySummary`）。

---

## 3. 六维能力、评分等级、评分口径、证据要求

**六维（来自 `ABILITY_LABEL`）**：
1. `basics` 基础认知 — 对 AI 工具基础概念/边界的认知
2. `requirement` 需求拆解 — 将模糊需求拆为可执行指令的能力
3. `prompt` 提示词 — 撰写清晰、结构化提示词的能力
4. `operation` 工具操作 — 实际操作工具/链路的熟练度
5. `judgement` 判断甄别 — 甄别输出质量/真伪/风险的能力
6. `application` 应用落地 — 在真实场景落地解决问题的能力

**四级（来自 `LEVEL_LABEL` + `levelToNum`）**：

| 等级 | 标签 | 数值 | 含义（建议评分口径） |
|---|---|---|---|
| L1 | 入门 | 1 | 在提示下可完成基础动作 |
| L2 | 了解 | 2 | 能独立完成标准任务 |
| L3 | 熟练 | 3 | 能应对变体、稳定产出 |
| L4 | 精通 | 4 | 能优化方法、迁移到新场景 |

**评分口径**：教师依据**证据**（作品/提交/课堂表现）对照各级行为描述定级；优先以 `evidence_id` 指向的提交物为客观依据，避免主观印象分。
**证据要求（硬约束）**：
- 每条已发布评估**必须**关联证据：`evidence_id` 指向一条 `submissions`/`work_versions`，**或**教师填写证据说明文本（见 §9 提案 `evidence_text`）。
- **无证据时不得生成/发布能力分数**；系统拦截 `level` 非 null 但证据缺失的写入。
- **不调用外部 AI**：CP2.1 不接入任何 AI 服务自动打分；`source='ai'` 的自动生成不在本期范围，`ai_suggested_level` 仅用于展示历史遗留的待确认草稿（若有），不新增。

---

## 4. 教师录入流程：草稿 → 确认 → 发布 → 修正 → 历史版本

**核心不变量：历史评估不得覆盖。** `ability_assessments` 采用**追加式（append-only）**——任何"修正"都新建一行，旧行保留为历史。

| 阶段 | 动作 | 数据表现（推荐，无新增字段） |
|---|---|---|
| 草稿 | 教师录入维度/等级/证据，尚未确认 | 新行：`level=null`，`teacher_confirmed_level=null`，`source='teacher'`；仅教师可见 |
| 确认 | 教师核对证据与等级 | 暂不对外发布，标记待发布（若采用 §9 `status` 提案则置 `confirmed`） |
| 发布 | 教师正式发布给学生 | 置 `level` + `teacher_confirmed_level` = 选定等级，`assessed_at=now`（若采用提案则 `status='published'`） |
| 修正 | 发现定级偏差 | **新建一行**（不更新旧行），新行 `assessed_at` 更晚 → `getAbilityCurrent` 自动取最新；旧行留在历史 |
| 历史版本 | 查看演进 | `getAbilityHistory(sid, dim)` 全部行按 `assessed_at` 升序，含草稿与发布版本，均不可变 |

> 若评审希望有**显式状态机**（`draft/confirmed/published`）而非仅靠 `level` 是否为 null 推导，见 §9 字段提案。两种方案二选一，须确认。

---

## 5. 页面结构（三处界面）

### 5.1 教师端 `/t/assessments`（管理 + 录入）
- 筛选条：班级 / 学员 / 维度 / 状态（草稿·已发布）。
- 学员列表（含各维当前等级徽章）→ 进入 `学员评估详情`：
  - **六维雷达/矩阵对比卡**：基线 vs 最新 vs 各阶段快照。
  - **单维时间轴**：升级 `Sparkline` 为完整趋势 + 前后对比结论（进步/退步/持平，由 `levelToNum` 差值判定）。
  - **录入/修正表单**：维度 + 等级 + 证据（选 `evidence_id` 或填证据说明）+ 提交为草稿/发布。
  - **班级横向对比**（仅教师）：某维度全班分布与排序（复用 `abilitySummary` 聚合）。

### 5.2 学员档案能力页（增强现有 `AbilityCell`）
- 保留档案页 `AbilityCell` 区块；CP2.1 在其上增加"查看完整对比"入口，跳转到学员端详情页。
- 不重建档案能力块，避免双数据源。

### 5.3 学员端 `/s/assessments`（只读自己）
- 渲染本人六维当前等级 + 历史趋势（来自 `getAbilityCurrent`/`getAbilityHistory`）。
- **仅展示已发布结果**；不展示 `ai_suggested_level`、不展示他人姓名、不展示班级排名。

> 路由接入：在 `App.tsx` 教师/学员路由组注册上述路径，复用 `RequireAuth`+`RoleOnly`；**正式导航由 `featureFlags.assessments` 控制显隐**（当前 `false`）。
> **隐藏测试路由**：开发期在 `App.tsx` 内以 `import.meta.env.DEV` 为条件额外注册 `/t/dev/assessments`（或 `/s/dev/assessments`），仅 dev 构建可访问，供内部测试；生产构建不挂载，不进正式导航。

---

## 6. 计算口径

| 计算 | 口径 | 复用 |
|---|---|---|
| 当前等级 | `getAbilityCurrent`：按 `assessed_at` 取最新，`teacher_confirmed_level ?? level` | 已有，与档案一致 |
| 历史变化 | 该学员该维全部快照按 `assessed_at` 升序；相邻差 = `levelToNum` 之差 | `getAbilityHistory` |
| 前后对比结论 | 最新发布等级 vs 最早（`source='baseline'`）等级：`Δ>0` 进步 / `Δ<0` 退步 / `Δ=0` 持平；无基线时标注"暂无基线对照" | 新封装纯函数 `compareAbility(history)` |
| 班级对比 | 全班各学员 `getAbilityCurrent` 聚合 `avg` + `dist`（L1–L4 分布） | `LocalDataLayer:380` 既有聚合，封装为 `getClassAbilitySummary(classId)` |
| 多维矩阵 | 六维各自当前 `levelToNum` 组成向量，用于雷达/矩阵 | 新封装 |

**不变量**：所有"当前/历史/对比"均源自同一 `ability_assessments` 表与同一组查询函数；禁止在 UI 内另存副本。

---

## 7. 权限矩阵

| 信息类别 | 教师 | 学员 |
|---|---|---|
| 教师内部信息（`ai_suggested_level`、草稿、内部备注） | ✅ 可见 | ❌ 不可见（UI 不渲染，且 `canRead` 对 `ai_analysis` 已隐藏，类比处理） |
| 未确认评估（草稿 / `status=draft`） | ✅ 可见、可编辑 | ❌ 不可见 |
| 已发布结果（`status=published`/已确认） | ✅ 可见 | ✅ 仅本人（`student_id === 本人`） |
| 录入/确认/发布/修正（写） | ✅ | ❌（`canWrite` 已禁止学员写 `ability_assessments`） |
| 班级对比 / 他人等级 / 排名 | ✅ 教师专属 | ❌ 不展示任何他人姓名与个人成绩排名 |

- 复用 `permissions.ts`：`ability_assessments ∈ STUDENT_OWNED`，`canRead` 学员仅本人；`canWrite` 学员仅 `submissions/work_versions/learning_records`。**无需改守卫即可满足"学员不可写、仅看本人"**。
- 学员端页面在组件层额外过滤：仅渲染 `status=published` 或 `teacher_confirmed_level!=null` 的条目，剔除 `ai_suggested_level`。

---

## 8. 无 AI、无伪数据约束

- **不调用外部 AI / 数据库 / 付费服务**：CP2.1 全部计算基于本地 `ability_assessments`，无任何网络/AI 调用。
- **无证据不生成分数**：写入校验拦截"无 `evidence_id` 且无证据说明"的发布。
- **摘要/结论来自真实数据**：前后对比结论由真实 `levelToNum` 差值生成；无基线/无记录时显示"暂无记录/暂无基线对照"，**禁止生成模拟判断或占位分数**。

---

## 9. 字段变更提案（最小变更，未经确认不得实施）

### 提案 A（可选，推荐评委裁定）：为 `ability_assessments` 增加显式状态
- **新增字段**：`status: 'draft' | 'confirmed' | 'published'`（nullable，向后兼容）。
- **为何需要**：使"草稿/确认/发布"状态机显式化，避免仅靠 `level` 是否为 null 推导带来的歧义（尤其 `source='self'` 学员自评）。
- **迁移方式**：一次性迁移脚本，依据现有数据推导初始 `status`：
  - `teacher_confirmed_level != null` 或 `source ∈ {baseline, teacher, work}` → `published`；
  - `source='ai' && teacher_confirmed_level == null` → `draft`；
  - `source='self' && teacher_confirmed_level == null` → `draft`。
- **兼容性**：字段 nullable，旧代码忽略；`getAbilityCurrent` 升级为"取最新且 `status='published'`"的行（无则 null）。
- **回滚方案**：纯新增可空列，删除该列即回滚，无数据损失；迁移脚本幂等可重跑。
- **替代方案（不新增字段）**：以 `level` 是否为 null 推导（`null`=草稿），完全复用现有字段，零迁移成本。**两方案二选一，须确认。**

### 提案 B（可选）：证据说明文本
- **背景缺口**：当前证据仅 `evidence_id`（关联提交物）；教师凭课堂观察定级时无提交物可关联。
- **新增字段**：`evidence_text: string | null`（教师证据说明）。
- **替代方案（不新增字段）**：强制每条评估关联一条 `evidence_id`（要求教师先建提交/作品再评估）。若不接受强制关联，则需本提案。
- 同样需确认，含迁移/兼容/回滚（nullable，删除即回滚）。

> 以上提案在 CP2.1 编码前须由你确认采纳或否决；**未确认前，默认走"无新增字段"路径**。

---

## 10. 自动化测试清单（建议 `tests/assessments.test.ts`，约 14–16 项）

1. `getAbilityHistory` 按 `assessed_at` 升序返回该学员该维全部快照（回归）。
2. `getAbilityCurrent` 取最新发布等级（`teacher_confirmed_level ?? level`），与学员档案 `AbilityCell` 一致（同源）。
3. 前后对比：基线 L2→最新 L4 ⇒ 结论"进步"，`Δ=+2`。
4. 前后对比：无基线记录 ⇒ 结论"暂无基线对照"，不产生模拟值。
5. 班级对比 `getClassAbilitySummary`：avg 与 L1–L4 分布正确。
6. 教师录入草稿：`level=null`、`teacher_confirmed_level=null`，不出现在"已发布"查询。
7. 教师发布：写入 `level`+`teacher_confirmed_level`，`getAbilityCurrent` 更新。
8. 修正不改历史：修正后旧行仍存在，`getAbilityHistory` 长度 +1，最新为修正值。
9. 证据校验：无 `evidence_id` 且无证据说明 ⇒ 发布被拦截（写库失败/校验失败）。
10. 学员写 `ability_assessments` 被 `canWrite` 拒绝。
11. 学员读：仅本人 `student_id` 行可见；他人行不可见。
12. 学员端 UI 不渲染"录入"入口、`ai_suggested_level`、他人姓名、班级排名。
13. 权限矩阵：教师可见草稿与 `ai_suggested_level`；学员不可见草稿。
14. 无记录时页面显示"暂无评估记录"而非模拟数据。
15.（若采纳提案 A）`status` 迁移后 `getAbilityCurrent` 仅取 `published` 行。
16.（回归）CP1 全部 44 项测试 + `tsc --noEmit` 零错 + `npm run build` 成功。

---

## 11. 验收截图与回归要求

- **截图（开发/内部测试阶段用隐藏路由 `*/dev/assessments`，不进正式导航）**：
  - 教师端：列表（含筛选/状态徽章）、学员评估详情（六维对比卡 + 时间轴 + 录入表单）、班级对比。
  - 学员端：本人六维当前等级 + 历史趋势（确认无他人姓名/排名/草稿）。
  - 长页面单张高 ≤1600px，桌面 1440 / 手机 390 分段截图，避免平台压缩失真。
- **回归门槛**：`tsc --noEmit` 零错误；`npm test` 全过（CP1 44 + CP2.1 新增）；`npm run build` 成功；摘要均来自真实数据、无模拟。
- **开启导航的条件**：上述功能、权限、数据一致性、测试**全部验收通过**后，再单独确认将 `featureFlags.assessments` 置 `true`，正式导航方可见。

---

## 待确认事项
1. 六维名称/四级标签是否采用本文（源自代码 `ABILITY_LABEL`/`LEVEL_LABEL`）？
2. 录入流程采用"无新增字段（靠 `level` 是否 null 推导）"还是采纳 §9 提案 A 增加 `status`？
3. 证据缺口采用"强制关联 `evidence_id`"还是采纳 §9 提案 B 增加 `evidence_text`？
4. 是否按本文结构启动 CP2.1 编码（届时开启隐藏测试路由做内部验收）？
5. CP2.2–CP2.4 仍保持未授权。
