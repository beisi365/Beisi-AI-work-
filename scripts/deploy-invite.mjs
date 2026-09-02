// 一次性把邀请码方案落到 Supabase：建表 + 函数 + 生成邀请码。
// key 通过命令行环境变量传入，绝不落盘。
// 用法：
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=sb_secret_xxx node scripts/deploy-invite.mjs
import fs from 'node:fs';
import path from 'node:path';

function loadEnvLocal() {
  const out = {};
  try {
    const text = fs.readFileSync('.env.local', 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {}
  return out;
}

const local = loadEnvLocal();
const url =
  process.env.SUPABASE_URL ||
  local.SUPABASE_URL ||
  local.VITE_SUPABASE_URL ||
  'https://soxhbgeaslldykhjrtcf.supabase.co';
const key = process.env.SUPABASE_SERVICE_KEY || local.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（写入 .env.local 即可）');
  process.exit(1);
}

const ddl = fs.readFileSync(path.resolve('supabase/invite-codes.sql'), 'utf8');

// 生成 30 个学员码 + 8 个教师码（一次性使用，90 天有效）
const genCodes = `
insert into public.invite_codes (code, role, max_uses, expires_at, note)
select 'NS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
       'student', 1, now() + interval '90 days', '2026 秋季 AI 赋能课'
from generate_series(1, 30)
returning code;

insert into public.invite_codes (code, role, max_uses, expires_at, note)
select 'NT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
       'teacher', 1, now() + interval '90 days', '2026 秋季 AI 赋能课 · 教师'
from generate_series(1, 8)
returning code;
`;

const verify = `select role, count(*) as total from public.invite_codes group by role;`;

async function run(query, label) {
  const r = await fetch(`${url}/rest/v1/sql`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  console.log(`\n=== ${label} -> HTTP ${r.status} ===`);
  console.log(text.slice(0, 3000));
  if (!r.ok) throw new Error(`${label} 失败: ${text}`);
  return text;
}

// 1) 探测连通性
await run('select 1 as ok', '连通性探测');
// 2) 建表 + 函数
await run(ddl, 'DDL（建表 + redeem_invite 函数 + 收权）');
// 3) 生成邀请码
await run(genCodes, '生成邀请码');
// 4) 验证
await run(verify, '验证发放数量');

console.log('\n✅ 邀请码表已创建、函数已就绪、邀请码已生成。');
