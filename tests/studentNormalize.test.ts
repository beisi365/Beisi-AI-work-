import { describe, expect, it } from 'vitest';
import { displayStudentNo, studentNoSortKey, SURVEY_FIELDS, withStudentDefaults } from '../src/lib/studentNormalize';
import type { Student } from '../src/data/types';

const stu = (over: Partial<Student>): Student => withStudentDefaults({ id: 's01', nickname: '甲', ...over } as Student);

describe('withStudentDefaults —— 老数据缺列时补齐默认值', () => {
  it('缺失报名问卷字段时补空串，不出现 undefined', () => {
    const s = stu({});
    for (const f of SURVEY_FIELDS) {
      expect(s[f]).toBe('');
    }
  });

  it('保留已有值，不覆盖真实内容', () => {
    const s = stu({ student_no: '07', ai_experience: '偶尔用过', remark: '问卷已收' });
    expect(s.student_no).toBe('07');
    expect(s.ai_experience).toBe('偶尔用过');
    expect(s.remark).toBe('问卷已收');
  });

  it('teacher_tags 非数组时归一为空数组', () => {
    expect(stu({ teacher_tags: undefined as never }).teacher_tags).toEqual([]);
    expect(stu({ teacher_tags: ['待补资料'] }).teacher_tags).toEqual(['待补资料']);
  });

  it('内部字段保持 null 语义（null 表示未填，不是空串）', () => {
    expect(stu({}).ai_baseline).toBeNull();
    expect(stu({ ai_baseline: '教师分析' }).ai_baseline).toBe('教师分析');
  });
});

describe('displayStudentNo —— 学号显示', () => {
  it('优先取外部学号 student_no', () => {
    expect(displayStudentNo({ student_no: '03', id: 's99' })).toBe('03');
  });

  it('无外部学号时从系统 id 推导（取末尾完整数字串）', () => {
    expect(displayStudentNo({ student_no: '', id: 's12' })).toBe('12');
    expect(displayStudentNo({ student_no: '', id: 'c6025' })).toBe('6025');
  });

  it('都取不到时返回空串，由 UI 降级显示', () => {
    expect(displayStudentNo({ student_no: '', id: 'abc' })).toBe('');
  });

  it('去空格后仍为空则视为无学号', () => {
    expect(displayStudentNo({ student_no: '   ', id: 's05' })).toBe('05');
  });
});

describe('studentNoSortKey —— 按学号排序', () => {
  it('数字学号按数值排序，而非字符串（避免 10 排在 2 前面）', () => {
    const keys = ['02', '10', '1'].map((n) => studentNoSortKey({ student_no: n, id: 'x' }));
    expect(keys).toEqual([2, 10, 1]);
    expect([...keys].sort((a, b) => a - b)).toEqual([1, 2, 10]);
  });

  it('无学号时排在有学号的人之后', () => {
    const withNo = studentNoSortKey({ student_no: '05', id: 's05' });
    const without = studentNoSortKey({ student_no: '', id: 'unknown' });
    expect(without).toBeGreaterThan(withNo);
  });

  it('能从「第3号」这类带文字的学号里抽出数字', () => {
    expect(studentNoSortKey({ student_no: '第3号', id: 'x' })).toBe(3);
  });
});
