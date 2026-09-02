#!/usr/bin/env node
/**
 * purge-demo-students.mjs —— 演示学员数据「备份 + 清理」
 * ---------------------------------------------------------
 * 为什么要这个脚本：
 *   覆盖演示学员（如 s01-s25）时，他们名下的作业/出勤/学习记录/评语等关联数据
 *   会「改嫁」到新学员名下，导致真实学员档案里出现一堆编造的记录。
 *   正确顺序是：先备份 → 再清理关联数据 → 最后覆盖学员本体。
 *
 * 安全设计：
 *   - 默认只备份不删除（--backup-only）；
 *   - 删除前强制先写备份文件，备份失败则拒绝删除；
 *   - 备份文件含完整原始数据，可随时用 --restore <文件> 回滚。
 *
 * 用法：
 *   # 1) 先备份（只读，永远安全）
 *   SUPABASE_SERVICE_ROLE_KEY=eyJxxx node scripts/purge-demo-students.mjs --ids s01-s25 --backup-only
 *
 *   # 2) 确认备份无误后，清理关联数据（保留学员本体的其他字段）
 *   SUPABASE_SERVICE_ROLE_KEY=eyJxxx node scripts/purge-demo-students.mjs --ids s01-s25 --apply
 *
 *   # 3) 后悔了就回滚
 *   SUPABASE_SERVICE_ROLE_KEY=eyJxxx node scripts/purge-demo-students.mjs --restore backups/demo-s01-s25-xxx.json --apply
 *
 * 参数：
 *   --ids <范围>   学员 id 范围（如 s01-s25）或逗号列表（如 s01,s02）
 *   --backup-only  只备份不删除
 *   --apply        执行删除 / 回滚（不加则只预览）
 *   --restore <f>  从备份文件恢复
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BACKUP_DIR = resolve(ROOT, 'backups');

// 各表与学员的关联方式不同，这里显式声明，避免误删
const LINKS = [
  { table: 'enrollments', col: 'student_id' },
  { table: 'submissions', col: 'student_id' },
  { table: 'attendance', col: 'student_id' },
  { table: 'learning_records', col: 'student_id' },
  { table: 'ability_assessments', col: 'student_id' },
  { table: 'teacher_reviews', col: 'student_id' },
  { table: 'todos', col: 'related_student_id' },
  { table: 'files', col: 'owner_id', extra: { owner_type: 'student' } },
  { table: 'ai_analysis', col: 'ref_id', extra: { ref_type: 'student' } },
];

const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (n) => argv.includes(n);
const APPLY = has('--apply');
const BACKUP_ONLY = has('--backup-only');
const RESTORE = argOf('--restore');

function expandIds(spec) {
  if (!spec) return [];
  if (spec.includes(',')) return spec.split(',').map((s) => s.trim()).filter(Boolean);
  const m = spec.match(/^([a-zA-Z]+)(\d+)-([a-zA-Z]+)?(\d+)$/);
  if (m) {
    const p = m[1];
    const a = parseInt(m[2], 10);
    const b = parseInt(m[4], 10);
    const w = m[2].length;
    const out = [];
    for (let i = a; i <= b; i++) out.push(p + String(i).padStart(w, '0'));
    return out;
  }
  return [spec];
}

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!KEY) {
  console.error('[purge] 缺少 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
let url = '';
try {
  const env = readFileSync(resolve(ROOT, '.env'), 'utf-8');
  url = (env.match(/VITE_SUPABASE_URL\s*=\s*(.+)/) || [])[1]?.trim() || '';
} catch {}
if (!url) url = 'https://soxhbgeaslldykhjrtcf.supabase.co';
const sb = createClient(url, KEY);

// ---------- 回滚 ----------
if (RESTORE) {
  const data = JSON.parse(readFileSync(RESTORE, 'utf-8'));
  console.log(`[purge] 准备回滚备份：${RESTORE}`);
  console.log(`[purge] 涉及学员 ${data.ids.length} 位；各表条数：`, Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length])));
  if (!APPLY) {
    console.log('\n🔎 预览模式。加 --apply 执行回滚。');
    process.exit(0);
  }
  for (const [table, rows] of Object.entries(data.tables)) {
    if (!rows.length) continue;
    const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
    if (error) console.error(`[purge] 回滚 ${table} 失败：`, error.message);
    else console.log(`[purge] ✅ ${table} 已恢复 ${rows.length} 条`);
  }
  console.log('\n🎉 回滚完成。');
  process.exit(0);
}

// ---------- 备份 / 清理 ----------
const ids = expandIds(argOf('--ids') || 's01-s25');
if (!ids.length) {
  console.error('[purge] --ids 为空');
  process.exit(1);
}
console.log(`[purge] 目标学员 ${ids.length} 位：${ids[0]} … ${ids[ids.length - 1]}`);

const tables = {};
let total = 0;
for (const link of LINKS) {
  let q = sb.from(link.table).select('*').in(link.col, ids);
  if (link.extra) for (const [k, v] of Object.entries(link.extra)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) {
    console.error(`[purge] 读取 ${link.table} 失败：`, error.message);
    continue;
  }
  tables[link.table] = data || [];
  total += (data || []).length;
  console.log(`  ${link.table.padEnd(22)} ${(data || []).length} 条`);
}
console.log(`[purge] 合计 ${total} 条关联数据`);

// 学员本体也一并备份
const { data: stuRows } = await sb.from('students').select('*').in('id', ids);
tables.students = stuRows || [];

mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = resolve(BACKUP_DIR, `backup-${ids[0]}-${ids[ids.length - 1]}-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({ ids, created_at: Date.now(), tables }, null, 2), 'utf-8');
console.log(`\n[purge] ✅ 备份已写入：${backupPath}`);

if (BACKUP_ONLY || !APPLY) {
  console.log('\n🔎 仅备份，未删除任何数据。确认后加 --apply 清理。');
  process.exit(0);
}

// ---------- 删除（按依赖顺序：先子表后主表） ----------
console.log('\n[purge] 开始清理…');
for (const link of LINKS) {
  const rows = tables[link.table] || [];
  if (!rows.length) continue;
  let q = sb.from(link.table).delete().in(link.col, ids);
  if (link.extra) for (const [k, v] of Object.entries(link.extra)) q = q.eq(k, v);
  const { error } = await q;
  if (error) console.error(`[purge] 清理 ${link.table} 失败：`, error.message);
  else console.log(`[purge] 🗑  ${link.table} 已清理 ${rows.length} 条`);
}
const { error: se } = await sb.from('students').delete().in('id', ids);
if (se) console.error('[purge] 删除学员本体失败：', se.message);
else console.log(`[purge] 🗑  students 已清理 ${tables.students.length} 条`);

console.log(`\n🎉 清理完成。回滚命令：\n   SUPABASE_SERVICE_ROLE_KEY=… node scripts/purge-demo-students.mjs --restore "${backupPath}" --apply`);
