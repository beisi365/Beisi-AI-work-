import type { ClassSession } from '../data/types';

/**
 * 今日课程点击后的出勤登记目标：直接取该场次的班级与场次。
 * 纯函数，供总览页 SessionLine 与单元测试复用，不依赖任何 React 状态。
 */
export function sessionAttendanceTarget(s: ClassSession): { classId: string; sessionId: string } {
  return { classId: s.class_id, sessionId: s.id };
}
