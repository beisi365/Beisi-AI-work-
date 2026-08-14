# CP2.1 固化 + 正式入口开放 · 验收报告

> 分支：`cp2-development` ｜ 日期：2026-08-14 ｜ 仅限 cp2-development，未合并 main、未修改 cp1-final。

## 一、两次提交

### 提交 1 · `f28f04c` — 固化 CP2.1 能力评估与权限修复（11 文件）
| 状态 | 文件 | 说明 |
|---|---|---|
| M | `src/App.tsx` | RoleOnly 按 `roleHome` 重定向修复 + dev 路由 `import.meta.env.DEV` 守卫 |
| M | `src/lib/assessments.ts` | 类型定义 + 查询服务（原子替换、对比等） |
| M | `src/pages/cp2/AssessmentsDevPage.tsx` | 教师 Dev 页 |
| M | `src/pages/cp2/StudentAssessmentsDevPage.tsx` | 学员 Dev 页 |
| M | `tests/assessments.test.ts` | 单元测试（+6 用例，共 27） |
| A | `src/lib/routeHome.ts` | RoleOnly 辅助 |
| A | `docs/cp2-plan/cp21-acceptance-report.md` | 验收报告 |
| A | `docs/cp2-plan/cp21-verification-overview.md` | 验收总览 |
| A | `docs/cp2-plan/verify_cp21.mjs` | 长期回归（dev 路由） |
| A | `docs/cp2-plan/verify_build.mjs` | 长期回归（生产构建守卫） |
| M | `.gitignore` | 忽略 `docs/cp2-plan/shots/`、`accept/`、`accept_cp21.mjs` |

`featureFlags.assessments` 保持 `false`；提交后 `git status` 干净，临时验收产物因 `.gitignore` 不再显示。

### 提交 2 · `5684209` — 开放 CP2.1 能力评估正式入口（8 文件，amend 纳入路由守卫）
| 状态 | 文件 | 说明 |
|---|---|---|
| M | `src/App.tsx` | 学员路由接入 `StudentAssessmentsPage`；**正式路由受 `isCp2Enabled('assessments')` 守卫**（开关 false 时路由不注册） |
| M | `src/lib/featureFlags.ts` | `assessments: true` |
| M | `src/pages/cp2/AssessmentsDevPage.tsx` | 改为薄壳引用共享组件（保留 Dev 路由） |
| M | `src/pages/cp2/StudentAssessmentsDevPage.tsx` | 改为薄壳引用共享组件（保留 Dev 路由） |
| M | `src/pages/cp2/AssessmentsPage.tsx` | 占位 → 真实教师页 |
| A | `src/pages/cp2/StudentAssessmentsPage.tsx` | 新建真实学员页 |
| A | `src/components/assessments/TeacherAssessmentComposer.tsx` | **共享核心组件**（教师端：选学员/六维/状态流/移动向导/历史/早期评估） |
| A | `src/components/assessments/StudentAssessmentViewer.tsx` | **共享核心组件**（学员端：六卡/对比/早期评估） |

> 复用约束落实：正式页与 Dev 页共用同一评估服务（`src/lib/assessments.ts`）与同一核心组件（`TeacherAssessmentComposer` / `StudentAssessmentViewer`），**未形成两套业务逻辑**；Dev 页保留不删，仍受 `import.meta.env.DEV` 守卫。

## 二、最新全量结果

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | **0 错误** |
| `npx vitest run` | **71 passed (9 files)**（assessments 27 + CP1 44） |
| `npm run build` | **成功**（dist JS 268KB / 72 modules） |
| 浏览器运行时错误 | 仅 `favicon.ico` 404（良性，应用未内置 favicon） |

## 三、第三步回归验收（puppeteer 实浏览器）

