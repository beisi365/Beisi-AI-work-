// 验证 invite_codes 表是否已建，并把已生成的邀请码导出成可分发清单。
// 通过 service_role（绕过 RLS 与表级 revoke）select。
// 用法：node scripts/export-invite.mjs
import fs from 'node:fs';

function loadEnvLocal() {
  const out = {};
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {}
  return out;
}
const local = loadEnvLocal();
const url =
  local.SUPABASE_URL || local.VITE_SUPABASE_URL || 'https://soxhbgeaslldykhjrtcf.supabase.co';
const key = local.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('缺少 SUPABASE_SERVICE_ROLE_KEY（写入 .env.local）');
  process.exit(1);
}

const r = await fetch(`${url}/rest/v1/invite_codes?select=code,role,used_count,max_uses,expires_at,note&order=created_at.desc`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
});
const text = await r.text();

if (r.status === 404 || /relation "invite_codes" does not exist|42P01/.test(text)) {
  console.log('⚠️ invite_codes 表尚未创建 —— 你还没在 Supabase 后台 SQL Editor 执行 invite-codes-apply.sql。');
  console.log('   执行后本脚本即可导出邀请码清单。');
  process.exit(0);
}
if (!r.ok) {
  console.error(`查询失败 HTTP ${r.status}: ${text.slice(0, 500)}`);
  process.exit(1);
}

const rows = JSON.parse(text);
if (!rows.length) {
  console.log('表已存在，但还没有生成任何邀请码（invite-codes-apply.sql 的「生成邀请码」段未执行）。');
  process.exit(0);
}

const now = Date.now();
const student = rows.filter((x) => x.role === 'student');
const teacher = rows.filter((x) => x.role === 'teacher');
const fmt = (d) => (d ? new Date(d).toLocaleString('zh-CN') : '-');

console.log(`\n=== 邀请码清单（共 ${rows.length} 个）===\n`);
console.log(`【教师邀请码 ${teacher.length} 个】`);
for (const x of teacher) {
  const used = x.used_count >= x.max_uses ? '已用完' : `${x.used_count}/${x.max_uses}`;
  console.log(`  ${x.code}  [${used}]  过期 ${fmt(x.expires_at)}  ${x.note || ''}`);
}
console.log(`\n【学员邀请码 ${student.length} 个】`);
for (const x of student) {
  const used = x.used_count >= x.max_uses ? '已用完' : `${x.used_count}/${x.max_uses}`;
  console.log(`  ${x.code}  [${used}]  过期 ${fmt(x.expires_at)}  ${x.note || ''}`);
}
console.log('\n提示：把对应角色的码发给对应的人即可，每人一个、一次性使用。');
