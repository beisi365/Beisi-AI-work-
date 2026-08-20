import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Principal } from '../data/types';
import { isDemoMode, DEMO_PRINCIPAL } from '../lib/demoMode';

interface AuthValue {
  principal: Principal | null;
  login: (p: Principal) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

/**
 * 演示用身份上下文：仅做「角色切换」，不实现真实账号认证。
 * 状态保存在内存中（刷新回到登录页），刻意不写入浏览器本地存储，
 * 以遵守架构约束（页面/组件一律不引用本地存储，唯一访问点在 LocalDataLayer）。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // 只读演示模式：初始即以演示教师身份进入，避免首屏闪烁与空白
  const [principal, setPrincipal] = useState<Principal | null>(isDemoMode() ? DEMO_PRINCIPAL : null);

  const login = useCallback((p: Principal) => setPrincipal(p), []);
  const logout = useCallback(() => setPrincipal(null), []);

  const value = useMemo<AuthValue>(() => ({ principal, login, logout }), [principal, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
