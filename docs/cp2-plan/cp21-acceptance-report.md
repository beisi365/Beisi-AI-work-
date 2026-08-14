# CP2.1 浏览器人工验收报告

> 范围：仅 CP2.1 隐藏 dev 路由（`/t/dev/assessments`、`/s/dev/assessments`）。
> 约束：不开启 `featureFlags.assessments`；不替换正式路由；不进入 CP2.2–CP2.4；不处理 student-desk；不动 main/cp1-final。
> 验收方式：puppeteer-core 驱动本地 Chrome 访问 dev server（5173），真实渲染 + 真实交互 + 视觉截图核验（非文件大小替代）。

---

## 1. 实际访问地址

| 项 | 值 |
|---|---|
| dev server | `http://localhost:5173`（vite dev，`cp2-development` 分支） |
| 教师隐藏路由 | `http://localhost:5173/t/dev/assessments` |
| 学员隐藏路由 | `http://localhost:5173/s/dev/assessments` |
| 守卫 | `import.meta.env.DEV`（仅开发环境注册，生产构建不出现） |
| 路由注册 | `src/App.tsx`（仅 cp2-development 工作树改动中，未提交） |

---

## 2. 教师端逐项验收（9 项重点）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| T-1 | 选择学员是否正确 | ✅ | 选中 s01 后 `select.value === 's01'`，页面渲染 s01 数据 |
| T-2 | 六维能力是否全部展示 | ✅ | 基础认知/需求拆解/提示词/工具操作/判断甄别/应用落地 6 项标签均在页面 |
| T-3 | 新建草稿是否允许部分未填写 | ✅ | 仅填 2 维（L3+L2）即可保存为草稿（已完成 2/6），未填维度渲染"请选择等级"/"（无事实证据）" |
| T-4 | 确认前是否强制六维完整 | ✅ | 部分草稿的"确认"按钮 `disabled=true`（断言通过，截图 T6 可见置灰） |
| T-5 | 事实证据是否正确保存 | ✅ | 发布组含录入的 6 条证据原文（含第 1 条与第 6 条），字段值未截断 |
| T-6 | 草稿→确认→发布→作废→修正 状态流 | ✅ | A 草稿→已确认→已发布 v1；点修正后旧组仍 `已发布`、新组 `草稿`；新组确认+发布后旧组 `已作废`、新组 `已发布` v2 |
| T-7 | 修正版是否形成新的 `assessment_group_id` | ✅ | v1=`df7a7f9c-...`、v2=`8d740a85-...`（两次运行 UUID 不同，均为同事务内新 UUID） |
| T-8 | 历史批次是否完整、不可误覆盖 | ✅ | 旧组 voided 后仍以 `已作废` Tag 列出且 groupId 保持；CP1 遗留（"早期单项评估（CP1 遗留）"区）完整保留 |
| T-9 | 教师操作是否不会直接修改作业状态 | ✅ | 完整发布 v2 前后对 `localStorage.aiwb_db_v1.submissions` 做 JSON 快照对比，完全一致 |

## 3. 学员端逐项验收（6 项重点）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| S-1 | 只能看到自己的数据 | ✅ | 正则匹配他人 id（s02..s20）0 次命中；仅本人 s01 卡片 |
| S-2 | 只能看到 published 状态 | ✅ | 顶部汇总标签显示本人最近一次 published 的对比（提升/下降/持平维数） |
| S-3 | draft/confirmed/voided 是否完全不可见 | ✅ | 精确判定 `.tag` 状态徽标：草稿/已确认/已作废 均为 0（页面说明文案"这里展示老师已确认发布的能力评估…"中的"已确认"不计为状态泄露） |
| S-4 | 页面是否只读 | ✅ | `<textarea>/<select>` 输入元素 0 个；确认/发布/修正/编辑/作废/删除类动作按钮 0 个 |
| S-5 | 六维结果和证据说明是否清楚 | ✅ | 桌面 2×3 网格共 7 张能力卡（6 维 + 历史对照），每张含当前等级、上次等级、变化徽标、评估日期、证据原文 |
| S-6 | 历史记录时间顺序是否正确 | ✅ | "早期单项评估"区日期按 `assessed_at` 倒序排列（断言比对有序） |

