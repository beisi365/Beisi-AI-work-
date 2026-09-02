// ============================================================
// 账号盘点 + 批量重置密码（Supabase Auth 管理员操作）
//
// 用途：重装系统 / 忘记密码后，盘点云端 auth 账号，并可选批量重置为统一临时密码。
// 用法（需 service_role key，绕过 RLS，拥有最高权限）：
//   列出全部账号（邮箱 + 角色 + 创建/登录时间）：
//     SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
//       node scripts/reset-accounts.mjs
//   列出 + 把「教师/学员」账号密码统一重置为 Passw0rd!2026（改完立即通知本人改密）：
//     SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
//       node scripts/reset-accounts.mjs --reset Passw0rd!2026
// ⚠️ service_role key 拥有最高权限，绝不写入 .env / 不提交 / 不暴露给前端。
// ============================================================
import { writeFileSync } from 'node:fs';

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
const RESET_TO = process.argv.includes('--reset')
  ? process.argv[process.argv.indexOf('--reset') + 1]
  : null;

if (!BASE || !KEY) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${KEY}`,
  apikey: KEY,
  'Content-Type': 'application/json',
};

async function listUsers() {
  // Auth Admin API 分页拉全
  let all = [];
  let page = 1;
  for (;;) {
    const res = await fetch(`${BASE}/auth/v1/admin/users?per_page=200&page=${page}`, {
      headers: authHeaders,
    });
    if (!res.ok) throw new Error(`列出用户失败 ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const batch = Array.isArray(data) ? data : data.users || [];
    all = all.concat(batch);
    if (batch.length < 200) break;
    if (!Array.isArray(data)) break;
    page += 1;
  }
  return all;
}

async function listProfiles() {
  const res = await fetch(
    `${BASE}/rest/v1/profiles?select=id,role,student_id,teacher_id,display_name`,
    { headers: authHeaders },
  );
  if (!res.ok) throw new Error(`列出 profiles 失败 ${res.status}: ${await res.text()}`);
  return res.json();
}

async function resetPassword(id, password) {
  const res = await fetch(`${BASE}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ password, password_confirm: password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`重置 ${id} 失败 ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  const [users, profiles] = await Promise.all([listUsers(), listProfiles()]);
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  console.log(`\n=== 云端账号盘点（共 ${users.length} 个 auth 账号） ===`);
  const rows = users.map((u) => {
    const p = profileById.get(u.id) || {};
    return {
      邮箱: u.email,
      角色: p.role ?? '（无 profile）',
      绑定: p.student_id ? `学员 ${p.student_id}` : p.teacher_id ? `教师 ${p.teacher_id}` : '—',
      创建: (u.created_at || '').slice(0, 10),
      最后登录: (u.last_sign_in_at || '从未').slice(0, 10),
    };
  });
  console.table(rows);

  const out = { generatedAt: new Date().toISOString(), users: rows };

  if (RESET_TO) {
    console.log(`\n=== 批量重置密码 → 「${RESET_TO}」 ===`);
    let n = 0;
    for (const u of users) {
      const p = profileById.get(u.id) || {};
      // 仅重置教师 / 学员，不动管理员
      if (p.role === 'teacher' || p.role === 'student') {
        await resetPassword(u.id, RESET_TO);
        console.log(`  ✓ ${u.email} (${p.role})`);
        n += 1;
      }
    }
    console.log(`\n已重置 ${n} 个教师/学员账号。`);
    out.resetTo = RESET_TO;
    out.resetCount = n;
    console.log('⚠️ 改完请立即通知本人登录后自行改密。');
  } else {
    console.log('\n提示：加 --reset <新密码> 可批量重置教师/学员密码（不影响管理员）。');
  }

  writeFileSync('scripts/_account-inventory.json', JSON.stringify(out, null, 2));
  console.log('\n盘点结果已写入 scripts/_account-inventory.json');
})().catch((e) => {
  console.error('执行失败：', e.message);
  process.exit(1);
});
