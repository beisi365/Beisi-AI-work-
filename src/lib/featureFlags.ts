// CP2 功能开关（Feature Flags）
//
// 约定：
// - 所有开关默认 false（未发布）。未完成模块不得在正式导航中显示为可用入口。
// - 每完成一个 CP2.x 阶段并通过验收后，将对应开关置为 true（或改为从运行配置读取）。
// - 数据契约：CP2 优先复用现有 21 张表；确需新增字段时，须先提交最小字段变更提案并经确认，
//   严禁把结构化状态塞入普通文本字段。

import { db } from '../data/repository';
import { isDemoMode } from './demoMode';

export type Cp2Module =
  | 'assessments' // CP2.1 完整能力评估与历史对比
  | 'reviews' // CP2.2 教师评审管理
  | 'communications' // CP2.3 教学沟通与跟进记录
  | 'alerts' // CP2.4 学习预警（与待办同阶段）
  | 'todos'; // CP2.4 教师待办（与预警同阶段）

export const CP2_FLAGS: Record<Cp2Module, boolean> = {
  assessments: true,
  reviews: false,
  communications: false,
  alerts: true,
  todos: true,
};

/** 判断某个 CP2 模块是否已对正式导航开放 */
export function isCp2Enabled(module: Cp2Module): boolean {
  return CP2_FLAGS[module] === true;
}

// —— 学员端功能开关（师生双端模式）——
//
// 产品定位：师生双端平台，学员端默认开放（仍可由 override '0' 强制关闭）。
// - 开发/测试环境（import.meta.env.DEV）：默认开放，便于本地联调学员端。
// - 生产环境（非 DEV）：默认开放，登录页显示学员身份入口、/s/* 可直接访问。
// - 显式覆盖：本地存储键 'studentPortal' 设为 '1' 强制开启、'0' 强制关闭，
//   用于在生产预览或特殊场景下临时启用/禁用学员端，无需改代码或重新构建。
// 注意：学员端页面、数据结构、路由与权限守卫均保留（不删除），仅通过开关控制可达性。

export const STUDENT_PORTAL_OVERRIDE_KEY = 'studentPortal';

/**
 * 纯函数：根据「是否为开发环境」与「显式覆盖值」计算学员端是否开放。
 * 便于单元测试覆盖全部分支，避免依赖浏览器全局。
 */
export function computeStudentPortalEnabled(
  _dev: boolean,
  override: string | null | undefined,
): boolean {
  if (override === '0') return false;
  if (override === '1') return true;
  return true; // 生产环境默认开放学员端（师生双端可访问）
}

/** 读取学员端是否开放（真实运行环境）。覆盖值统一经 LocalDataLayer 存储抽象读取，
 *  不直接触碰底层浏览器存储（架构约束：键值读写仅在 LocalDataLayer 内完成）。
 *  注意：只读演示模式（?demo）下恒为开启，使分享演示也能浏览学员端视角。 */
export function isStudentPortalEnabled(): boolean {
  if (isDemoMode()) return true;
  const dev = import.meta.env.DEV;
  let override: string | null = null;
  try {
    override = db.getLocalValue(STUDENT_PORTAL_OVERRIDE_KEY);
  } catch {
    // 防御：存储抽象在 node 下也有内存兜底，正常情况下不会抛；此处仅保底
  }
  return computeStudentPortalEnabled(dev, override);
}

/** 学员端是否处于关闭（应被拦截）状态 */
export function isStudentPortalClosed(): boolean {
  return !isStudentPortalEnabled();
}
