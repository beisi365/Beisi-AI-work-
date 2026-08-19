// P2.5 纯逻辑测试：教师移动端导航可达性 + 今日课程直达目标。
// 说明：导航门控与“课次→出勤目标”均为可测纯函数，无需 jsdom；
// Toast 与点击交互由真实浏览器验收（accept-p2-5 脚本）覆盖。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getNav,
  getTeacherMobileMoreNav,
  MOBILE_TEACHER_NAV,
} from '../src/components/AppShell';
import { sessionAttendanceTarget } from '../src/lib/sessionNav';
import { CP2_FLAGS } from '../src/lib/featureFlags';

const savedFlags = { ...CP2_FLAGS };
beforeEach(() => {
  // 还原为默认开启态，避免用例间相互影响
  CP2_FLAGS.assessments = savedFlags.assessments;
  CP2_FLAGS.reviews = savedFlags.reviews;
  CP2_FLAGS.communications = savedFlags.communications;
  CP2_FLAGS.alerts = savedFlags.alerts;
  CP2_FLAGS.todos = savedFlags.todos;
});
afterEach(() => {
  CP2_FLAGS.alerts = savedFlags.alerts;
  CP2_FLAGS.todos = savedFlags.todos;
});

describe('P2.5 教师移动端导航', () => {
  it('教师手机端底部导航为 4 项（首页/学员/教学/考核），另有“更多”抽屉', () => {
    // 底部固定 4 项；预警/待办等次级入口收入“更多”抽屉
    expect(MOBILE_TEACHER_NAV.map((i) => i.label)).toEqual(['首页', '学员', '教学', '考核']);
    // “更多”抽屉确实存在且含内容（课程与出勤等常驻项）
    const more = getTeacherMobileMoreNav();
    expect(more.length).toBeGreaterThan(0);
    expect(more.map((i) => i.label)).toContain('课程与出勤');
  });

  it('alerts=true 时“更多”显示学习预警', () => {
    CP2_FLAGS.alerts = true;
    const more = getTeacherMobileMoreNav();
    const alerts = more.find((i) => i.to === '/t/alerts');
    expect(alerts).toBeDefined();
    expect(alerts!.label).toBe('学习预警');
  });

  it('todos=true 时“更多”显示教师待办', () => {
    CP2_FLAGS.todos = true;
    const more = getTeacherMobileMoreNav();
    const todos = more.find((i) => i.to === '/t/todos');
    expect(todos).toBeDefined();
    expect(todos!.label).toBe('教师待办');
  });

  it('功能开关关闭时对应入口消失', () => {
    CP2_FLAGS.alerts = false;
    CP2_FLAGS.todos = false;
    const more = getTeacherMobileMoreNav();
    expect(more.find((i) => i.to === '/t/alerts')).toBeUndefined();
    expect(more.find((i) => i.to === '/t/todos')).toBeUndefined();
    // 常驻项不受影响
    expect(more.find((i) => i.to === '/t/classes')).toBeDefined();
  });

  it('“更多”中的预警/待办入口分别到达 /t/alerts 与 /t/todos', () => {
    const more = getTeacherMobileMoreNav();
    expect(more.find((i) => i.label === '学习预警')!.to).toBe('/t/alerts');
    expect(more.find((i) => i.label === '教师待办')!.to).toBe('/t/todos');
  });

  it('学员端导航不出现教师预警/待办入口', () => {
    const studentNav = getNav(false);
    const tos = studentNav.map((i) => i.to);
    expect(tos).not.toContain('/t/alerts');
    expect(tos).not.toContain('/t/todos');
  });
});

describe('P2.5 今日课程直达', () => {
  it('点击今日课程能解析出真实的班级与场次目标', () => {
    const target = sessionAttendanceTarget({
      id: 'ses-9',
      class_id: 'cls-3',
    } as never);
    expect(target).toEqual({ classId: 'cls-3', sessionId: 'ses-9' });
  });
});
