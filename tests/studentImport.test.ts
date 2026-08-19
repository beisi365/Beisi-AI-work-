// 学员批量导入 · 纯函数测试：CSV 解析 / 生成 / 模板 / 逐行校验。
// Toast / 文件上传 / 写入交互由真实浏览器验收（accept-student-import 脚本）覆盖。
import { describe, it, expect } from 'vitest';
import type { ClassRow, User } from '../src/data/types';
import {
  buildClassMap,
  buildTemplateCsv,
  collectAccounts,
  IMPORT_COLUMNS,
  parseCsv,
  runBatchImport,
  toCsv,
  validateImportRows,
} from '../src/lib/studentImport';

const classes: ClassRow[] = [
  { id: 'cls-1', name: 'AI应用基础班', course_id: 'c1', teacher_id: 't1', start_date: '', end_date: '', schedule: '', capacity: 30, status: 'active', created_at: 0, updated_at: 0, created_by: 't1' },
  { id: 'cls-2', name: '进阶实战班', course_id: 'c2', teacher_id: 't1', start_date: '', end_date: '', schedule: '', capacity: 30, status: 'active', created_at: 0, updated_at: 0, created_by: 't1' },
] as ClassRow[];

const classByName = buildClassMap(classes);

describe('CSV 解析', () => {
  it('解析基础行与表头去空格', () => {
    const { headers, rows } = parseCsv('登录账号, 展示姓名 , 班级\nlsf001,小琳,AI应用基础班');
    expect(headers).toEqual(['登录账号', '展示姓名', '班级']);
    expect(rows).toEqual([['lsf001', '小琳', 'AI应用基础班']]);
  });

  it('正确处理引号内的逗号与转义引号', () => {
    const csv = '展示姓名,职业\n"张三","行政,文员"\n"李""四""",教师';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual(['张三', '行政,文员']);
    expect(rows[1]).toEqual(['李"四"', '教师']);
  });

  it('去除 UTF-8 BOM 并丢弃全空行', () => {
    const csv = '﻿展示姓名,班级\n小琳,AI应用基础班\n\n, \n';
    const { rows } = parseCsv(csv);
    expect(rows).toEqual([['小琳', 'AI应用基础班']]);
  });

  it('兼容 Windows CRLF', () => {
    const { rows } = parseCsv('展示姓名,班级\r\n小琳,AI应用基础班\r\n');
    expect(rows).toEqual([['小琳', 'AI应用基础班']]);
  });
});

describe('CSV 生成', () => {
  it('含逗号/引号的字段被转义', () => {
    const csv = toCsv(['a', 'b'], [['x', '含,逗号'], ['y', '引"号']]);
    expect(csv).toBe('a,b\r\nx,"含,逗号"\r\ny,"引""号"');
  });
});

describe('模板生成', () => {
  it('带 BOM 且含全部列头', () => {
    const csv = buildTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const headers = csv.replace(/^﻿/, '').split('\r\n')[0].split(',');
    for (const c of IMPORT_COLUMNS) expect(headers).toContain(c.header);
  });

  it('可注入首个真实班级名作为示例', () => {
    const csv = buildTemplateCsv('AI应用基础班');
    const firstDataRow = csv.replace(/^﻿/, '').split('\r\n')[1].split(',');
    const classIdx = IMPORT_COLUMNS.findIndex((c) => c.key === 'className');
    expect(firstDataRow[classIdx]).toBe('AI应用基础班');
  });
});

