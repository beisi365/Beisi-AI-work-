// 只读账号清单：列出云端全部账号的「邮箱 + 角色 + 绑定身份」，不做任何写入。
//
// 用途：排查「我明明是管理员却不能编辑」这类问题——先看清楚到底登录的是哪个账号、它是什么角色。
//
// 用法（项目根目录）：
//   SUPABASE_SERVICE_ROLE_KEY=eyJh... node scripts/roster.mjs
//
// 说明：邮箱在 auth.users，角色在 public.profiles，两表按 id 拼接。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  try {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1];
    }
  } catch {
    /* 忽略 */
  }
  return undefined;
}

const url = loadEnvUrl();
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ 需要 .env 中的 VITE_SUPABASE_URL 与环境变量 SUPABASE_SECRET_KEY（或旧名 SUPABASE_SERVICE_ROLE_KEY）');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(url, key, { auth: { persistSession: false } });

const [{ data: profiles, error: pe }, { data: users, error: ue }] = await Promise.all([
  admin.from('profiles').select('id, role, teacher_id, student_id, display_name'),
  admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
]);
if (pe || ue) {
  console.error('❌ 读取失败：', pe?.message ?? ue?.message);
  process.exit(1);
}

const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email]));
console.log(`云端账号总数：${profiles?.length ?? 0}\n`);
console.log('role      email                              绑定');
console.log('--------  ---------------------------------  --------------------------------');
for (const p of profiles ?? []) {
  const email = emailById.get(p.id) ?? '(未关联)';
  const bind = p.teacher_id ? `teacher=${p.teacher_id}` : p.student_id ? `student=${p.student_id}` : '-';
  console.log(`${p.role.padEnd(8)}  ${JSON.stringify(email).padEnd(34)}  ${bind}`);
}
console.log('\n（★ role=admin 的才是运营管理员，能编辑全部教师与学员）');