## 4. 视觉与响应式验收

| 项 | 结果 | 备注 |
|---|---|---|
| 桌面 1440×900 渲染 | ✅ | T1/T3/T5/T6/P1 截图完整可读 |
| 手机 390×844 渲染 | ✅ | T8 教师分步向导单维聚焦；S2 学员单列卡片 |
| 白色主视觉 + 橙色重点点缀 | ✅ | `tokens.css` 定义 `--color-bg:#ffffff` + `--color-accent:#f4791f`；截图主按钮、Logo、强调色均为橙色，与设计系统一致 |
| 手机底部导航不遮挡内容 | ✅ | `.main` 在移动端 `padding-bottom≥80px`（断言通过）；教师分步向导 sticky 按钮条 `bottom:64` 避让底部 Tab |
| 长证据文字不溢出 | ✅ | 证据文本在卡片内自然换行，无横向溢出 |
| 空状态/错误提示不溢出 | ✅ | "暂无评估组"、"暂无已发布评估"、"无早期单项记录"、"暂无评估组；该学员还没有分组评估记录"等空态文案居中、边框克制 |
| 未用文件大小代替视觉验收 | ✅ | 直接 Read 截图核验（T1/S1/T8/S2/T6/P1 六张关键图） |

## 5. 权限验收

| 项 | 结果 |
|---|---|
| 学员访问 `/t/dev/assessments` 被拒并回 `/s/home` | ✅（path=/s/home 且不出现教师 dev 页文案） |
| 教师隐藏路由仅开发环境注册 | ✅（`import.meta.env.DEV` 守卫，生产构建不出现该路由） |
| 学员页面不泄露他人姓名/排名/教师内部 AI 原文 | ✅（页面无 s0X 模式泄露，无 AI 原文回显） |

---

## 6. 发现的问题及严重程度

| # | 问题 | 严重度 | 处理 |
|---|---|---|---|
| 1 | 验收脚本首版用 `textContent.includes('已确认')` 判定学员页泄露，误判（实际为说明文案"这里展示老师已确认发布的能力评估…"中的"已确认"字串） | 低（脚本误判，非产品缺陷） | 已修正为按 `.tag` 状态徽标精确判定，重跑 25/25 全过；产品代码未改动 |
| 2 | 浏览器自动请求 `http://localhost:5173/favicon.ico` 返回 404 | 低（应用未内置 favicon，属良性资源缺失） | 不影响功能；建议后续按需添加 favicon，但不属于 CP2.1 阻塞缺陷，**不在本轮修复范围** |
| 3 | （无） | — | — |

**未发现任何阻塞性缺陷**。所有 25 项断言 + 6 张视觉截图均符合预期。

## 7. 修复前后截图

本轮未触发任何产品代码修复（无阻塞性缺陷）。所有截图均为"修复后"实态（即验收通过状态）：

- 桌面教师：`accept/T1_teacher_initial_1440.png`、`T2_teacher_draft_A_1440.png`、`T3_teacher_published_v1_1440.png`、`T4_teacher_revised_1440.png`、`T5_teacher_published_v2_1440.png`、`T6_teacher_partial_B_1440.png`、`T7_teacher_overview_final_1440.png`
- 手机教师：`accept/T8_teacher_mobile_390.png`
- 桌面学员：`accept/S1_student_1440.png`
- 手机学员：`accept/S2_student_mobile_390.png`
- 权限拒绝：`accept/P1_permission_denied_1440.png`

---

