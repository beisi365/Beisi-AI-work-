# CP2.1 验收前核验记录（Pre-acceptance Verification）

> 目的：在用户通过隐藏 dev 路由内部验收前，确认 CP2.1 编码已真实落地、零回归、未破坏 CP1、功能开关保持关闭。
> 核验时间：2026-08-13 会话收尾阶段
> 核验方式：读源码 + 实跑测试（`npx vitest run`）+ git/分支/开关检查

## 1. 分支与基线状态

| 项 | 值 |
| --- | --- |
| 当前分支 | `cp2-development`（HEAD = `6393aa9`） |
| `main` / `cp1-final` 标签 | `a5b01c9`（未动） |
| `featureFlags.assessments` | **`false`**（保持关闭，未向正式导航开放） |
| 提交记录 | `c84f44d` 实现、`6393aa9` 文档状态（落 `cp2-development`） |

## 2. 三字段提案落地（`src/data/types.ts`）

- `AssessmentStatus = 'draft' | 'confirmed' | 'published' | 'voided'`
- `AbilityAssessment` 新增：`status`、`evidence_text: string | null`、`assessment_group_id: string | null`
- 读取兼容：`status === undefined` 视为 `published`（遗留 CP1 数据按已发布参与 CP1 摘要与历史）

## 3. 服务层能力（`src/lib/assessments.ts`）—— 逐条对照用户约束

| 用户约束 | 实现 | 落地 |
| --- | --- | --- |
| 新 group_id 非空 + UUID/稳定随机 | `genGroupId()` 优先 `crypto.randomUUID()`，回退 UUID 形状；`isUuidLike()` 校验 | ✅ |
| 一次评估六维共用一组 ID | `createAssessmentGroup` 生成单一 groupId，循环插入六维 | ✅ |
| 同组同属一学员/一教师/一次评估 | 创建时统一 `studentId`/`teacherId` | ✅ |
| 维度不得重复 | `seen` Set 校验，重复即抛错且零写入 | ✅ |
| draft 允许维度未完成；confirmed 须六维齐全+证据完整 | `confirmAssessmentGroup` 校验 `hasAllDimensions` + `isEvidenceComplete` | ✅ |
| 确认/发布/作废/修正整组原子、失败回滚 | 全部包 `db.transaction`（`cache` 快照，任一步抛错整体回滚） | ✅ |
| 已发布禁止直接修改；修正建新组 + 旧组整组 voided | `reviseAssessmentGroup` 建新草稿组并将旧组整组 `voided` | ✅ |
| 遗留 null 继续参与 CP1 摘要与单维历史 | `getAbilityCurrent`/`getAbilityHistory` 过滤 `status===undefined || 'published'` | ✅ |
| 在 CP2 完整历史标「历史单项记录」，不按时间戳伪造分组 | `getLegacyAssessments` 仅取 `group_id===null`；`listAssessmentGroups` 跳过无 group 行 | ✅ |
| 遗留不得从现有摘要消失 | `effStatus` 兼容；CP1 全部 44 测试仍全过 | ✅ |
| 学员仅见本人 published（不含 draft/confirmed/voided 与教师 AI 原文） | `getStudentAssessmentView` 仅返回本人 `published` 组 + 历史单项 | ✅ |

## 4. 测试实跑结果（零回归）

```
Test Files  9 passed (9)
     Tests  65 passed (65)   // CP1 44 + CP2.1 21
```

新增 `tests/assessments.test.ts`（21 项）覆盖：分组 ID 生成、六维唯一性、残缺组不可确认、整组状态同步、部分失败事务回滚、遗留 null 兼容、学员只见 published。
`tsc --noEmit` 零错、`npm run build` 成功（前序已验证）。

## 5. 隐藏 dev 路实验收入口

- 仅 `import.meta.env.DEV` 下注册，生产构建不渲染，不进正式导航。
- 教师端：`/t/dev/assessments`（`AssessmentsDevPage`：选学员→建六维草稿→按状态确认/发布/作废/修正；历史单项标「CP1 遗留·未分组」）
- 学员端：`/s/dev/assessments`（`StudentAssessmentsDevPage`：仅本人 published 组 + 历史单项，只读）
- 启动：`npm run dev` 后于浏览器访问（需教师/学员登录态）。

## 6. 建议验收清单（供用户逐项确认）

1. 教师端建六维草稿（可仅填部分维度）→ 保存成功；含残缺维度/缺证据时「确认」报错。
2. 补齐六维+证据 → 确认 → 发布；整组状态同步。
3. 已发布组「修正」→ 生成新草稿组 + 旧组整组 voided；旧组退出正式视图。
4. 学员端只可见本人 published 组 + 历史单项；draft/confirmed/voided 与教师 AI 原文不可见。
5. CP1 能力摘要 / 单维历史不变；旧单项在 CP2 页标「历史单项记录」。
6. `npm run build` 确认 dev 路由未进正式包、`featureFlags.assessments` 关闭。

## 7. 后续决策点（非待办，属授权项）

- 验收通过后**单独确认** `featureFlags.assessments = true` 并替换正式路由 `/t/assessments`、`/s/assessments`（当前为占位页）。
- CP2.2（教师评审）、CP2.3（教学沟通）、CP2.4（预警与待办）**仍冻结、未授权**，不可启动。
