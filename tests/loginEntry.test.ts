import { describe, it, expect } from 'vitest';
import {
  computeEntryRole,
  buildEntryUrl,
  ENTRY_ROLES,
  DEFAULT_ENTRY_ROLE,
  ENTRY_ROLE_PARAM,
} from '../src/lib/loginEntry';

describe('loginEntry 纯函数', () => {
  it('默认回落教师', () => {
    expect(computeEntryRole('')).toBe(DEFAULT_ENTRY_ROLE);
    expect(computeEntryRole('?x=1')).toBe('teacher');
  });

  it('显式 ?role= 解析 admin/teacher/student', () => {
    expect(computeEntryRole(`?${ENTRY_ROLE_PARAM}=admin`)).toBe('admin');
    expect(computeEntryRole(`?${ENTRY_ROLE_PARAM}=teacher`)).toBe('teacher');
    expect(computeEntryRole(`?${ENTRY_ROLE_PARAM}=student`)).toBe('student');
  });

  it('大小写与中文/缩写别名兜底', () => {
    expect(computeEntryRole('?role=Admin')).toBe('admin');
    expect(computeEntryRole('?role=运营')).toBe('admin');
    expect(computeEntryRole('?role=老师')).toBe('teacher');
    expect(computeEntryRole('?role=学员')).toBe('student');
    expect(computeEntryRole('?role=s')).toBe('student');
  });

  it('非法值回落默认', () => {
    expect(computeEntryRole('?role=hacker')).toBe(DEFAULT_ENTRY_ROLE);
    expect(computeEntryRole('?role=')).toBe(DEFAULT_ENTRY_ROLE);
  });

  it('三种入口角色枚举完整且可直达', () => {
    expect(ENTRY_ROLES).toEqual(['admin', 'teacher', 'student']);
    for (const r of ENTRY_ROLES) {
      expect(computeEntryRole(`?role=${r}`)).toBe(r);
    }
  });

  it('buildEntryUrl 拼出带角色参数的登录链接', () => {
    expect(buildEntryUrl('https://x.com/', 'admin')).toBe('https://x.com/login?role=admin');
    expect(buildEntryUrl('https://x.com', 'student')).toBe('https://x.com/login?role=student');
  });
});
