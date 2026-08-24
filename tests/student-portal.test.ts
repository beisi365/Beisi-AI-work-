import { describe, it, expect, afterEach } from 'vitest';
import { db } from '../src/data/repository';
import {
  computeStudentPortalEnabled,
  isStudentPortalEnabled,
  isStudentPortalClosed,
  STUDENT_PORTAL_OVERRIDE_KEY,
} from '../src/lib/featureFlags';

// 说明：本文件覆盖「学员端功能开关」的纯决策逻辑。
// 登录页隐藏学员入口、/s 直接访问被拦截 均是组件对该决策的响应，
// 组件级渲染验证由 Task #158 的 puppeteer 浏览器验收覆盖（node 测试环境无 DOM）。
// 覆盖值统一经 LocalDataLayer 存储抽象读写（架构约束：localStorage 仅允许在 LocalDataLayer.ts）。

describe('学员端开关：computeStudentPortalEnabled 真值表', () => {
  it('开发环境、无覆盖 → 开放', () => {
    expect(computeStudentPortalEnabled(true, null)).toBe(true);
    expect(computeStudentPortalEnabled(true, undefined)).toBe(true);
  });
  it('生产环境、无覆盖 → 开放（师生双端默认可用）', () => {
    expect(computeStudentPortalEnabled(false, null)).toBe(true);
  });
  it('显式覆盖 "0" → 强制关闭（即便开发环境）', () => {
    expect(computeStudentPortalEnabled(true, '0')).toBe(false);
    expect(computeStudentPortalEnabled(false, '0')).toBe(false);
  });
  it('显式覆盖 "1" → 强制开放（即便生产环境，原学员端可用）', () => {
    expect(computeStudentPortalEnabled(false, '1')).toBe(true);
    expect(computeStudentPortalEnabled(true, '1')).toBe(true);
  });
  it('非 "0"/"1" 的覆盖值视为无效，回退到默认开放', () => {
    expect(computeStudentPortalEnabled(true, 'x')).toBe(true);
    expect(computeStudentPortalEnabled(false, 'x')).toBe(true);
  });
});

describe('学员端开关：真实环境读取（经 LocalDataLayer 存储抽象）', () => {
  afterEach(() => {
    db.removeLocalValue(STUDENT_PORTAL_OVERRIDE_KEY);
  });

  it('覆盖 "0" → isStudentPortalEnabled=false、isStudentPortalClosed=true（登录页隐藏学员入口）', () => {
    db.setLocalValue(STUDENT_PORTAL_OVERRIDE_KEY, '0');
    expect(db.getLocalValue(STUDENT_PORTAL_OVERRIDE_KEY)).toBe('0');
    expect(isStudentPortalEnabled()).toBe(false);
    expect(isStudentPortalClosed()).toBe(true);
  });

  it('覆盖 "1" → isStudentPortalEnabled=true、isStudentPortalClosed=false（原学员端可用）', () => {
    db.setLocalValue(STUDENT_PORTAL_OVERRIDE_KEY, '1');
    expect(isStudentPortalEnabled()).toBe(true);
    expect(isStudentPortalClosed()).toBe(false);
  });

  it('无覆盖时在测试环境（DEV）下默认开放', () => {
    expect(isStudentPortalEnabled()).toBe(true);
  });
});
