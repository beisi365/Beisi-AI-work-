import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import { buildSeed } from '../src/data/seed';

describe('演示数据 seed', () => {
  let db: LocalDataLayer;
  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
  });

  it('核心数量正确', async () => {
    expect((await db.students.list()).length).toBe(125);
    expect((await db.classes.list()).length).toBe(5);
    expect((await db.lessons.list()).length).toBe(12);
    expect((await db.classSessions.list()).length).toBe(60);
    expect((await db.assignments.list()).length).toBe(60);
  });

  it('外键可解析', () => {
    const s = buildSeed();
    for (const e of s.enrollments) expect(s.classes.find((c) => c.id === e.class_id)).toBeTruthy();
    for (const cs of s.class_sessions) {
      expect(s.classes.find((c) => c.id === cs.class_id)).toBeTruthy();
      expect(s.lessons.find((l) => l.id === cs.lesson_id)).toBeTruthy();
    }
    for (const a of s.assignments) {
      expect(s.classes.find((c) => c.id === a.class_id)).toBeTruthy();
      expect(s.lessons.find((l) => l.id === a.lesson_id)).toBeTruthy();
    }
  });

  it('作品版本与提交关联完整', () => {
    const s = buildSeed();
    const subsWithFinal = s.submissions.filter((x) => x.final_version_id);
    expect(subsWithFinal.length).toBeGreaterThan(0);
    for (const sub of subsWithFinal) {
      const wv = s.work_versions.find((w) => w.id === sub.final_version_id);
      expect(wv).toBeTruthy();
      expect(wv?.is_final).toBe(true);
      expect(wv?.submission_id).toBe(sub.id);
    }
  });
});