### 正式入口（flag=true）8/8
| 项 | 结果 |
|---|---|
| 教师正式 `/t/assessments`：标题/六维/选择学员 | ✅ dim=8, sel ✅ |
| 正式入口不含“内部开发页”字样 | ✅ |
| 教师导航显示“能力评估” | ✅ |
| 发布后状态显示“已发布” | ✅ |
| 学员正式 `/s/assessments`：标题/六卡/证据 | ✅ cards=6, ev ✅ |
| 学员导航显示“我的评估” | ✅ |
| 刷新行为（架构既定，见说明） | ✅ 回 `/login` |
| 越权拦截：学员访问 `/t/assessments` → `/s/home` | ✅ |

### 开关关闭回退（flag=false）4/4
| 项 | 结果 |
|---|---|
| 教师导航不显示“能力评估” | ✅ |
| 教师直接访问 `/t/assessments` → 重定向（路由不可用） | ✅ |
| 学员导航不显示“我的评估” | ✅ |
| 学员直接访问 `/s/assessments` → 重定向（路由不可用） | ✅ |

### 生产构建（vite preview, DEV=false）3/3
| 项 | 结果 |
|---|---|
| 正式 `/t/assessments` 可访问（路由存在） | ✅ |
| `/t/dev/assessments` 不可访问（重定向 `/t/overview`） | ✅ |
| `/s/dev/assessments` 不可访问（重定向 `/s/home`） | ✅ |

## 四、双端与关键截图（docs/cp2-plan/accept/formal/）
- 教师正式桌面 `F_teacher_1440.png`、手机 `F_teacher_390.png`
- 学员正式桌面 `F_student_1440.png`、手机 `F_student_390.png`
- 越权拦截 `F_perm_denied.png`
- 开关关闭：导航 `F_false_nav_teacher.png`、路由重定向 `F_false_route_teacher.png`
- 生产构建：正式 `P_formal_teacher.png`、dev 重定向 `P_dev_teacher_redirect.png` / `P_dev_student_redirect.png`

## 五、边界保持
- `main` 与 `cp1-final` 均 = `a5b01c9`（CP1 基线），**未动**；`cp2-development` 当前 tip = `5684209`。
- CP2.2 / 2.3 / 2.4 **冻结、未启动**（占位页仅 `Cp2Placeholder`）。
- Dev 页保留，继续受 `import.meta.env.DEV` 守卫；正式页与 Dev 页复用同一核心组件。
- 未混入任何仓库外文件或独立 HTML 原型（原型不属本仓库，不进 Git）。

## 六、重要说明：刷新直达（已知限制）
本项目 `AuthContext` 采用**内存登录态**（刻意不持久化，刷新即回登录页）的**已知架构限制**，以遵守“页面/组件不引用本地存储、唯一访问点在 LocalDataLayer”的架构约束（CP1 既有设计）。因此整页刷新回到登录页是**全局既定行为，非 CP2.1 缺陷**。已验证：在已登录会话内通过导航直达 `/t/assessments`、`/s/assessments` 正常（pushState 导航验收已通过）。若需“刷新保持登录态”，需另行评估 `AuthContext` 持久化改造（涉及架构约束变更，不在本轮授权范围）。

## 七、本次归档（第三次提交）
`docs/cp2-plan/cp21-formal-acceptance-report.md`、`verify_formal.mjs`、`verify_false.mjs`、`verify_prod.mjs` 纳入第三次提交「补充 CP2.1 正式验收与长期回归脚本」。三个脚本均为**自包含长期回归工具**：从脚本自身位置解析项目根、自动检测空闲端口启动 dev/preview、在 `finally` 中关闭服务与 Chrome、断言失败返回非 0 退出码、仅写入已被 `.gitignore` 忽略的 `accept/formal/`、不访问外部网络、不执行 git 操作。`verify_false` 修改开关后无论成败均恢复 `true`。临时截图产物位于 `docs/cp2-plan/accept/formal/`，已被 `.gitignore` 忽略。

## 八、git status --short
```
(第三次提交前)
?? docs/cp2-plan/cp21-formal-acceptance-report.md
?? docs/cp2-plan/verify_false.mjs
?? docs/cp2-plan/verify_formal.mjs
?? docs/cp2-plan/verify_prod.mjs

(第三次提交后：4 文件已跟踪，工作树干净；shots/、accept/、accept_cp21.mjs 因 .gitignore 不显示)
```
