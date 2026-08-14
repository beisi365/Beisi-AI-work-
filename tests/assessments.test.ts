import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import {
  createAssessmentGroup,
  confirmAssessmentGroup,
  publishAssessmentGroup,
  reviseAssessmentGroup,
  listAssessmentGroups,
  getLegacyAssessments,
  getStudentAssessmentView,
  hasAllDimensions,
  isEvidenceComplete,
  isUuidLike,
  ALL_DIMENSIONS,
} from '../src/lib/assessments';
import type { AbilityAssessment, AbilityLevel } from '../src/data/types';

let db: LocalDataLayer;
beforeEach(async () => {
  db = new LocalDataLayer();
  await db.reset(); // 每次从干净 CP1 种子开始
});

const sixDims = (level: AbilityLevel = 'L2', evidence = '课堂观察记录') =>
  ALL_DIMENSIONS.map((d) => ({
    dimension: d,
    level,
    source: 'teacher' as const,
    evidence_text: evidence,
  }));

describe('CP2.1 能力评估 — 数据契约与遗留兼容', () => {
  it('遗留 seed 数据迁移为 published 且 group_id 为 null', async () => {
    const rows = (await db.abilityAssessments.list()) as AbilityAssessment[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === 'published')).toBe(true);
    expect(rows.every((r) => r.assessment_group_id === null)).toBe(true);
  });

  it('遗留记录继续参与 CP1 能力摘要（getAbilityCurrent 不丢）', async () => {
    const cur = await db.getAbilityCurrent('s01');
    expect(cur.basics).not.toBeNull();
    expect(['L1', 'L2', 'L3', 'L4']).toContain(cur.basics);
  });

  it('遗留记录继续参与单维历史（含 group_id=null 单项）', async () => {
    const hist = await db.getAbilityHistory('s01', 'basics');
    expect(hist.some((r) => r.assessment_group_id === null)).toBe(true);
  });

  it('getAbilityCurrent 与 getAbilityHistory 最新已发布值一致（CP1 不变量）', async () => {
    const cur = await db.getAbilityCurrent('s01');
    for (const dim of ALL_DIMENSIONS) {
      const hist = await db.getAbilityHistory('s01', dim);
      const latest = hist[hist.length - 1];
      const expected = latest ? latest.teacher_confirmed_level ?? latest.level : null;
      expect(cur[dim]).toBe(expected);
    }
  });
});

describe('CP2.1 能力评估 — 分组与 ID', () => {
  it('分组 ID 非 null、UUID 形状、同组六维共用、不同组不同', async () => {
    const g1 = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    const g2 = await createAssessmentGroup(db, { studentId: 's02', teacherId: 'u_t1', dims: sixDims() });
    expect(g1).not.toBeNull();
    expect(isUuidLike(g1)).toBe(true);
    expect(g1).not.toBe(g2);
    const rows1 = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g1,
    ) as AbilityAssessment[];
    expect(rows1.length).toBe(6);
    expect(rows1.every((r) => r.assessment_group_id === g1)).toBe(true);
    expect(rows1.every((r) => r.student_id === 's01')).toBe(true);
    expect(rows1.every((r) => r.created_by === 'u_t1')).toBe(true);
  });

  it('六维唯一性：重复维度抛错且未写入任何行', async () => {
    const before = (await db.abilityAssessments.list()).length;
    await expect(
      createAssessmentGroup(db, {
        studentId: 's01',
        teacherId: 'u_t1',
        dims: [
          { dimension: 'basics', level: 'L2', source: 'teacher' },
          { dimension: 'basics', level: 'L3', source: 'teacher' },
        ],
      }),
    ).rejects.toThrow(/维度不可重复/);
    const after = (await db.abilityAssessments.list()).length;
    expect(after).toBe(before);
    expect((await listAssessmentGroups(db)).length).toBe(0);
  });

  it('draft 允许维度未完成：仅建 3 维草稿组成功', async () => {
    const g = await createAssessmentGroup(db, {
      studentId: 's01',
      teacherId: 'u_t1',
      dims: sixDims().slice(0, 3),
    });
    const rows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g,
    ) as AbilityAssessment[];
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.status === 'draft')).toBe(true);
  });
});

