// 运营管理员编辑 / 新增教师与学员信息的权限测试
// ------------------------------------------------------------
// 背景：数据层（permissions.ts）与云端 RLS 早已对 admin 放行，
// 本文件把「管理员可改教师 / 学员」这份约定固化成回归用例，
// 防止后续重构权限函数或 RLS 时把 admin 的写权限悄悄收掉。
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import { canWrite } from '../src/data/repository/permissions';
import type { Principal, Teacher } from '../src/data/types';
import { getNav, getTeacherMobileMoreNav } from '../src/components/AppShell';

const noCtx = { isEnrolled: () => true };

describe('管理员编辑教师与学员信息', () => {
  let db: LocalDataLayer;
  let admin: Principal;
  let teacher: Principal;
  let student: Principal;

  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
    // admin 不绑定具体教师 / 学员记录（与云端 profiles 设计一致）
    admin = { userId: 'u_admin', role: 'admin' };
    teacher = { userId: 'u_t1', role: 'teacher', teacherId: 't1' };
    student = { userId: 'u_s01', role: 'student', studentId: 's01' };
  });

  it('管理员可写任意教师行（不止自己那一行）', async () => {
    const teachers = await db.teachers.list();
    expect(teachers.length).toBeGreaterThan(1);
    for (const t of teachers) {
      expect(canWrite(admin, 'teachers', t as unknown as Record<string, unknown>, noCtx)).toBe(true);
    }
  });

  it('管理员可写任意学员行', async () => {
    const students = await db.students.list();
    expect(students.length).toBeGreaterThan(0);
    const sample = students.slice(0, 20);
    for (const s of sample) {
      expect(canWrite(admin, 'students', s as unknown as Record<string, unknown>, noCtx)).toBe(true);
    }
  });

  it('学员不可写学员档案与教师档案（权限不越界）', async () => {
    const other = (await db.students.list()).find((s) => s.id !== 's01');
    if (other) {
      expect(canWrite(student, 'students', other as unknown as Record<string, unknown>, noCtx)).toBe(false);
    }
    const t = (await db.teachers.list())[0];
    expect(canWrite(student, 'teachers', t as unknown as Record<string, unknown>, noCtx)).toBe(false);
  });

  it('管理员真实改教师资料能落库', async () => {
    const before = (await db.teachers.list()).find((t) => t.id === 't2') as Teacher;
    const updated = await db.teachers.update('t2', { name: '李老师（已改）', subjects: 'AI图像/视频/剪辑' });
    expect(updated.name).toBe('李老师（已改）');
    expect(updated.subjects).toBe('AI图像/视频/剪辑');
    expect(updated.name).not.toBe(before.name);
    // 重新读取确认持久化
    const after = await db.teachers.get('t2');
    expect(after?.name).toBe('李老师（已改）');
  });

  it('管理员新增教师成功，且 id 不与现有教师冲突', async () => {
    const before = await db.teachers.list();
    const created = await db.teachers.insert({
      id: 't6',
      user_id: '',
      name: '新老师',
      title: 'AI 实战讲师',
      subjects: 'AI编程/自动化',
      bio: '新增教师测试',
    });
    expect(created.id).toBe('t6');
    const after = await db.teachers.list();
    expect(after.length).toBe(before.length + 1);
    expect(new Set(after.map((t) => t.id)).size).toBe(after.length);
  });

  it('新增教师时 user_id 留空，等待本人注册后认领', async () => {
    const created = await db.teachers.insert({
      id: 't7',
      user_id: '',
      name: '待认领老师',
      title: 'AI 讲师',
      subjects: 'AI写作',
      bio: '',
    });
    expect(created.user_id).toBe('');
  });

  it('教师本人仍可写入（不被 admin 分支挤掉）', async () => {
    const t = (await db.teachers.list())[0];
    expect(canWrite(teacher, 'teachers', t as unknown as Record<string, unknown>, noCtx)).toBe(true);
  });
});

describe('教师管理入口可达性', () => {
  it('教师端一级导航含「教师管理」并指向 /t/teachers', () => {
    const nav = getNav(true);
    const item = nav.find((i) => i.to === '/t/teachers');
    expect(item).toBeDefined();
    expect(item!.label).toBe('教师管理');
  });

  it('学员端导航不出现教师管理入口', () => {
    const tos = getNav(false).map((i) => i.to);
    expect(tos).not.toContain('/t/teachers');
  });

  it('教师移动端「更多」抽屉可到达教师管理', () => {
    const more = getTeacherMobileMoreNav();
    expect(more.find((i) => i.to === '/t/teachers')).toBeDefined();
  });
});
