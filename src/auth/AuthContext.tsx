import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Principal } from '../data/types';
import { isDemoMode, getDemoPrincipal } from '../lib/demoMode';
import { isSupabaseEnabled } from '../lib/supabaseClient';
import { getCurrentPrincipal, onAuthChange, signOut } from './supabaseAuth';

interface AuthValue {
  principal: Principal | null;
  /** 当前认证模式：supabase（真实多用户）/ demo（只读演示）/ local（纯前端单机角色选择） */
  mode: 'supabase' | 'demo' | 'local';
  login: (p: Principal) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

/**
 * 身份上下文，三模式共存：
 * - demo：只读演示，初始即以演示身份进入（?demo 决定教师/学员视角），刷新保持。
 * - supabase：已配置 Supabase 且非演示，初始从会话恢复 Principal，并订阅登录态变化。
 * - local：纯前端单机，初始为 null，由登录页选择角色后 login()。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(isDemoMode() ? getDemoPrincipal() : null);
  const [mode] = useState<'supabase' | 'demo' | 'local'>(
    isDemoMode() ? 'demo' : isSupabaseEnabled ? 'supabase' : 'local',
  );

  useEffect(() => {
    if (isDemoMode() || !isSupabaseEnabled) return;
    let active = true;
    getCurrentPrincipal().then((p) => {
      if (active) setPrincipal(p);
    });
    const unsub = onAuthChange((p) => {
      if (active) setPrincipal(p);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const login = useCallback((p: Principal) => setPrincipal(p), []);
  const logout = useCallback(() => {
    if (isSupabaseEnabled) void signOut();
    setPrincipal(null);
  }, []);

  const value = useMemo<AuthValue>(() => ({ principal, login, logout, mode }), [principal, login, logout, mode]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
