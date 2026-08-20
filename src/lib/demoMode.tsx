// 只读演示模式（Demo / Read-Only Mode）
//
// 设计目标：把工作台「发出去给别人看」——带 ?demo 参数打开即进入只读演示身份，
// 屏蔽一切编辑入口；配合 PWA 离线缓存与静态部署，实现分享链接 / 手机查看 / 离线观看。
//
// 约定：
// - 纯函数 computeDemoMode 便于单元测试覆盖全部分支，不依赖浏览器全局。
// - 上下文默认 { demo:false, readOnly:false }，未包裹 DemoModeProvider 时组件仍能正常工作，
//   因此对既有单元测试零影响（只读开关默认关闭）。

import { createContext, useContext, type ReactNode } from 'react';
import type { Principal } from '../data/types';

/** 演示身份：固定以 seeded 教师 t1（王老师）进入，数据最全，展示效果最好 */
export const DEMO_PRINCIPAL: Principal = {
  userId: 'demo',
  role: 'teacher',
  teacherId: 't1',
};

/** 纯函数：根据 location.search 判断是否为只读演示模式。
 * 支持：?demo / ?demo=1 / ?readonly / ?mode=demo */
export function computeDemoMode(search: string): boolean {
  try {
    const p = new URLSearchParams(search);
    if (p.has('demo') || p.has('readonly')) return true;
    return p.get('mode') === 'demo';
  } catch {
    return false;
  }
}

/** 运行时判断（浏览器）。node / 无 window 环境下默认 false。 */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return computeDemoMode(window.location.search);
}

export interface DemoModeValue {
  demo: boolean;
  /** 只读：屏蔽所有编辑入口。demo 模式下恒为 true。 */
  readOnly: boolean;
}

const DemoCtx = createContext<DemoModeValue>({ demo: false, readOnly: false });

export function DemoModeProvider({
  demo,
  children,
}: {
  demo: boolean;
  children: ReactNode;
}) {
  const value: DemoModeValue = { demo, readOnly: demo };
  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

/** 读取当前演示 / 只读状态。无 Provider 时返回默认关闭值，保证既有组件与测试不受影响。 */
export function useDemoMode(): DemoModeValue {
  return useContext(DemoCtx);
}
