import type { Role } from '../data/types';

/** 按角色返回本人首页路径（越权访问时重定向目标） */
export function roleHome(role: Role): string {
  return role === 'teacher' ? '/t/overview' : '/s/home';
}
