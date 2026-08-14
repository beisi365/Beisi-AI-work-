# AI 培训核心教学闭环 · 重新规划（CP2.2 规划草案 v2 · 待确认）

> 分支：`main`（`c2a9486`）｜本轮 **仅修订规划 + 现状核查**：不修改业务代码、不新增数据库字段、不提交、不启动开发｜CP2.2–2.4 冻结，等待本规划确认后立项。
> 设计基调：白底、橙色（`#f4791f`）重点点缀；用真实 AI 培训内容填充，杜绝页面空洞与无关堆砌；不再使用"证据说明"一类占位文字，能力证据一律用真实评分依据/作品链接表达。
> **v2 修订**：在 v1 基础上补充「系统定位边界」「作业生命周期」「评分标准与逐项评分模型」「证据关系」「学员档案姓名唯一源」「文件字段核查」「阶段重排为 P0–P6」「规划状态」。

---

## 0. 现状核查摘要（基于 `main` 真实代码）

- **21 张表**：`users / students / teachers / classes / enrollments / courses / lessons / class_sessions / attendance / assignments / submissions / work_versions / learning_records / ability_assessments / teacher_reviews / ai_analysis / communications / concerns / todos / files / operation_logs`。
- **已打通**：`submissions` 5 态（`pending→to_review→need_revise/completed/excellent`）、`WorksPage` 教师批改 UI（退回/完成/优秀/评语）、`work_versions` 版本历史、`ability_assessments` 的 `assessment_group_id` + `status` 原子流转（draft→confirmed→published→voided）。
- **断点 1（作业起点缺失）**：`assignments` 表结构完整，但全仓库无 `db.assignments.insert/update`，作业 100% 来自 `seed.ts`，教师无法创建/编辑；`Assignment.rubric` 仅为**单个字符串**（`'完成度 / 提示词质量'`），无结构化评分项。
- **断点 2（学员档案单薄）**：`Student` 缺 `self_intro`、`teacher_tags`、`teacher_observation`、`learning_suggestion`；`StudentProfilePage` 整页只读；学员显示名来自 `Student.nickname`，而登录名来自 `User.name`，两处名称存在不一致风险。
- **断点 3（文件无存储）**：`files` 仅元数据（`FileMeta`），`mock_url` 指向 `public/demo-assets/`（**该目录为空导致预览 404**）；无上传 UI、无 `FileStorageAdapter`、无 IndexedDB；`consistency.ts` 已强制"文件仅元数据、禁止 Base64"。
- **断点 4（能力证据未连通）**：`ability_assessments.evidence_id` 注释"关联 submissions"但**恒为 null**；`evidence_text` 只是自由文本；评估与作业/作品无引用关系。
- **断点 5（越权）**：`StudentProfilePage` 的 WorksTab 对学员渲染 5 状态下拉，学员可把状态直接改为 `completed`/`excellent`，与 `WorksPage` 及 `format.ts` 的 `STUDENT_SETTABLE_STATUS`（仅 `pending/to_review`）矛盾。
- **断点 6（日志记而不用）**：`operation_logs` 自动产生，但 `update/remove` 的 `user_id` 硬编码 `'system'`（见 `LocalDataLayer.ts:163,172`），无业务语义、无查看页；`getOperationLogs` 接口存在但无消费方。
- **断点 7（内容空洞）**：课次正文、作业要求、作品内容、演示文件均为占位字符串；学员名为"学员N"、无真实自我介绍。

---

## 0.1 系统定位与边界（新增 · 本轮要求「一」）

### 0.1.1 两种部署形态

| 维度 | A. 单机演示版（现阶段目标） | B. 真实培训版（未来目标，本轮**不实现**） |
|---|---|---|
| 数据库 | 本地 `LocalDataLayer` + `localStorage` 单键 `aiwb_db_v1`（整库 JSON） | 中央数据库（Postgres/云 DB）+ 在线 API |
| 文件存储 | `FileStorageAdapter` 本地实现 = **IndexedDB** | 同一 adapter 的云端对象存储实现（OSS/S3 等） |
| 登录/身份 | 本地 `AuthContext` 内存态 + 演示账号 | 真实身份提供商（SSO/账号体系）+ 持久会话 |
| 数据同步 | **仅本机本浏览器** | 多端实时同步（教师电脑 ↔ 学生手机） |
| 适用 | 产品验收、演示、离线试用 | 正式开班、多学员多设备协同 |

### 0.1.2 关键边界声明

1. **单机版无法完成教师电脑与学生手机之间的数据同步**——本地 `localStorage`/IndexedDB 按浏览器/设备隔离，**不能作为最终生产方案**。本轮只做单机演示版，明确其边界。
2. **接口必须支持未来替换（不锁定实现）**：
   - `DataLayer` / `Repository`（`src/data/repository/`）：所有页面只依赖其接口，不依赖 `LocalDataLayer` 具体类；未来替换为 `RemoteDataLayer` 仅改注入点。
   - `FileStorageAdapter`（规划新增）：`save/get/delete/url` 四方法接口，本地 IndexedDB 实现可整体替换为云端对象存储，页面零改动。
   - `Auth/ActorContext`（`AuthContext`）：抽象"当前操作者"为 `Principal {userId, role, studentId?, teacherId?}`；真实登录只需替换 Provider，业务代码不变。
   - 在线数据库适配器：规划预留 `RemoteDataLayer implements DataLayer` 形态，但**本轮不接入**。
