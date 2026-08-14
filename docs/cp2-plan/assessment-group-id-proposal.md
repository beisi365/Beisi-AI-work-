# 字段变更提案：`ability_assessments.assessment_group_id`

> 类型：**最小字段变更提案（待确认）**。按"提案制"纪律提交，**未经确认不得修改 `types.ts` 或任何数据结构**。
> 触发原因：CP2.1 已批准启动；经只读核对，`ability_assessments` 六维分多行存储且无统一批次键（见下文"现状核查"），故依用户硬纪律提交本提案并暂停结构改动。

---

## 1. 现状核查（只读，已确认）

- `AbilityAssessment` 接口（`src/data/types.ts:270-283`）现有字段共 12 个：
  `id, student_id, dimension, level, source, evidence_id, ai_suggested_level, teacher_confirmed_level, assessed_at, created_at, updated_at, created_by`。
- 全仓 `grep` `assessment_group|group_id|batch|assessment_id` → **无匹配**：不存在批次/分组键。
- 种子逻辑（`src/data/seed.ts:448-478`）：每名学员 × 每维各一条 `baseline` 行；`progress`/`strong` 学员再追加一条 `teacher` 快照行。**六维各自成行，彼此无关联键**。
- 用户明确禁令：**不得用时间戳推断批次**（即不能靠 `assessed_at` 近似归批）。

---

## 2. 为什么需要这个字段

CP2.1 已确认的设计需要把"一次教师完整评估（覆盖该学员六维）"和"一次修正（六维新版本）"作为**一组**来管理：

1. **批次级作废**：`status` 含 `voided`，应能整体作废一次评估的全部六维，而非逐行操作。
2. **修正版本分组**：修正时创建新版本并保留旧记录；同一批次的新旧版本需可聚合对比，否则历史会散成 12/18 条孤立行，无法还原"哪次评估改了哪次"。
3. **历史按批次展示**：教师端时间轴与学员端对比，应以"评估批次"为单位呈现，而非单维碎片。
4. **合规**：不能用 `assessed_at` 推断批次（用户禁令），必须有显式键。

---

## 3. 提案内容（最小变更）

**新增字段**（可空，向后兼容）：
```ts
assessment_group_id: string | null; // 同一评估批次（覆盖六维）的共享 ID；遗留数据可为 null
```

- 类型：`string | null`，**可空**是关键——保证旧数据与未分组行不报错。
- 生成规则（仅新数据，由 CP2.1 UI 写入）：教师发起一次评估/修正时，前端生成 1 个 UUID 作为该批次六行的 `assessment_group_id`。
- 不依赖时间戳、不推断；纯显式赋值。

---

## 4. 迁移方式（兼容"不得用时间戳推断批次"）

- **迁移脚本**：遍历 `ability_assessments` 现有行。
  - 规则：**不按时间戳归批**。将每一条遗留行视为独立遗留记录，置 `assessment_group_id = null`（标记为 legacy ungrouped）。
  - 即现有数据保持 `null`，不臆造批次；CP2.1 之后新建的评估才有真实 group id。
- 这样完全回避"用时间戳推断批次"的禁令，且迁移幂等（重复执行结果一致：仍为 null）。
- 若未来希望把遗留 baseline+snapshot 也分组展示，可另起一个**显式回填脚本**（仍不以时间戳推断，而由人工/明确规则指定），不在本次强制。

---

## 5. 兼容性

- 字段可空，旧代码（`getAbilityCurrent` / `getAbilityHistory` / 权限 `canRead`）忽略该列，行为不变。
- 新查询（如 `getAssessmentGroups`）仅对 `assessment_group_id != null` 的行生效；`null` 行按单条处理。
- `DBShape` 类型新增可选字段，序列化/反序列化向后兼容（localStorage 整库 JSON 自动包含新键：`null`）。

---

## 6. 回滚方案

- 纯**新增可空列**，无删除/改名/类型变更。
- 回滚 = 删除该列（`ALTER`/类型移除）即可，历史数据无损失（`null` 值丢弃无影响）。
- 迁移脚本只写 `null`，回滚后无任何残留副作用；可随时重跑。

---

## 7. 与已批准字段的关系

- 已批准（可直接实施，无需再提案）：`status: 'draft'|'confirmed'|'published'|'voided'`（现有数据迁 `published`，新记录默认 `draft`）；`evidence_text: string | null`（draft 可空，进 `confirmed` 前须有具体事实证据或现有记录关联）。
- 本提案字段 `assessment_group_id`：**未批准，待确认**。在它确认前，CP2.1 的结构改动（含 `types.ts` 任何字段增删）一律暂停。

---

## 8. 待确认

请确认是否采纳 `assessment_group_id: string | null`，以及迁移采用"遗留行置 `null`（不按时间戳归批）"方案。
确认后，我将：
1. 在 `types.ts` 一次性加入 `status`、`evidence_text`、`assessment_group_id` 三字段；
2. 写迁移/种子兼容逻辑；
3. 实现教师端录入流程、学员端只读、隐藏测试路由、`getAbilityCurrent/History` 升级与 `getAssessmentGroups` 新查询；
4. 跑通文档 16 项测试 + CP1 全部 44 项回归，零回归后提交 `cp2-development`。

若否决本提案，则需明确替代方案（例如：CP2.1 暂不支持批次级作废/分组历史，仅做单维独立版本管理）。
