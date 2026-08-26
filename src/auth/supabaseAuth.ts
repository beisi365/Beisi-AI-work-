import { getSupabase, isSupabaseEnabled } from '../lib/supabaseClient';
import type { Principal, Role } from '../data/types';

/**
 * Supabase Auth 接入层。
 * - 登录/注册走 Supabase Auth（邮箱+密码；免费额度够小团队）。
 * - 身份映射：auth.users →（触发器自动建）profiles(role, student_id, teacher_id) → 应用 Principal。
 * - 登录后调用 claim_identity() 认领/创建自己的 students / teachers 记录，使 RLS 行级隔离生效。
 * - 注册时可填 bindId（学员 sXX / 教师 tX）认领已 seeding 的演示记录（仅当该记录 user_id 为空）。
 *
 * 设计要点：
 *  1. profiles 行由 auth.users 的「注册触发器」自动创建，规避「注册后无 session 写 profiles 被 RLS 拒绝」的时序坑。
 *  2. claim_identity 是 SECURITY DEFINER 函数，仅允许认领 user_id 为空的记录，杜绝抢占他人数据。
 *
 * 未配置 Supabase 时本模块全部返回 null / 抛错，不影响单机/演示模式。
 */

export interface SupabaseProfile {
  id: string;
  role: Role;
  student_id: string | null;
  teacher_id: string | null;
  display_name: string;
}

function buildPrincipal(p: SupabaseProfile): Principal {
  return {
    userId: p.id,
    role: p.role,
    studentId: p.student_id ?? undefined,
    teacherId: p.teacher_id ?? undefined,
  };
}

/** 取当前会话对应的 Principal（profiles 由注册触发器自动建）；无会话/无 profile 返回 null */
export async function getCurrentPrincipal(): Promise<Principal | null> {
  if (!isSupabaseEnabled) return null;
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.user) return null;
  const { data, error } = await client.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return buildPrincipal(data as SupabaseProfile);
}

export interface SignUpArgs {
  email: string;
  password: string;
  role: Role;
  /** 认领已有 seed 记录：学员填 sXX，教师填 tX；留空则创建属于自己的新记录 */
  bindId?: string;
  displayName?: string;
}

/** 注册：Supabase Auth 建账号 → 触发器自动建 profile →（若已自动登录）认领/创建身份记录 */
export async function signUp(args: SignUpArgs): Promise<Principal> {
  if (!isSupabaseEnabled) throw new Error('Supabase 未配置，无法注册');
  const client = getSupabase();
  const { data, error } = await client.auth.signUp({
    email: args.email,
    password: args.password,
    options: {
      data: {
        display_name: args.displayName ?? args.email.split('@')[0] ?? '用户',
        role: args.role,
      },
    },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('注册失败：未返回用户');

  // 若开启邮箱确认，此时无 session：profile 已由触发器建好，待用户点确认邮件后登录再认领。
  // 若关闭邮箱确认（开发/演示），注册即登录，可直接认领。
  if (data.session) {
    return claimIdentity(args.role, args.bindId);
  }
  // 无 session（等邮件确认）：返回占位 principal，UI 提示去查收邮件；登录后再补认领。
  return { userId: data.user.id, role: args.role };
}

/** 登录：密码校验 → 读取 profile → 若尚未认领身份则按 role 认领一次 */
export async function signIn(email: string, password: string): Promise<Principal> {
  if (!isSupabaseEnabled) throw new Error('Supabase 未配置，无法登录');
  const client = getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('登录失败');
  const principal = await getCurrentPrincipal();
  if (!principal) throw new Error('用户档案不存在，请先注册');
  if (!principal.studentId && !principal.teacherId) {
    return claimIdentity(principal.role, undefined);
  }
  return principal;
}

/** 认领/创建身份记录（教师/学员），幂等；返回最新 Principal */
export async function claimIdentity(role: Role, bindId?: string): Promise<Principal> {
  if (!isSupabaseEnabled) throw new Error('Supabase 未配置');
  const client = getSupabase();
  const { error } = await client.rpc('claim_identity', { p_role: role, p_bind_id: bindId ?? null });
  if (error) throw new Error(error.message);
  const principal = await getCurrentPrincipal();
  if (!principal) throw new Error('身份同步失败');
  return principal;
}

export async function signOut(): Promise<void> {
  if (!isSupabaseEnabled) return;
  const client = getSupabase();
  await client.auth.signOut();
}

/** 订阅登录态变化；返回取消订阅函数 */
export function onAuthChange(cb: (principal: Principal | null) => void): () => void {
  if (!isSupabaseEnabled) return () => {};
  const client = getSupabase();
  const { data } = client.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      cb(null);
      return;
    }
    try {
      const principal = await getCurrentPrincipal();
      cb(principal);
    } catch {
      cb(null);
    }
  });
  return () => data.subscription.unsubscribe();
}