3. **不得擅自接入外部数据库、云存储或付费服务**：所有外部依赖必须经用户独立授权后方可立项；现阶段仅实现并验证本地适配器，确保离线可运行。

---

## 一、目标闭环（验收锚点）

```
建立/编辑学员档案
  → 教师布置作业（指定班级/学员、关联课节、截止、评分标准）
  → 学员填写文字答案或上传图片/文档/作品（可保存草稿、可重新提交）
  → 学员提交
  → 教师逐项批改与评分（退回修改 / 完成 / 优秀 / 逐项评分）
  → 将作业、文件、课堂记录作为六维能力证据
  → 发布学员能力评估
  → 形成成长记录与下一步学习建议
```

四个规划模块对应上述四段：**学员档案编辑 / 文件与资料 / 作业完整闭环 / 六维能力与证据关联**。

---

## 二、作业生命周期（新增 · 本轮要求「二」）

作业本身（`Assignment`）独立于"提交/批改"状态，新增 `Assignment.status`：

```
   draft ──发布──▶ published ──关闭──▶ closed ──归档──▶ archived
    (编辑中)        (可提交)        (停止收件)      (只读留存)
```

### 逐项说明

| 状态 | 学员可见性 | 可编辑字段（教师） | 截止与补交 | 已有提交后的删除限制 | 变更权限与日志 |
|---|---|---|---|---|---|
| **draft** | 不可见 | 全部字段可编辑（标题/要求/课节/班级/评分标准/截止） | 不适用 | 无提交，可删除 | 仅教师；`create_assignment`（user_id=真实教师） |
| **published** | 可见、可提交 | 标题/要求/评分标准/截止可改；`class_id`/`student` 范围若已有提交则锁定 | `due_date` 前可提交/重提；过 `due_date` 是否允许补交由 `allow_late` 决定；`due_date` 只可延后不可提前（改须记日志） | 已有 `submissions` → **禁止删除**，仅可 closed/archived | 仅教师；`publish_assignment` / `edit_assignment` |
| **closed** | 可见历史，但 `pending` 不可再转 `to_review`（停止收新件） | 全只读（含 `due_date`） | 停止收件；已 `to_review` 仍可继续批改 | 禁止删除 | 仅教师；`close_assignment` |
| **archived** | 只读可见 | **全只读** | 不可改 | **禁止删除**（合规留存历史） | 仅教师（通常为管理员）；`archive_assignment` |

- **补交控制（提案字段）**：`Assignment.allow_late: boolean`、`Assignment.late_due_date: string|null`；`late_due_date` 晚于 `due_date`。补交的提交在 `work_versions`/`submissions.meta` 标记 `late=true`，不计入正常准时率统计口径（由 `getSubmissionRate` 区分）。
- **删除限制落地**：`LocalDataLayer.assignments.remove` 前断言"若 `status≠draft` 或存在关联 `submissions` → 抛错/拒绝"，并记录 `operation_logs`。
- **状态变更权限**：仅 `role==='teacher'`；每次变更写 `operation_logs`（修复 `user_id` 取真实操作者，见第三节 E）。

---

## 三、必须新增的最小数据表 / 字段提案（提案制，本轮不执行）

> 原则：优先复用现有 21 表；确需才加；每项含迁移/兼容/回滚/权限。以下为**提案**，待确认后按"提案制"单独立项、逐个最小落地。

### A. `Student` 表字段扩展（模块 1）
| 新字段 | 类型 | 说明 |
|---|---|---|
| `self_intro` | string | 学员自我介绍（学员可写，做"当前摘要"） |
| `ai_baseline` | enum('none'\|'beginner'\|'basic'\|'intermediate'\|'advanced') | AI 基础，整合现有 `ai_tools_used/can_self_service/uses_paid_ai` 语义，旧字段保留兼容 |
| `teacher_tags` | string(JSON[]) | 教师标签（仅教师可见/可写） |
| `teacher_observation` | string | 教师观察**当前摘要**（内部，仅教师可见；语义约定见下） |

- **教师观察字段语义约定（本轮修正 · P0 相关规划）**：
  1. `Student.teacher_observation` **仅表示"当前教师摘要"**（最近一次汇总），内部仅教师可见；
  2. 历次教师观察的**真实来源**是 `learning_records.teacher_observation`（按课堂场次）与学习记录时间线（档案页"学习记录"Tab / `TimelinePage`），历史不可由摘要覆盖；
  3. 更新摘要**不得覆盖或删除**历史记录——写摘要走独立 `students.update` 且仅改 `teacher_observation` 字段，绝不触碰 `learning_records`；
  4. **页面必须区分"当前摘要"与"历次观察"**：档案页分两个区，一区展示 `Student.teacher_observation`（教师可编辑），另一区展示 `learning_records`/时间线历次观察（只读、按时间倒序），两区不合并。
  > 注：P0 仅修复学员作业状态越权，上述语义约定为本轮规划修正，其页面落地属 P1 档案编辑范围；P0 不改动该字段结构。
| `learning_suggestion` | string | 学习建议（对学员可见，有益） |

- **姓名唯一源（见第五节修正）**：学员对外展示名权威来源 = `Student.nickname`；`User.name` 仅作登录标识，不进入对外展示，避免两处不一致。
- **迁移**：旧行新字段默认 `''`/`null`，无破坏性。**回滚**：删字段即可，旧数据无依赖。

