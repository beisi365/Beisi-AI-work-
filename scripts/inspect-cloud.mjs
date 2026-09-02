#!/usr/bin/env node
/**
 * inspect-cloud.mjs —— 云端数据只读体检（不写任何数据）
 * ------------------------------------------------------
 * 用途：导入/排班/查权限前，先看清楚云端现有教师、班级、学员、归属关系。
 *
 * 用法：
 *   SUPABASE_SERVICE_ROLE_KEY=eyJxxx node scripts/inspect-cloud.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=eyJxxx node scripts/inspect-cloud.mjs --students
 *   SUPABASE_SERVICE_ROLE_KEY=eyJxxx node scripts/inspect-cloud.mjs --class cl6
 *
 * 参数：
 *   --students   额外列出学员清单（默认只统计数量）
 *   --class <id> 只看该班级的学员归属
 *
 * 安全：只读 select，不做任何 insert/update/delete。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!KEY) {
  console.error('[inspect] 缺少 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 从 .env 读 URL，避免把地址也写死
let url = '';
try {
  const env = readFileSync(resolve(ROOT, '.env'), 'utf-8');
  url = (env.match(/VITE_SUPABASE_URL\s*=\s*(.+)/) || [])[1]?.trim() || '';
} catch {}
if (!url) url = 'https://soxhbgeaslldykhjrtcf.supabase.co';

const sb = createClient(url, KEY);

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const wantStudents = argv.includes('--students');
const classFilter = argOf('--class');

function head(t) {
  console.log(`\n=== ${t} ===`);
}

async function main() {
  head(`连接 ${url}`);

  // ---- 教师 ----
  const { data: teachers, error: e1 } = await sb
    .from('teachers')
    .select('id,name,title,subjects,user_id')
    .order('id');
  if (e1) throw new Error(`teachers: ${e1.message}`);
  head(`教师 (${teachers.length})`);
  for (const t of teachers) {
    console.log(
      `${(t.id || '').padEnd(18)} | ${(t.name || '').padEnd(10)} | ${(t.title || '').padEnd(14)} | ${(t.subjects || '').slice(0, 28).padEnd(28)} | ${t.user_id ? '已绑定' : '未绑定'}`,
    );
  }

  // ---- 班级 ----
  const { data: classes, error: e2 } = await sb
    .from('classes')
    .select('id,name,teacher_id')
    .order('id');
  if (e2) throw new Error(`classes: ${e2.message}`);
  head(`班级 (${classes.length})`);
  for (const c of classes) {
    console.log(`${(c.id || '').padEnd(8)} | ${(c.name || '').padEnd(26)} | teacher=${c.teacher_id || '(空)'}`);
  }

  // ---- 学员 ----
  const { data: students, error: e3 } = await sb
    .from('students')
    .select('id,nickname,occupation,archived_at')
    .order('id');
  if (e3) throw new Error(`students: ${e3.message}`);
  const active = students.filter((s) => !s.archived_at);
  head(`学员 (共 ${students.length}，在册 ${active.length}，归档 ${students.length - active.length})`);
  if (wantStudents) {
    for (const s of active) {
      console.log(`${(s.id || '').padEnd(8)} | ${(s.nickname || '').padEnd(10)} | ${s.occupation || ''}`);
    }
  } else {
    console.log('(加 --students 可列出明细)');
  }

  // ---- 归属关系 ----
  let q = sb.from('enrollments').select('id,student_id,class_id');
  if (classFilter) q = q.eq('class_id', classFilter);
  const { data: enrolls, error: e4 } = await q;
  if (e4) throw new Error(`enrollments: ${e4.message}`);
  head(`选课归属 (${enrolls.length})`);
  const byClass = new Map();
  for (const en of enrolls) {
    if (!byClass.has(en.class_id)) byClass.set(en.class_id, []);
    byClass.get(en.class_id).push(en.student_id);
  }
  for (const [cid, ids] of [...byClass].sort()) {
    const cname = classes.find((c) => c.id === cid)?.name || '(未知班)';
    console.log(`${cid.padEnd(8)} | ${cname.padEnd(26)} | ${ids.length} 人: ${ids.slice(0, 12).join(',')}${ids.length > 12 ? '…' : ''}`);
  }
  const noClass = active.filter((s) => !enrolls.some((e) => e.student_id === s.id));
  if (noClass.length) {
    console.log(`\n⚠️  未归属任何班级的学员 ${noClass.length} 人: ${noClass.map((s) => s.id).join(',')}`);
  }
}

main().catch((err) => {
  console.error('[inspect] 失败:', err.message);
  process.exit(1);
});