describe('CP2.1 能力评估 — 状态机与整组原子', () => {
  it('完整流转 draft → confirmed → published 成功，且整组状态同步', async () => {
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    await confirmAssessmentGroup(db, g);
    let rows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g,
    ) as AbilityAssessment[];
    expect(rows.every((r) => r.status === 'confirmed')).toBe(true);
    await publishAssessmentGroup(db, g);
    rows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g,
    ) as AbilityAssessment[];
    expect(rows.every((r) => r.status === 'published')).toBe(true);
    const view = await getStudentAssessmentView(db, 's01');
    expect(view.publishedGroups.some((x) => x.groupId === g)).toBe(true);
  });

  it('残缺组不可确认：六维不齐全抛错且保持 draft', async () => {
    const g = await createAssessmentGroup(db, {
      studentId: 's01',
      teacherId: 'u_t1',
      dims: sixDims().slice(0, 3),
    });
    await expect(confirmAssessmentGroup(db, g)).rejects.toThrow(/六维/);
    const rows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g,
    ) as AbilityAssessment[];
    expect(rows.every((r) => r.status === 'draft')).toBe(true);
  });

  it('确认前须有事实证据：六维齐全但某维无证据则不可确认', async () => {
    const dims = sixDims();
    dims[2].evidence_text = ''; // 第三维无证据
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims });
    await expect(confirmAssessmentGroup(db, g)).rejects.toThrow(/证据/);
    const rows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g,
    ) as AbilityAssessment[];
    expect(rows.every((r) => r.status === 'draft')).toBe(true);
  });

  it('发布前必须已确认：直接发布草稿抛错', async () => {
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    await expect(publishAssessmentGroup(db, g)).rejects.toThrow(/已确认/);
  });

  it('已发布不可直接再次发布（仍是 published，非 confirmed）', async () => {
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    await confirmAssessmentGroup(db, g);
    await publishAssessmentGroup(db, g);
    await expect(publishAssessmentGroup(db, g)).rejects.toThrow(/已确认/);
    const rows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g,
    ) as AbilityAssessment[];
    expect(rows.every((r) => r.status === 'published')).toBe(true);
  });

  it('修正：已发布组修正 → 新组草稿 + 旧组整组 voided（原子）', async () => {
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    await confirmAssessmentGroup(db, g);
    await publishAssessmentGroup(db, g);
    const newG = await reviseAssessmentGroup(db, g);
    expect(newG).not.toBe(g);
    expect(isUuidLike(newG)).toBe(true);
    const oldRows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === g,
    ) as AbilityAssessment[];
    expect(oldRows.every((r) => r.status === 'voided')).toBe(true);
    const newRows = (await db.abilityAssessments.list()).filter(
      (r) => (r as AbilityAssessment).assessment_group_id === newG,
    ) as AbilityAssessment[];
    expect(newRows.length).toBe(6);
    expect(newRows.every((r) => r.status === 'draft')).toBe(true);
    expect(newRows.every((r) => r.student_id === 's01')).toBe(true);
    // 学生视图：旧组已作废不显示，新组未发布也不显示
    const view = await getStudentAssessmentView(db, 's01');
    expect(view.publishedGroups.every((x) => x.groupId !== g && x.groupId !== newG)).toBe(true);
  });

  it('修正仅允许已发布组：对草稿组修正抛错', async () => {
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    await expect(reviseAssessmentGroup(db, g)).rejects.toThrow(/已发布/);
  });

  it('整组事务回滚：transaction 内抛错后数据整体不变', async () => {
    const before = (await db.abilityAssessments.list()).length;
    await expect(
      db.transaction(async (tx) => {
        await tx.abilityAssessments.insert({
          student_id: 's01',
          dimension: 'basics',
          level: 'L2',
          source: 'teacher',
          evidence_id: null,
          ai_suggested_level: null,
          teacher_confirmed_level: null,
          status: 'draft',
          evidence_text: null,
          assessment_group_id: null,
          assessed_at: Date.now(),
          created_by: 'u_t1',
        } as unknown as AbilityAssessment);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const after = (await db.abilityAssessments.list()).length;
    expect(after).toBe(before);
  });
});

describe('CP2.1 能力评估 — 学员隐私边界', () => {
  it('学员只见本人 published；draft/confirmed/voided 不可见', async () => {
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    await confirmAssessmentGroup(db, g); // 已确认但未发布
    const view = await getStudentAssessmentView(db, 's01');
    expect(view.publishedGroups.every((x) => x.status === 'published')).toBe(true);
    expect(view.publishedGroups.some((x) => x.groupId === g)).toBe(false);
    // 发布后可见
    await publishAssessmentGroup(db, g);
    const view2 = await getStudentAssessmentView(db, 's01');
    expect(view2.publishedGroups.some((x) => x.groupId === g)).toBe(true);
  });

  it('学员视图仅包含本人记录（不泄露他人）', async () => {
    const g = await createAssessmentGroup(db, { studentId: 's01', teacherId: 'u_t1', dims: sixDims() });
    await confirmAssessmentGroup(db, g);
    await publishAssessmentGroup(db, g);
    const view = await getStudentAssessmentView(db, 's02'); // 另一学员
    expect(view.publishedGroups.every((x) => x.studentId === 's02')).toBe(true);
    expect(view.publishedGroups.some((x) => x.groupId === g)).toBe(false);
  });

  it('学员端不暴露教师内部 AI 原文：非 published 组（可能含 ai_suggested_level）不进入学生视图', async () => {
    // 构造一个带 ai_suggested_level 的草稿组
    const g = await createAssessmentGroup(db, {
      studentId: 's01',
      teacherId: 'u_t1',
      dims: sixDims().map((d) => ({ ...d, ai_suggested_level: 'L4' as AbilityLevel })),
    });
    const view = await getStudentAssessmentView(db, 's01');
    expect(view.publishedGroups.some((x) => x.groupId === g)).toBe(false);
  });
});

describe('CP2.1 能力评估 — 工具函数', () => {
  it('hasAllDimensions 正确判定六维齐全', () => {
    expect(hasAllDimensions(sixDims())).toBe(true);
    expect(hasAllDimensions(sixDims().slice(0, 3))).toBe(false);
  });

  it('isEvidenceComplete 正确判定证据', () => {
    expect(isEvidenceComplete({ evidence_text: '课堂观察' })).toBe(true);
    expect(isEvidenceComplete({ evidence_id: 'w1' })).toBe(true);
    expect(isEvidenceComplete({})).toBe(false);
    expect(isEvidenceComplete({ evidence_text: '   ' })).toBe(false);
  });

  it('getLegacyAssessments 仅返回未分组单项（CP1 遗留）', async () => {
    const legacy = await getLegacyAssessments(db, 's01');
    expect(legacy.every((r) => r.assessment_group_id === null)).toBe(true);
    expect(legacy.length).toBeGreaterThan(0);
  });
});