### B. `files` 表字段扩展（模块 2 · 核查后补全）
**现有 `FileMeta` 已有**：`name`（原始文件名）、`mime`（MIME 类型）、`size`（文件大小）、`owner_type`+`owner_id`（所属实体）、`created_at`（创建时间）、`updated_at`、`mock_url`、`meta`(JSON)。
**现有缺失（本次提案补齐）**：
| 新字段 | 类型 | 说明 |
|---|---|---|
| `storage_key` | string | `FileStorageAdapter` 内键（本地 IndexedDB key 或未来云端 object key）；`mock_url` 改为可选/弃用 |
| `uploaded_by` | string | 上传者 `user_id`（**现有缺失**，补追责与权限判定） |
| `checksum` | string | 校验值（如 SHA-256 前若干位），**现有缺失**，用于完整性校验与去重 |

- **迁移**：旧 `mock_url` 行 `storage_key=''`、`uploaded_by=''`（或 seed 时填 seed 操作用户）、`checksum=''`；新上传走 `storage_key`+`uploaded_by`+`checksum`。**回滚**：删三字段，退化为仅元数据展示（占位图）。

### C. `assessment_evidences` 新表（模块 4 · 本轮要求「四」细化）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | |
| assessment_id | string(fk ability_assessments.id) | 关联哪个能力评估（按组/按维均可，建议挂组 `assessment_group_id` 对应评估） |
| source_type | enum('assignment_submission'\|'work_version'\|'file'\|'learning_record'\|'teacher_text') | 来源类型 |
| source_id | string\|null | 来源记录 ID（teacher_text 时为 null） |
| snapshot | string(JSON) | **证据摘录/快照**（关键字段副本，如作业标题、文件名、版本内容摘要、评分要点），避免只存易失效 ID |
| is_internal | boolean | 是否教师内部观察（teacher_text 类 = true），学员不可见 |
| created_by / created_at | string/number | 创建者（真实 user_id）与时间 |

- **来源删除/修改后的处理**：软引用 + 快照。来源删除时 evidence 置 `source_deleted=true`（在 snapshot 中保留原信息），不物理删除 evidence，确保历史评估可追溯；来源修改时 evidence 不自动改（历史不可变），必要时新建 evidence 表达新依据。
- **学员可见性**：evidence 随所属 `ability_assessment` 的 `status==='published'` 才对学员可见；`is_internal=true` 的证据即使 published 也对学员隐藏。
- **迁移**：旧 `evidence_id` 有值则迁为一条 `assessment_evidences`（source_type='assignment_submission'）；否则空。**回滚**：删表，`ability_assessments` 退回单 `evidence_id`（已为 null，无损失）。

### D. `assignment_rubric_items` 新表（评分标准 · 本轮要求「三」）
**核查结论**：现有 `Assignment.rubric` 为单个 `string`，**无法**表达"一个作业多个评分项、每项标题/说明/满分/权重/排序、每项关联六维、教师逐项评分、每项评语、总分总评、重提版本归属"。必须新增：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | |
| assignment_id | string(fk assignments.id) | 所属作业 |
| seq | number | 排序 |
| title | string | 评分项标题（如"提示词质量"） |
| description | string | 评分项说明 |
| max_score | number | 该项满分 |
| weight | number | 权重（0–1，sum≈1） |
| dimension | AbilityDimension\|null | 关联六维能力（用于"批改→能力"联动） |
| created_at / updated_at | number | |

- **迁移**：旧 `Assignment.rubric` 字符串整体转为一条 `assignment_rubric_items`（title="综合评分"、max_score=100、weight=1、dimension=null）；旧 `rubric` 字段保留兼容或标记弃用。**回滚**：删表，退回单字符串 `rubric`。

### E. `submission_rubric_scores` 新表（逐项评分 · 本轮要求「三」）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | |
| submission_id | string(fk submissions.id) | 所属提交 |
| work_version_id | string(fk work_versions.id) | **被评的版本**（重提后旧版本评分保留、新版本新评分，解决"版本归属"） |
| rubric_item_id | string(fk assignment_rubric_items.id) | 对应评分项 |
| score | number | 该项得分 |
| comment | string | 该项评语 |
| scorer_id | string | 评分教师 user_id |
| created_at / updated_at | number | |

- **总分与总评**：总分 = Σ(score) 或按 weight 加权；**总评** = `teacher_reviews.teacher_text`（沿用现有表，不新增）。逐项评语在 `submission_rubric_scores.comment`。
- **重新提交后的评分版本归属**：每次重提生成新 `work_version`；教师针对该版本打分，`work_version_id` 绑定，旧版本的一组 scores 作为历史保留，新版本单独一组，避免覆盖。
- **迁移**：旧 `submissions` 无逐项评分 → 默认无 `submission_rubric_scores` 记录，总评仍走 `teacher_reviews`；`getSubmissionRate` 等不受影响。**回滚**：删表，退回"仅总评"模式。
- **权限**：`assignment_rubric_items` 仅教师写；`submission_rubric_scores` 仅教师写；学员只读聚合（总分/总评），逐项明细是否对学员可见由 `dimension` 与教师设置决定（默认仅展示总分+总评）。

### F. `Assignment` 生命周期字段（配合第二节）
| 新字段 | 类型 | 说明 |
|---|---|---|
| `status` | enum('draft'\|'published'\|'closed'\|'archived') | 作业生命周期（默认 seed 行补 `'published'` 兼容） |
| `allow_late` | boolean | 是否允许补交 |
| `late_due_date` | string\|null | 补交截止 |

- **迁移**：旧 seed 行 `status='published'`、`allow_late=false`、`late_due_date=null`。**回滚**：删三字段，退回"作业恒可见"现状（断点 1 仍需 P2 解决创建能力）。

