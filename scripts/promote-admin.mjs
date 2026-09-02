// 把指定邮箱提为运营管理员（role='admin'）。
//
// 安全说明（重要）：
//   - 本脚本只读 process.env.SUPABASE_SERVICE_ROLE_KEY，绝不写进任何文件、绝不提交。
//   - service_role key 绕过 RLS、权限最高，仅用于本次提权；用完建议在 Supabase 后台 rotate。
//   - 操作可逆：随时可把 role 改回 teacher/student（见 supabase/promote-to-admin.sql 末尾降级块）。
//
// 用法（在项目根目录执行）：
//   SUPABASE_SERVICE_ROLE_KEY=eyJh... node scripts/promote-admin.mjs
//   # 自定义邮箱（逗号分隔，覆盖默认）：
//   ADMIN_EMAILS=me@qq.com,other@qq.com SUPABASE_SERVICE_ROLE_KEY=eyJh... node scripts/promote-admin.mjs
//
// 注意：邮箱在 auth.users，角色在 public.profiles，两表按 id 拼接
//       （profiles 表本身没有 email 列，直接 select email 会报「column does not exist」）。

const DEFAULT_ADMIN_EMAILS = ['101808290@qq.com', '971535227@qq.com'];

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** 读取 .env 里的 SUPABASE_URL（URL 非秘密，可安全复用） */
function loadEnvUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1];
    }
  } catch {
    /* 无 .env 则忽略 */
  }
  return undefined;
}

const url = loadEnvUrl();
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ 缺少环境变量：需要 SUPABASE_URL（取自 .env）与 SUPABASE_SERVICE_ROLE_KEY');
  console.error('   用法：SUPABASE_SERVICE_ROLE_KEY=eyJh... node scripts/promote-admin.mjs');
  process.exit(1);
}

const targetEmails = (process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS.join(','))
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

/** 拉取「邮箱（auth.users） + 角色（profiles）」对照表 */
async function fetchRoster() {
  const [{ data: profiles, error: pe }, { data: users, error: ue }] = await Promise.all([
    admin.from('profiles').select('id, role, teacher_id, student_id, display_name'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (pe) throw new Error('读 profiles 失败：' + pe.message);
  if (ue) throw new Error('读 auth.users 失败：' + ue.message);
  const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? '(无邮箱)']));
  return (profiles ?? []).map((p) => ({ ...p, email: emailById.get(p.id) ?? '(未关联)' }));
}

function printRoster(title, rows) {
  console.log(`\n=== ${title} ===`);
  if (!rows.length) {
    console.log('  （空）');
    return;
  }
  for (const p of rows) {
    const flag = p.role === 'admin' ? '★' : ' ';
    console.log(
      `  ${flag} ${String(p.email).padEnd(28)} role=${String(p.role).padEnd(8)} teacher=${p.teacher_id ?? '-'}  student=${p.student_id ?? '-'}`,
    );
  }
}

try {
  const before = await fetchRoster();
  printRoster('提权前：全部账号角色', before);

  console.log(`\n=== 提权目标：${targetEmails.join(', ')} ===`);
  const { data: users, error: ue } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (ue) throw new Error('读 auth.users 失败：' + ue.message);
  const userByEmail = new Map((users?.users ?? []).map((u) => [(u.email ?? '').toLowerCase(), u]));

  let promoted = 0;
  for (const em of targetEmails) {
    const found = userByEmail.get(em);
    if (!found) {
      console.warn(`  ⚠ 未找到邮箱 ${em} 的账号（请先用该邮箱在 /login 注册后再跑）`);
      continue;
    }
    const { error } = await admin.from('profiles').upsert(
      {
        id: found.id,
        role: 'admin',
        teacher_id: null,
        student_id: null,
        display_name: found.email.split('@')[0],
      },
      { onConflict: 'id' },
    );
    if (error) {
      console.error(`  ❌ ${em} 提权失败：`, error.message);
      continue;
    }
    console.log(`  ✅ 已将 ${em} 设为运营/管理员`);
    promoted += 1;
  }

  const after = await fetchRoster();
  printRoster('提权后：全部账号角色', after);

  const admins = after.filter((p) => p.role === 'admin');
  console.log(
    `\n完成：本次提权 ${promoted} 个；当前管理员共 ${admins.length} 位 —— ${admins.map((a) => a.email).join(', ')}`,
  );
  console.log('→ 请让管理员账号重新登录（刷新会话），即可看到教师/学员的编辑入口。');
} catch (err) {
  console.error('❌ 执行失败：', err.message);
  process.exit(1);
}