describe('逐行校验', () => {
  const baseHeaders = IMPORT_COLUMNS.map((c) => c.header);

  const rowFrom = (obj: Record<string, string>): string[] =>
    baseHeaders.map((h) => obj[h] ?? '');

  it('合法行生成完整 CreateStudentInput', () => {
    const rows = [
      rowFrom({
        登录账号: 'lsf001',
        登录姓名: '林淑芬',
        展示姓名: '小琳',
        班级: 'AI应用基础班',
        年龄段: '30-40',
        职业: '行政文员',
        每周学习小时: '10',
        自助能力: '是',
        使用付费AI: '否',
      }),
    ];
    const plan = validateImportRows({ headers: baseHeaders, rows }, classByName, new Set());
    expect(plan).toHaveLength(1);
    expect(plan[0].errors).toEqual([]);
    expect(plan[0].input).not.toBeNull();
    expect(plan[0].input).toMatchObject({
      account: 'lsf001',
      loginName: '林淑芬',
      nickname: '小琳',
      classId: 'cls-1',
      age_range: '30-40',
      occupation: '行政文员',
      weekly_hours: 10,
      can_self_service: true,
      uses_paid_ai: false,
    });
  });

  it('登录姓名缺省时回退为展示姓名', () => {
    const rows = [rowFrom({ 登录账号: 'lsf002', 展示姓名: '阿强', 班级: '进阶实战班' })];
    const plan = validateImportRows({ headers: baseHeaders, rows }, classByName, new Set());
    expect(plan[0].input?.loginName).toBe('阿强');
  });

  it('缺少展示姓名 / 登录账号 报错', () => {
    const rows = [rowFrom({ 登录账号: 'lsf003', 班级: 'AI应用基础班' })];
    const plan = validateImportRows({ headers: baseHeaders, rows }, classByName, new Set());
    expect(plan[0].input).toBeNull();
    expect(plan[0].errors.some((e) => e.includes('展示姓名'))).toBe(true);
  });

  it('班级不存在时报错', () => {
    const rows = [rowFrom({ 登录账号: 'lsf004', 展示姓名: '小王', 班级: '不存在的班' })];
    const plan = validateImportRows({ headers: baseHeaders, rows }, classByName, new Set());
    expect(plan[0].input).toBeNull();
    expect(plan[0].errors.some((e) => e.includes('不存在'))).toBe(true);
  });

  it('班级名解析忽略大小写与首尾空格', () => {
    const rows = [rowFrom({ 登录账号: 'lsf005', 展示姓名: '小李', 班级: ' ai应用基础班 ' })];
    const plan = validateImportRows({ headers: baseHeaders, rows }, classByName, new Set());
    expect(plan[0].input?.classId).toBe('cls-1');
  });

  it('账号与已有库或文件内重复均拦截（首条放行、后续重复报错）', () => {
    const rows = [
      rowFrom({ 登录账号: 'dup', 展示姓名: 'A', 班级: 'AI应用基础班' }),
      rowFrom({ 登录账号: 'dup', 展示姓名: 'B', 班级: 'AI应用基础班' }),
      rowFrom({ 登录账号: 'existing', 展示姓名: 'C', 班级: 'AI应用基础班' }),
    ];
    const existing = new Set(['existing']);
    const plan = validateImportRows({ headers: baseHeaders, rows }, classByName, existing);
    // 首条 dup 放行，第二条 dup 因文件内重复被拦，第三条因与库重复被拦
    expect(plan[0].errors.some((e) => e.includes('重复'))).toBe(false);
    expect(plan[1].errors.some((e) => e.includes('重复'))).toBe(true);
    expect(plan[2].errors.some((e) => e.includes('重复'))).toBe(true);
  });

  it('布尔字段正确解析（是/否/true/false）', () => {
    const rows = [
      rowFrom({ 登录账号: 'a1', 展示姓名: 'A', 班级: 'AI应用基础班', 自助能力: '是', 使用付费AI: '否' }),
      rowFrom({ 登录账号: 'a2', 展示姓名: 'B', 班级: 'AI应用基础班', 自助能力: 'true', 使用付费AI: 'false' }),
    ];
    const plan = validateImportRows({ headers: baseHeaders, rows }, classByName, new Set());
    expect(plan[0].input).toMatchObject({ can_self_service: true, uses_paid_ai: false });
    expect(plan[1].input).toMatchObject({ can_self_service: true, uses_paid_ai: false });
  });
});

describe('辅助映射', () => {
  it('buildClassMap 与 collectAccounts 正常工作', () => {
    const m = buildClassMap(classes);
    expect(m.get('ai应用基础班')).toBe('cls-1');
    const users: User[] = [{ id: 'u1', role: 'student', name: 'x', account: 'EXIST', avatar: 'x', created_at: 0, updated_at: 0 } as User];
    expect(collectAccounts(users).has('exist')).toBe(true);
  });
});

describe('批量写入（复用 createStudent）', () => {
  // 最小假 DataLayer，仅满足 createStudent 的事务/唯一校验链路
  const fakeDb: any = {
    classes: { get: async () => ({ id: 'cls-1', name: 'AI应用基础班' }) },
    users: { list: async () => [] },
    students: { list: async () => [] },
    transaction: async (fn: any) => {
      const tx = {
        users: { insert: async () => ({ id: 'u1' }) },
        students: { insert: async () => ({ id: 's1' }) },
        enrollments: { insert: async () => ({ id: 'e1' }) },
        appendLog: async () => {},
      };
      return fn(tx);
    },
  };
  const actor = { actorId: 't1', actorRole: 'teacher' } as any;

  it('预览拦截的无效行计入失败并带回原因，合法行写入成功', async () => {
    const plan = [
      { lineNo: 2, nickname: '甲', input: { account: 'a1', loginName: '甲', nickname: '甲', classId: 'cls-1' }, errors: [] },
      { lineNo: 3, nickname: '乙', input: null, errors: ['班级「X」在系统中不存在'] },
    ];
    const res = await runBatchImport(fakeDb, actor, plan);
    expect(res.created).toBe(1);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].lineNo).toBe(3);
    expect(res.failed[0].reason).toContain('班级');
  });

  it('运行时唯一冲突也计入失败（不静默丢失）', async () => {
    // 第二条合法行会因账号重复在 createStudent 抛错（users.list 返回已存在）
    const dupDb: any = {
      ...fakeDb,
      users: { list: async () => [{ account: 'a1' }] },
    };
    const plan = [
      { lineNo: 2, nickname: '甲', input: { account: 'a1', loginName: '甲', nickname: '甲', classId: 'cls-1' }, errors: [] },
    ];
    const res = await runBatchImport(dupDb, actor, plan);
    expect(res.created).toBe(0);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].reason).toContain('已存在');
  });
});