### G. `operation_logs` 增强（不改表结构）
- 改造 `LocalDataLayer`：`update/remove` 的 `user_id` 取当前会话用户（`AuthContext` 的 `Principal.userId`），不再硬编码 `'system'`；`insert` 已用 `created_by`，统一为真实操作者。
- 可选：在 Repository 层传入业务语义 `action`（如 `grade_submission`/`publish_assessment`/`edit_profile`），不强制。
- 新增**日志查看页**（教师/管理员），消费已有的 `getOperationLogs`。

### H. `submissions` 草稿态（模块 3，零结构变更优先）
- **默认方案（不新增枚举）**：学员"保存草稿"=新增 `work_versions` 但不置 `to_review`（`submission.status` 保持 `pending`、`final_version_id` 为空）；点"提交"才把选定版本设 `is_final` 并置 `to_review`。旧 5 态守卫完全不变。
- **可选方案**：若确需独立草稿态，提案新增 `status='draft'`（在 `pending` 前），需同步改 `format.ts` 的 `STUDENT_SETTABLE_STATUS` 与 `teacherCanGrade` 守卫。默认采用零变更方案。

---

## 四、字段级师生权限表（第 4 项 · 更新）

| 对象.字段 | 学员读 | 学员写 | 教师读 | 教师写 | 备注 |
|---|---|---|---|---|---|
| `Student.nickname`（展示名权威源） | ✓ | ✓（本人） | ✓ | △（建议不覆盖，改需记日志） | **不与 `User.name` 混用** |
| `Student.avatar/occupation/goal/ai_baseline/ai_tools_used/weekly_hours/devices/os/office_software` | ✓ | ✓（本人） | ✓ | △（只读学员填，教师可补备注） | 学员自填主数据 |
| `Student.self_intro` | ✓ | ✓（本人） | ✓ | ✗ | 学员自我介绍（当前摘要） |
| `Student.teacher_tags` | ✗ | ✗ | ✓ | ✓ | 仅教师内部 |
| `Student.teacher_observation` | ✗ | ✗ | ✓ | ✓ | 仅教师内部"最近汇总"；历史见 `learning_records` |
| `Student.learning_suggestion` | ✓ | ✗ | ✓ | ✓ | 对学员可见的学习建议 |
| `Assignment.*`（含 rubric 项） | ✓（标题/要求/截止/标准） | ✗ | ✓ | ✓ | 教师创建/编辑/生命周期 |
| `Assignment.status` | ✓（按生命周期） | ✗ | ✓ | ✓（仅教师） | draft/published/closed/archived |
| `Submission.status` | ✓ | 仅 `pending→to_review` | ✓ | `need_revise/completed/excellent` | **修复越权**：学员不可设教师评定态 |
| `SubmissionRubricScore.score/comment` | ✓（聚合总分/总评） | ✗ | ✓ | ✓（仅教师） | 逐项明细默认教师内部 |
| `WorkVersion.content/snapshot_file_id` | ✓（本人） | ✓（本人） | ✓ | ✗ | 版本内容仅本人写 |
| `File`（本人/关联） | ✓（经权限校验） | ✓（owner） | ✓（关联对象） | ✓（管理班级文件） | 删除限 owner/教师；**不得经 storage_key 绕过** |
| `AbilityAssessment`（published） | ✓（本人） | ✗ | ✓ | ✓ | 学员仅见已发布 |
| `AbilityAssessment`（draft/confirmed/voided） | ✗ | ✗ | ✓ | ✓ | 内部态仅教师 |
| `AssessmentEvidence`（is_internal=true） | ✗ | ✗ | ✓ | ✓ | 教师内部观察，学员不可见 |
| `OperationLog` | ✗ | ✗ | ✓（教师/管理员） | ✗ | 学员不可见 |

> 权限落地沿用现有 `permissions.ts`（`canRead`/`canWrite`/`queryScoped`），新增字段在权限矩阵中补登记；P0 额外在 Repository 层加 `canSetSubmissionStatus` 断言（见第八节）。

---

## 五、状态机（第 5 项 · 含作业生命周期与评分版本归属）

### 5.0 作业生命周期（见第二节）
`draft → published → closed → archived`，仅教师可变更，变更写日志，published/closed 有提交后禁止删除。

### 5.1 提交 / 批改状态机
```
        [学员保存草稿: 新增 work_version, status=pending]
                          │  提交
                          ▼
   pending ──提交──▶ to_review
                          │
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
     need_revise      completed         excellent
      (教师退回)       (教师完成)        (教师优秀)
          │
          │ 学员重新提交（新增版本 + 置 to_review）
          └──────────────▶ to_review
```
- **学员动作**：`pending → to_review`（提交）；`need_revise → to_review`（重提）；可随时新增 `work_versions` 草稿（不改 `status`）。
- **教师动作**：`to_review → need_revise`（退回修改）；`to_review → completed`（标记完成）；`to_review → excellent`（设为优秀）。
- **守卫**：`teacherCanGrade` 要求 `to_review`；`pending` 不可批改；**学员不可写 `need_revise/completed/excellent`**（断点 5，P0 修复）。

### 5.2 评估状态机（沿用 CP2.1，补证据入口）
```
   draft ──确认(六维齐全+证据完整)──▶ confirmed ──发布──▶ published
     │                                    │                  │
     │                              修正(建新组 draft)   修正: 旧组 voided, 新组 draft
     └──────────────────────────────────────────────────────▶ voided
```
- 教师在批改作业时可为某 `submission` / `work_version` / `file` 选六维 `L1–L4` 并写入 `assessment_evidences`（生成 `source='work'` 评估或汇入当前组）。
- `published` 不可改；修正建新组、旧组 `voided`（原子流转已实现）。学员仅见 `published`。

