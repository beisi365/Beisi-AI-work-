# 检查点 1（CP1）最终基线版本

> 基线日期：2026-08-14（4 项非阻塞优化完成并落盘）
> 项目：`ai-training-workbench`（AI 培训学习工作台）
> 状态：**CP1 已通过最终验收，可归档**；**CP2 未获授权启动**
> 基线性质：**Git 仓库已初始化并打标签 `cp1-final`**（详见 §5）
> 本版本同时是进入 CP2 前的真正最终基线，**不再在旧基线上打标签**

---

## 1. CP1 验收结论

用户于 2026-08-14 确认 CP1 最终验收通过，以下维度均达到**演示使用标准**：

| 维度 | 结论 |
| --- | --- |
| 业务数据 | 种子数据完整、确定性可复现（21 张表） |
| 权限 | 教师 / 学员角色边界清晰，无交集（见 §4.4） |
| 状态流转 | 5 态 submission 流转自洽（pending→to_review→need_revise/completed/excellent） |
| 学员档案 | 三率（出勤/提交/完成）、学习记录折叠组、待处理作业齐备 |
| 学习记录 | 可折叠、不合并；摘要纯真实数据，无模拟判断 |
| 作业管理 | 紧凑管理列表（20/页分页 + 筛选 + 待批改/需修改置顶 + 行展开版本历史 + 教师四按钮 + 评语与评分分离） |
| 桌面 / 手机适配 | 响应式；长页面采用 ≤1600px 分段截图避免平台压缩失真 |

**视觉验收留存图**（位于 `screenshots/`，本轮仅提交修改后关键截图）：
- `teacher-works-top.png` — 作业页首屏：分页器「共 160 条｜第 1/8 页」+ 首页/上一页禁用 + 页码 1-8
- `teacher-works-p2.png` — 翻页后「第 2/8 页」+ 首页/上一页启用
- `teacher-works-detail.png` — 展开详情：作品版本（终稿+时间+内容）+ 教师评定四按钮
- `teacher-overview-mobile-top.png` — 手机总览顶部：「平均完成率」卡片不再跨两列

---

## 2. 测试结果（已落盘）

- 原始输出：`docs/cp1-baseline/test-results.txt`
- 汇总：**8 个测试文件 · 44 个用例 · 全部通过**（较 CP1 收尾前 +8 项）

| 测试文件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| `tests/architecture.test.ts` | 1 | 架构 / 模块依赖契约 |
| `tests/seed.test.ts` | 3 | 种子数据完整性与体量与类型一致 |
| `tests/consistency.test.ts` | 1 | 跨表一致性（出勤/提交/学习记录） |
| `tests/permissions.test.ts` | 6 | 教师 / 学员权限边界 |
| `tests/pages.test.ts` | 5 | 关键页面渲染与路由 |
| `tests/business-assertions.test.ts` | 5 | 业务断言（状态流转 / 摘要真实） |
| `tests/repository.test.ts` | 5 | DataLayer 读写契约 |
| `tests/works.test.ts` | **18** | 作业分页（总数/越界/首末页禁用）/ 筛选（回第 1 页）/ 教师按钮映射 / 填写评语不改状态 / pending 不可评定 / 版本详情权限 等 |

类型检查：`tsc --noEmit` 零错误；构建：`npm run build` 成功。

---

## 3. 当前数据结构（21 张表）

存储：单例 `LocalDataLayer` + `localStorage` 单键 `aiwb_db_v1`（整库 JSON）。
种子：`buildSeed()` 确定性生成，基准时间 `Date.UTC(2026,0,5)`。

### 3.1 表清单（`DBShape`）

`users` · `students` · `teachers` · `classes` · `enrollments` · `courses` · `lessons` ·
`class_sessions` · `attendance` · `assignments` · `submissions` · `work_versions` ·
`learning_records` · `ability_assessments` · `teacher_reviews` · `ai_analysis` ·
`communications` · `concerns` · `todos` · `files` · `operation_logs`

### 3.2 关键实体（与 CP1 演示强相关）

- **Submission**（作业提交，仅状态/元信息）：`id, assignment_id, student_id, status, tools, prompts, public_allowed, final_version_id, ai_review_id, teacher_review_id`
- **WorkVersion**（唯一作品内容来源）：`id, submission_id, student_id, version_no, content, snapshot_file_id, is_final, created_at` ← 版本详情字段已齐备
- **TeacherReview**（教师评语）：`id, student_id, ref_lesson_id, teacher_id, tags, ai_draft, teacher_text, status, confirmed_at` ← 评语字段已齐备
- **FileMeta**（文件元数据，不存 base64）：`id, name, owner_type, owner_id, mime, size, mock_url, meta` ← 预览/下载入口字段已齐备
- **Student / ClassRow / Lesson / ClassSession / Attendance / Assignment / LearningRecord** 见 `src/data/types.ts`

