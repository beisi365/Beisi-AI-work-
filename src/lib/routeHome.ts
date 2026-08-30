import type { Role } from '../data/types';

/** 按角色返回本人首页路径（越权访问时重定向目标）
 *  运营管理员走教师端中控（统管全部教师与排班），仅学员落学员端。 */
export function roleHome(role: Role): string {
  return role === 'student' ? '/s/home' : '/t/overview';
}