### 5.3 评分版本归属（与 5.1 联动）
- 每次重提 → 新 `work_version`（`is_final=true`，旧版本 `is_final=false`）。
- 教师针对**该版本**逐项打分，写入 `submission_rubric_scores`（绑定 `work_version_id`）。
- 旧版本的一组 scores 作为历史保留，新版本单独一组，解决"重提后评分版本归属"。
- 总分 = 该 `final_version` 对应 scores 求和/加权；总评 = `teacher_reviews.teacher_text`。

---

## 六、文件存储方案、迁移与回滚（第 6 项 · 本轮要求「六」补全）

### 6.1 `FileStorageAdapter` 接口（提案）
```ts
interface FileStorageAdapter {
  save(meta: FileMeta, blob: Blob): Promise<string>;   // 返回 storage_key
  get(storage_key: string): Promise<Blob | null>;
  delete(storage_key: string): Promise<void>;
  url(storage_key: string): string;                    // 预览/下载地址（须先经权限校验）
}
```
- `DataLayer` 注入 adapter；页面只调用 `db.files` + adapter，不感知后端（见 0.1.2 接口可替换）。

### 6.2 本地实现 `LocalIdbAdapter`
- 基于 **IndexedDB**（新增轻依赖 `idb` 或原生），store `files`，key=`storage_key`；与 `files.storage_key` 对应。
- 满足"本地测试不得将文件 Base64 写进 localStorage"：二进制进 IndexedDB，整库 `aiwb_db_v1` 仍只存 JSON 元数据，`consistency.ts` 校验保持。

### 6.3 未来云端实现 `CloudObjectAdapter`
- 替换 adapter 实现，`files.storage_key` 存对象存储 key；`url()` 返回签名 URL。页面零改动（仅改注入点）。

### 6.4 类型 / 大小 / 预览 / 下载 / 删除 / 权限
- **类型白名单**：图片 `png/jpg/jpeg/webp/gif`、文档 `pdf`、Office `docx/pptx/xlsx`、外部链接（`text` url，无大小）。
- **大小上限**：图片 ≤ 5MB、PDF ≤ 10MB、Office ≤ 10MB；超界拒绝。
- **预览**：图片内联；PDF 用 `<iframe>`/`<object>`；Office 用在线预览或下载；链接跳转新窗口。
- **下载**：`adapter.get → Blob → 下载`。
- **权限**：owner 读写本人文件；关联学员/教师可读；教师可管理班级文件。

### 6.5 文件关联方式（本轮要求「六」）
- 现有 `owner_type/owner_id` 已支持挂 `student/course/lesson/assignment/submission/work_version/assessment_evidence`（扩展枚举即可）。
- 跨实体关联（如某评分项附文件）：通过 `owner_type='submission_rubric_score'` 或经 `assessment_evidences`(source_type='file') 间接关联，**不**在文件表加多对多冗余字段。

### 6.6 防误删 / 孤文件 / 假元数据 / 权限绕过（本轮要求「六」硬约束）
- **被引用文件禁止误删**：删除 `files` 前反向查证 `assessment_evidences(source_type='file')`、`work_versions.snapshot_file_id`、`lessons.example_files`、`communications.attachment_id`、`submission_rubric_scores`/作业附件引用；存在引用则**拒绝删除**或置"已失效"标记（不物理删），并记日志。
- **数据记录失败时清理孤立文件**：写入 `files` 元数据失败、或 `adapter.save` 之后 DB 事务回滚 → 必须 `adapter.delete(storage_key)` 清理 IndexedDB 残留，避免无主 blob。
- **文件写入失败时不得生成虚假元数据**：`adapter.save` 抛错 → **不**插入 `files` 行；绝不写 `size=0`/`checksum=''`/`mock_url` 占位伪装成功；前端明确报错而非静默假成功。
- **学员不得通过 storage_key 绕过权限**：`url(storage_key)` 调用前必须 `canRead(principal, 'files', fileRow)` 断言；adapter 不裸暴露任意 key 读取；前端**不得**直接拼接 `storage_key` 访问他人文件，所有访问走 `db.files` + 权限层。

### 6.7 迁移与回滚
- **迁移**：本地测试走 `LocalIdbAdapter`；旧 `mock_url` 行 `storage_key=''`、`uploaded_by=''`、`checksum=''`，无真实二进制时回退占位图。
- **回滚**：停 adapter，`files` 退化为仅元数据（`storage_key` 空、显示占位），**不影响其他 20 张表**；IndexedDB 数据可整体清空重置。

---

## 七、页面与操作流程（第 7 项）