## 8. 自动化基线（最新真实结果）

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | **0 错误**（由 `npm run build` 内 `tsc --noEmit && vite build` 间接确认） |
| 单元测试 | `npx vitest run` | **71 passed (9 files)**：`assessments.test.ts` 27 用例（CP2.1 修正 6 项） + CP1 全部 44 用例 |
| 生产构建 | `npm run build` | **成功**；dist `index.html` 0.42 kB / CSS 19.57 kB / JS 254.06 kB；69 modules |
| 浏览器运行时错误 | puppeteer `pageerror/console.error` | **0**（除 1 条 favicon 404 资源警告） |
| 验收脚本 | `node docs/cp2-plan/accept_cp21.mjs` | **25/25 passed**（教师 15 + 学员 6 + 权限 1 + 移动端 3） |

## 9. `git status --short`

```
 M src/App.tsx
 M src/lib/assessments.ts
 M src/pages/cp2/AssessmentsDevPage.tsx
 M src/pages/cp2/StudentAssessmentsDevPage.tsx
 M tests/assessments.test.ts
?? docs/cp2-plan/accept/
?? docs/cp2-plan/accept_cp21.mjs
?? docs/cp2-plan/cp21-acceptance-report.md
?? docs/cp2-plan/cp21-verification-overview.md
?? docs/cp2-plan/shots/
?? docs/cp2-plan/verify_build.mjs
?? docs/cp2-plan/verify_cp21.mjs
?? src/lib/routeHome.ts
```

- `M` 5 个文件 = CP2.1 正式开放前 9 项修正（cp2-development 工作树**未提交**）
- `??` 验收脚本与产物（未跟踪，不在 `main`/`cp1-final`）
- `main` 与 `cp1-final` 均 = `a5b01c9`（CP1 基线），自基线确认后未变动
- `featureFlags.assessments` 仍为 **`false`**（其余四个开关亦全 `false`）

## 10. 是否建议开启 `featureFlags.assessments`

**结论：可以开启，但建议按既定流程分两步走，不要一次性自动完成。**

### 可以开启的依据（CP2.1 自身已达标）

| 维度 | 状态 |
|---|---|
| 功能完整（自动化 25/25） | ✅ |
| 权限安全（RoleOnly 重定向、dev 路由守卫） | ✅ |
| 数据隔离（学员不泄露 draft/confirmed/voided/他人） | ✅ |
| 业务不越界（教师评估操作不改 submissions） | ✅ |
| 视觉设计系统（白底 + 橙色）一致 | ✅ |
| 移动端无遮挡、长内容不溢出 | ✅ |
| 单元测试 71/71、tsc 0、build 成功 | ✅ |
| 历史批次完整、原子替换、新 group_id | ✅ |

### 建议的两步走流程（需要你单独确认，不要自动执行）

1. **先固化 CP2.1**：`git add` 上述 5 个 `M` + 11 个 `??`（含验收产物）→ 提交到 `cp2-development`，打 tag 或合并到 `main` 由你定。**不**开启 `featureFlags.assessments`，**不**替换正式路由。
2. **再授权正式开放**：单独确认 `featureFlags.assessments = true`，把 `src/pages/cp2/AssessmentsPage.tsx` / `StudentAssessmentsPage.tsx` 从占位替换为 dev 版的只读/正式入口（`/t/assessments`、`/s/assessments`），`AppShell` 导航点亮"能力评估"。

> 本轮按你的指令，**不会自动开启 featureFlags、不替换正式路由、不提交 CP2.1、不进入 CP2.2**。等待你单独确认。

---

## 11. 附：验收产物清单（不提交进项目，需时单独归档）

| 路径 | 说明 |
|---|---|
| `docs/cp2-plan/accept_cp21.mjs` | 浏览器人工验收脚本（puppeteer-core） |
| `docs/cp2-plan/accept/`` | 11 张双端截图 + `accept_results.json` |
| `docs/cp2-plan/verify_cp21.mjs` | 上一轮交互验证脚本 |
| `docs/cp2-plan/verify_build.mjs` | 上一轮生产构建验证脚本 |
| `docs/cp2-plan/shots/` | 上一轮 16 张截图与结果 JSON |

— 完 —