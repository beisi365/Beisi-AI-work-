import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Principal } from '../data/types';
import { isDemoMode, getDemoPrincipal } from '../lib/demoMode';
import { isSupabaseEnabled } from '../lib/supabaseClient';
import { getCurrentPrincipal, onAuthChange, signOut } from './supabaseAuth';
import { db } from '../data/repository';

interface AuthValue {
  principal: Principal | null;
  /** 当前认证模式：supabase（真实多用户）/ demo（只读演示）/ local（纯前端单机角色选择） */
  mode: 'supabase' | 'demo' | 'local';
  /**
   * 登录态是否已就绪。
   * supabase 模式下会话恢复是异步的，恢复完成前 principal 为 null 属「未知」而非「未登录」；
   * 路由守卫必须先等 ready，否则刷新页面会被误判未登录而踢回登录页。
   * demo / local 模式为同步恢复，恒为 true。
   */
  ready: boolean;
  login: (p: Principal) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

/** 本地单机模式的登录态存储键（统一经数据层读写抽象，不直连浏览器存储） */
const LOCAL_PRINCIPAL_KEY = 'aiwb_principal';

function loadLocalPrincipal(): Principal | null {
  try {
    const raw = db.getLocalValue(LOCAL_PRINCIPAL_KEY);
    return raw ? (JSON.parse(raw) as Principal) : null;
  } catch {
    return null;
  }
}

function saveLocalPrincipal(p: Principal): void {
  try {
    db.setLocalValue(LOCAL_PRINCIPAL_KEY, JSON.stringify(p));
  } catch {
    /* 存储不可用时降级为「仅内存登录态」，不阻塞主流程 */
  }
}

function clearLocalPrincipal(): void {
  try {
    db.removeLocalValue(LOCAL_PRINCIPAL_KEY);
  } catch {
    /* 忽略清理失败 */
  }
}

/**
 * 身份上下文，三模式共存：
 * - demo：只读演示，初始即以演示身份进入（?demo 决定教师/学员视角），刷新保持。
 * - supabase：已配置 Supabase 且非演示，初始从会话恢复 Principal，并订阅登录态变化；
 *             恢复期间 ready=false，守卫需等待，避免刷新被踢回登录页。
 * - local：纯前端单机，初始从本地持久化的 Principal 恢复（刷新/直接输 URL 保持登录），
 *          未恢复过则由登录页选择角色后 login()。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(
    isDemoMode() ? getDemoPrincipal() : isSupabaseEnabled ? null : loadLocalPrincipal(),
  );
  const [ready, setReady] = useState<boolean>(isDemoMode() || !isSupabaseEnabled);
  const [mode] = useState<'supabase' | 'demo' | 'local'>(
    isDemoMode() ? 'demo' : isSupabaseEnabled ? 'supabase' : 'local',
  );

  useEffect(() => {
    if (isDemoMode() || !isSupabaseEnabled) return;
    let active = true;
    getCurrentPrincipal()
      .then((p) => {
        if (active) setPrincipal(p);
      })
      .catch(() => {
        /* 会话恢复失败按「未登录」处理，由守卫跳转登录页 */
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const unsub = onAuthChange((p) => {
      if (active) {
        setPrincipal(p);
        setReady(true);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const login = useCallback((p: Principal) => {
    setPrincipal(p);
    // 本地单机模式：持久化登录态，避免刷新 / 直接输 URL 时登录态丢失
    if (!isSupabaseEnabled && !isDemoMode()) saveLocalPrincipal(p);
  }, []);

  const logout = useCallback(() => {
    if (isSupabaseEnabled) void signOut();
    clearLocalPrincipal();
    setPrincipal(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ principal, login, logout, mode, ready }),
    [principal, login, logout, mode, ready],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