### 3.3 种子体量（演示规模）

| 表 | 规模 |
| --- | --- |
| teachers | 2（王老师 t1 / 李老师 t2） |
| course / lessons | 1 课程 / 12 课次 |
| classes | 2（夜校一班 cl1 / 周末二班 cl2） |
| students | 20（normal 8 · behind 5 · progress 4 · strong 3） |
| class_sessions | 24（前 8 节已上 / 后 4 节待上 ×2 班） |
| assignments | 24（每班每课 1 个） |
| submissions | **160**（16 已上场次 × 10 学员；含 pending 与已提交） |
| work_versions / learning_records / ai_analysis / files | 各对应已提交数（每提交 1–3 版，末版 is_final=true） |
| ability_assessments | 162（20×6 基线 + 7 名进步/较强学员×6 后续快照） |
| teacher_reviews / concerns / communications / todos / operation_logs | 4 / 5 / 6 / 2 / 1 |

### 3.4 状态与权限边界（CP1 强制不变量）

- `SubmissionStatus`：`pending | to_review | need_revise | completed | excellent`
- 学员可设：`STUDENT_SETTABLE_STATUS = ['pending','to_review']`（不可直接 completed/excellent）
- 教师评定：`TEACHER_GRADE_ACTIONS`（退回→need_revise / 完成→completed / 评优→excellent）；**新增作品版本仅学员可用**
- 关系：`students` 经 `enrollments` 关联 `classes`；`assignments` 经 `class_session_id` 绑定场次；`submissions→work_versions` 一对多；`submissions↔teacher_reviews` 经 `teacher_review_id`

---

## 4. CP1 收尾：进入 CP2 前的非阻塞优化（已完成）

以下 4 项已于本次提交全部实施，均**不新增数据表 / 字段**（所需字段已在 §3.2 存在），并新增 8 项自动化测试覆盖。

| # | 优化项 | 实际改动 | 验证 |
| --- | --- | --- | --- |
| 1 | 手机总览「平均完成率」卡片横跨两列 | 新增 `.overview-stats` 类：桌面 `repeat(5,1fr)`，移动端 `repeat(2,1fr)` 且**末卡片不跨列**（移除对 `.stat-grid > :last-child` 的依赖）；`TeacherOverviewPage` 由 `<Grid min={150}>` 改为 `<div className="overview-stats">`，**仅调整移动端布局** | `teacher-overview-mobile-top.png` |
| 2 | 作业页分页器 | 显示「共 N 条｜第 X/Y 页」+ 首页 / 上一页 / 页码（≤9 全显示，否则窗口化含首尾与省略号）/ 下一页 / 末页；首末页正确禁用；筛选 `onChange` 调用 `resetPage()` 回第 1 页 | `teacher-works-top.png` / `teacher-works-p2.png` + `works.test.ts` |
| 3 | 教师按钮统一语义 | `TEACHER_GRADE_ACTIONS` 文案改为「退回修改／标记完成／设为优秀」（状态映射 `need_revise/completed/excellent`），新增「填写评语」按钮（仅写 `teacher_reviews.teacher_text`，**不改变 `submission.status`**）；新增纯函数 `teacherCanGrade(status)`：`pending` 时三个评分按钮 `disabled` | `teacher-works-detail.png` + `works.test.ts`（评语不改状态 / pending 不可评定） |
| 4 | 作业版本详情补充字段与入口 | 展开面板用既有字段展示：`WorkVersion.content` 或 `FileMeta.name`（+ `mock_url` 预览/下载链接）、`WorkVersion.created_at` 提交时间、`is_final` 终稿标记、`TeacherReview.teacher_text` 教师评语；无文件 → 「（无文本内容）」，无评语 → 「暂无教师评语」，无预览链接 → 「（无预览链接）」，**禁止生成虚假内容或无效链接** | `teacher-works-detail.png` |

不变量保持：
- 5 态 submission 流转不变（pending→to_review→need_revise/completed/excellent）
- 学员 / 教师权限边界无交集（`STUDENT_SETTABLE_STATUS ∩ TEACHER_GRADE_ACTIONS = ∅`）
- 新增作品版本仅学员可用（教师端不渲染「新增作品版本」按钮）
- 未引入任何新表 / 新字段 / CP2 阶段功能

---

## 5. 状态与下一步

- ✅ CP1：通过、可归档（本基线即归档快照，4 项非阻塞优化全部完成）
- ⛔ CP2：**未获授权启动**
- ✅ 本地 Git 仓库已初始化，首次提交消息为 `CP1 final baseline`，标签 `cp1-final` 指向该提交
- 复现基线：`git checkout cp1-final && npm install && npm run build && npm test`（确定性种子，结果可复现）
- 后续若进入 CP2 出现问题，可 `git checkout cp1-final` 回退至本基线
