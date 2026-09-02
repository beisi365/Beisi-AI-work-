// 登录入口角色（Login Entry Role）
//
// 背景：多用户（Supabase）模式下，登录页是唯一入口，三类角色（管理员 / 教师 / 学员）
// 共用一套「邮箱 + 密码」表单，登录后由 profile.role 决定跳往哪个端。
// 运营需要把「带角色的链接」直接发给不同人群（例：老师群里发教师入口、学员群里发学员入口），
// 避免对方在通用登录页里猜自己该点哪个。
//
// 约定：
// - 角色只影响「入口文案 / 注册时的默认身份 / 注册是否可见」，**不影响实际权限**。
//   真正的权限始终由服务端 profiles.role + RLS 决定，URL 参数改不了权限。
// - 管理员入口不提供自助注册（与 supabaseAuth.signUp 的 admin 拦截一致，双重保险）。
// - 纯函数 computeEntryRole 便于单元测试覆盖全部分支，不依赖浏览器全局。

import type { Role } from '../data/types';

/** 入口角色：登录页顶部三选一，对应三种使用人群 */
export type EntryRole = Extract<Role, 'admin' | 'teacher' | 'student'>;

/** URL 参数名：?role=admin | ?role=teacher | ?role=student */
export const ENTRY_ROLE_PARAM = 'role';

export const ENTRY_ROLES: EntryRole[] = ['admin', 'teacher', 'student'];

/** 默认入口角色：教师（工作台的核心使用者） */
export const DEFAULT_ENTRY_ROLE: EntryRole = 'teacher';

/** 纯函数：解析 URL 中的入口角色。非法 / 缺失值一律回落默认（教师），不抛错。 */
export function computeEntryRole(search: string): EntryRole {
  try {
    const v = new URLSearchParams(search).get(ENTRY_ROLE_PARAM)?.trim().toLowerCase();
    if (v === 'admin' || v === 'teacher' || v === 'student') return v;
    // 常见别名兜底：运营手动拼链接时可能写 ?role=a / ?role=运营
    if (v === 'a' || v === '运营' || v === '管理员') return 'admin';
    if (v === 't' || v === '老师' || v === '教师') return 'teacher';
    if (v === 's' || v === '学员' || v === '学生') return 'student';
    return DEFAULT_ENTRY_ROLE;
  } catch {
    return DEFAULT_ENTRY_ROLE;
  }
}

/** 拼接入角色参数的登录链接（用于复制分发） */
export function buildEntryUrl(origin: string, role: EntryRole): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/login?${ENTRY_ROLE_PARAM}=${role}`;
}

export const ENTRY_ROLE_META: Record<
  EntryRole,
  { label: string; title: string; hint: string; allowSignUp: boolean }
> = {
  admin: {
    label: '管理员',
    title: '管理员入口',
    hint: '统管全部教师、学员与排班。账号由平台运营统一授予，不开放自助注册。',
    allowSignUp: false,
  },
  teacher: {
    label: '教师',
    title: '教师入口',
    hint: '查看所带班级的学员、出勤、作业与评估，并维护本人排班与资料。',
    allowSignUp: true,
  },
  student: {
    label: '学员',
    title: '学员入口',
    hint: '查看本人的课表、作业、作品与能力评估，仅能看到自己的数据。',
    allowSignUp: true,
  },
};