| 页面 | 入口 | 关键操作 |
|---|---|---|
| 学员档案（扩展 `StudentProfilePage`） | 学员"我的档案" / 教师从列表进入 | 学员编辑自身可写字段（含 `nickname` 展示名）；教师编辑教师字段；关键修改自动写日志 |
| 文件中心（新 page / 抽屉） | 全局"资料"或作业/评估处唤起 | 上传（类型/大小校验、写 `uploaded_by`/`checksum`）、关联对象、预览、下载、删除（防误删校验） |
| 作业编辑（新 `AssignmentEditorPage`，教师） | 教师"教学总览 → 作业" | 创建/编辑作业（班级/学员/课节/截止/评分标准=多 rubric 项/生命周期） |
| 作业与提交（扩展 `WorksPage`） | 教师/学员作业列表 | 学员：文字+附件、草稿/提交/重提；教师：退回/完成/优秀/**逐项评分(L1–L4 + 分数 + 评语)**+六维证据 |
| 能力评估（扩展 `TeacherAssessmentComposer`） | 教师"能力评估" | 批改时选六维 L1–L4 并关联证据（作业/作品/文件/课堂记录/文字，带快照） |
| 能力查看（`StudentAssessmentViewer`） | 学员"我的评估" | 展示真实六维与证据链接，仅 `published`，不暴露 `is_internal` |
| 成长记录（新聚合页） | 学员"我的档案 → 成长" / 教师档案 | 能力雷达 + 时间线 + 学习建议 + 下一步计划 |

**端到端流程示例（教师视角）**：布置「AI 生成图片」作业（rubric：主题契合 30 / 提示词质量 30 / 多样性 20 / 说明 20，关联 `operation` 维）→ 学员上传 3 张图并提交 → 教师退回修改（附逐项评语）→ 学员重提（新版本）→ 教师逐项评分并就 `operation` 选 `L3`、关联该作品版本 → 发布评估 → 学员在"我的评估"看到 `operation=L3` 及作品链接 + 学习建议。

---

## 八、分阶段开发顺序（第 8 项 · 重排为 P0–P6，本轮要求「七」）

> 顺序锁定：**P0 越权修复 → P1 档案编辑与真实日志 → P2 教师创建/发布作业 → P3 文件和附件 → P4 学生答题/草稿/提交/重提 → P5 逐项评分/总评/能力证据联动 → P6 真实内容与视觉**。

| 阶段 | 范围 | 依赖 | 独立可验收 |
|---|---|---|---|
| **P0 越权修复** | 修复学员在档案页 WorksTab 自设 `completed/excellent`；三层防护（页面/业务服务/Repository 断言）+ 自动化测试 | 无（最高优先，阻塞一切权限正确性） | ✓ |
| **P1 档案编辑与真实日志** | `StudentProfilePage` 编辑态 + 字段级权限 + 新增字段落地（A 提案）；`operation_logs` `user_id` 修复（G）+ 日志查看页 | 无（可与 P2 并行） | ✓ |
| **P2 教师创建/发布作业** | `AssignmentEditor`；作业生命周期 `status`+`allow_late`+`late_due_date`（F）；真实作业题目/评分标准种子 | 无 | ✓ |
| **P3 文件和附件** | `FileStorageAdapter`(IndexedDB) + 上传 UI；`files` 加 `storage_key/uploaded_by/checksum`（B）；关联/预览/下载/删除防误删；真实文件种子 | P2 | ✓ |
| **P4 学生答题/草稿/提交/重提** | 学员文字+附件、草稿（H 零变更）、提交、重提；完善 `WorksPage` 提交侧 | P2,P3 | ✓ |
| **P5 逐项评分/总评/证据联动** | `assignment_rubric_items`（D）+ `submission_rubric_scores`（E）；教师逐项评分+总分/总评；`assessment_evidences`（C）快照联动；去纯文本占位 | P2,P3,P4 | ✓ |
| **P6 真实内容与整体视觉** | 真实 AI 培训内容种子全面替换占位；白底橙色视觉打磨、聚合页填充、无空洞 | P1–P5 | ✓ |

> 每阶段独立可验收、可回滚；P1 可与 P2 并行以分散风险；P0 必须先合，否则后续阶段权限基线不稳。

### 8.1 P0 越权修复独立实施方案（本轮要求「七」· P0 三层防护）

**问题**：`StudentProfilePage` WorksTab 对学员渲染 5 状态下拉，学员可把 `submission.status` 直接改为 `completed`/`excellent`，违反 `format.ts` 的 `STUDENT_SETTABLE_STATUS`（仅 `pending/to_review`），与 `WorksPage` 守卫矛盾（断点 5）。

**三层防护**：

1. **页面层（不提供非法操作）**
   - `StudentProfilePage` WorksTab 移除学员视角的 5 状态下拉；学员仅能执行 `提交 / 保存草稿 / 重新提交`（对应 `pending→to_review` / `need_revise→to_review`）。
   - 教师视角仍保留退回/完成/优秀控件（受角色守卫）。
   - 验收断言：学员 DOM 无 `completed/excellent` 下拉项。

2. **业务服务层（拒绝非法状态转换）**
   - 新增 `submissionService.transitionStatus(principal, submission, next)`：
     - 若 `principal.role==='student'` 且 `next ∈ {need_revise, completed, excellent}` → 抛 `PermissionError`。
     - 若转换非法（如 `pending` 直跳 `excellent`、非 `to_review` 批改）→ 抛 `IllegalTransitionError`。
     - 仅经此服务修改 `submission.status`，页面不裸调 `db.submissions.update`。

3. **DataLayer / Repository 层（权限断言）**
   - `permissions.ts` 新增 `canSetSubmissionStatus(principal, next)`；`LocalDataLayer.submissions.update` 在 `patch.status` 存在时调用断言，越权 → 抛错（即使绕过页面/服务也有最后防线）。
   - 同步清理现有 `StudentProfilePage` 中对 `db.submissions.update({status})` 的学员直写调用。

**自动化测试（P0 必带）**：
- `transitionStatus(student, sub, 'completed')` 抛 `PermissionError`；
- `transitionStatus(student, sub, 'excellent')` 抛 `PermissionError`；
- `db.submissions.update` 学员直写 `{status:'completed'}` 抛错（Repository 断言）；
- `transitionStatus(teacher, sub, 'completed')` 成功；
- 页面渲染断言：学员视角无 `completed/excellent` 选项（实浏览器 verify 脚本）。

---

## 九、每阶段自动化测试与人工验收标准（第 9 项 · 对应 P0–P6）

参考 CP2.1 的 `verify_formal/verify_false/verify_prod.mjs` 实浏览器验收模式。

### P0（越权修复）
- **自动化（vitest）**：上述 5 条断言全过；`STUDENT_SETTABLE_STATUS` 守卫不变。
- **人工验收**：学员在档案页 WorksTab 看不到 5 状态下拉；学员只能提交/重提；教师仍能正常退回/完成/优秀。

### P1
- **自动化**：学员仅能写自身可写字段（含 `nickname`）；教师仅能写教师字段；关键修改产生 `operation_logs` 且 `user_id`=真实用户（非 `system`）；日志查看页按 `target` 过滤。
- **人工验收**：学员编辑自我介绍/目标/AI基础并保存；教师写标签/观察/建议；日志页显示"谁在何时改了什么"。

### P2
- **自动化**：`assignments.insert/update` 经权限守卫；作业 `status` 生命周期流转正确（draft→published→closed→archived）；有提交后 `remove` 被拒；真实题目/评分标准种子入库。
- **人工验收**：教师能新建并编辑作业（含真实题目/多 rubric 项、截止、生命周期）；学员看到 published 作业、看不到 draft。

### P3
- **自动化**：上传图片/PDF/Office 成功写 `files.storage_key`+`uploaded_by`+`checksum` 且**不**写 Base64 进 localStorage；`adapter.get/delete` 正确；类型/大小越界被拒；被引用文件删除被拒；adapter 失败不生成 `files` 行。
- **人工验收**：上传真实图片并预览、下载、删除；作业提交带附件；`public/demo-assets` 不再 404（改走 IndexedDB）。

### P4
- **自动化**：学员提交后 `submission.status=to_review`、生成 `work_version`；草稿不置 `to_review`；重提生成新版本且旧版本 `is_final=false`；学员**不能**置教师评定态（P0 守卫复用）。
- **人工验收**：学员能保存草稿、提交、被退回后重提；附件随版本可见。

### P5
- **自动化**：`assignment_rubric_items` 多评分项写入；教师针对 `work_version_id` 逐项打分生成 `submission_rubric_scores`；总分/总评正确；重提后旧版本评分保留；`published` 评估经 `getStudentComparison` 返回真实证据（含 `assessment_evidences` 快照）；`evidence_id` 不再恒 null；`is_internal` 证据学员不可见。
- **人工验收**：评估页展示"operation=L3，证据：作品版本 #2（图）"；学员端仅见 `published`、不见内部观察与逐项明细（除非教师开放）。

### P6
- **自动化**：聚合页数据来自 `ability_assessments`+`learning_records`，无孤立数据；真实种子（林淑芬档案、提示词/出图/数据处理作业）生效；视觉回归（白底橙色、无空洞骨架）。
- **人工验收**：成长记录页有真实能力雷达、时间线、下一步计划；全面替换占位，页面不空洞。

---

## 十、阻塞 vs 后补（第 10 项）

### 阻塞（必须做，否则闭环不成立）
1. **P0 越权**（断点 5）——数据正确性与权限基线，先于一切。
2. **作业无法被教师创建/编辑**（断点 1）——闭环起点缺失。
3. **学员提交无草稿/附件**（断点 + P4）——数据完整性。
4. **文件无上传/存储**（断点 3）——作业与评估证据无载体。
5. **能力评估与作业证据未连通**（断点 4）——"批改→能力"靠人工文本桥接，违背目标闭环。
6. **评分标准无结构化**（D/E 提案）——无法逐项评分、权重、维度联动。

### 后补（可延后，不阻断主链路）
- 云端对象存储替换本地 IndexedDB（P3 后可延，本地已满足演示）。
- 真实在线数据库 + 真实登录（0.1.2 B 形态，须独立授权）。
- AI 自动从作业推导能力（`source='ai'`，暂不实装，人工选级即可）。
- 移动端深度适配、通知/提醒、课堂记录自动采集。
- CP2.3 教学沟通、CP2.4 预警与待办正式化（当前冻结，有数据无页面）。

---

## 十一、真实 AI 培训演示内容样例（杜绝空洞）

> 以下样例用于种子数据与验收脚本，替换现有占位字符串；仍遵循"真实数据、不生成模拟判断"。

**课程**：`AI 应用实战训练营`（已有 12 课真实标题：AI 是什么 / 注册与基础操作 / 提示词基础 / AI 写作入门 / AI 生成图片 / AI 制作 PPT / AI 数据处理 / AI 智能体初探 / AI 视频生成 / 综合项目一 / 效率工作流 / 结课与作品打磨）。

**作业样例（真实题目 + 多评分项 rubric）**
- 课3 提示词基础：「为社区公众号写一篇《用 AI 帮老人修图》的提示词，输出 3 个迭代版本并说明差异。」
  rubric：`针对性 30 / 结构清晰 30 / 迭代说明 20 / 实用 20`（关联 dimension 以 `prompt` 为主）。
- 课5 AI 生成图片：「用 Midjourney 生成'适老化智能药盒'产品宣传图 3 张，附提示词与选型理由。」
  rubric：`主题契合 30 / 提示词质量 30 / 多样性 20 / 说明 20`（关联 `operation`）。
- 课7 AI 数据处理：「用表格 AI 分析 100 条用户反馈，输出高频问题与情绪分布表。」
  rubric：`数据准确 30 / 维度完整 30 / 可视化 20 / 结论 20`（关联 `application`）。

**学员档案样例（真实）**
- 展示名（nickname）：林淑芬；职业：社区服务中心干事；目标：用 AI 做适老化宣传；自我介绍："我希望把社区活动用更生动的图文传达给老年人"；AI 基础：beginner；常用工具：ChatGPT、豆包；每周时间：5h。
- 教师标签：["需关注提示词细节"]；教师观察（内部，最近汇总）："能完成基础写作，但提示词缺乏角色设定"；学习建议（对学员）："下一阶段练习给 AI 设定'社区干事'角色，附 2 个范例"。

**文件样例（真实）**
- `适老化宣传文案.md`（作业文字答案）、`药盒宣传图.png`（Midjourney 出图）、`反馈分析表.xlsx`（数据处理作业）。预览与下载均走 IndexedDB（`storage_key`+`uploaded_by`+`checksum`）。

---

## 十二、设计落实要点（白底橙色，不空洞）
- **主色**：橙色 `#f4791f` 仅用于主按钮、当前态、关键数据（如 `excellent`、能力等级高亮）；背景纯白 `#fff`，卡片白底细描边。
- **不空洞策略**：用上述真实演示数据填充卡片；聚合展示（能力雷达、提交时间线、班级分布、rubric 评分明细）替代骨架占位；列表默认带真实样例，无数据时明确"暂无记录"而非假数据。
- **不堆砌**：每页只放与当前角色相关的信息（学员不见内部观察/草稿/逐项明细），避免为填满而加无关模块。

---

## 十三、规划状态与修订清单（本轮要求「八」）

### 规划状态（结论）
> **CP2.1 技术验收通过，产品闭环验收未通过，暂不创建 cp2.1-final 标签。**

### 本轮（v2）新增与修改章节
1. **新增**「0.1 系统定位与边界」：单机演示版(A) vs 真实培训版(B)、接口可替换（DataLayer/FileStorageAdapter/AuthContext/在线 DB 适配器）、不擅自接入外部、单机版无法跨设备同步的边界声明。
2. **新增**「二、作业生命周期」：`draft→published→closed→archived` 逐项（可见性/可编辑/截止补交/删除限制/权限日志）+ 补交控制字段提案。
3. **新增**「三·D/E/F」评分标准与逐项评分模型：`assignment_rubric_items`、`submission_rubric_scores` 表提案（含迁移/兼容/权限/回滚），核查现有 `Assignment.rubric` 单字符串无法支持。
4. **细化**「三·C / 四 / 六」证据关系：`assessment_evidences` 的 source_type/source_id/snapshot/is_internal/来源删除处理/学员可见。
5. **修正**「三·A / 五 / 四」学员档案：明确 `Student.nickname` 为展示名唯一源，不与 `User.name` 混用；self_intro/ai_baseline 为当前摘要；教师观察优先复用 `learning_records`/`concerns` 不覆盖历史。
6. **补全**「三·B / 六」文件方案：核查 `files` 已有 name/mime/size/owner/created_at，缺失 uploaded_by/checksum/storage_key；补关联方式、防误删、孤文件清理、假元数据禁止、storage_key 权限绕过禁止。
7. **重排**「八」阶段顺序为 **P0–P6**（P0 越权三层防护 + 独立实施方案 8.1），并同步更新「九」测试验收标准。
8. **新增**「十三」规划状态与修订清单。

### 所有待确认字段/表提案（汇总）
- **字段**：`Student.{self_intro, ai_baseline, teacher_tags, teacher_observation, learning_suggestion}`；`files.{storage_key, uploaded_by, checksum}`；`Assignment.{status, allow_late, late_due_date}`。
- **新表**：`assessment_evidences`、`assignment_rubric_items`、`submission_rubric_scores`。
- **不新增表**：`submissions` 草稿态优先零结构变更（H）；`operation_logs` 仅改 `user_id` 来源不改表（G）。
- 以上均为提案，待确认后按"提案制"逐独立项、最小落地。

### 单机版与真实在线版的差异（摘要）
| 项 | 单机演示版（本轮） | 真实在线版（未来，不实现） |
|---|---|---|
| 数据库 | LocalDataLayer + localStorage | 中央 DB + 在线 API |
| 文件 | FileStorageAdapter=IndexedDB | 同 adapter=云端对象存储 |
| 登录 | AuthContext 内存态+演示账号 | 真实身份+持久会话 |
| 同步 | 仅本机本浏览器，**不能跨设备** | 教师电脑↔学生手机实时同步 |
| 外部依赖 | 无（离线可跑） | 须独立授权后接入 |

### P0 越权修复独立实施方案（摘要）
三层防护：① 页面移除学员 5 状态下拉，仅保留提交/草稿/重提；② `submissionService.transitionStatus` 拒绝学员设 `need_revise/completed/excellent` 与非法转换；③ `permissions.canSetSubmissionStatus` + `LocalDataLayer.submissions.update` 断言兜底。配套 5 条 vitest + 实浏览器 verify 断言。详见第八节 8.1。

---

*本规划为 CP2.2 草案 v2，所有字段/表新增均为提案，待确认后按"提案制"逐个最小落地；本轮未改动 `src`、未新增库字段、未提交、未启动开发。CP2.2–2.4 保持冻结。*
