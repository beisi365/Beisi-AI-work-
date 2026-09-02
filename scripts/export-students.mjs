#!/usr/bin/env node
/**
 * export-students.mjs —— 云端学员档案 → Excel（外部编辑的起点）
 * ------------------------------------------------------------------------
 * 配合 import-students.mjs 形成「外部可编辑即同步」闭环：
 *
 *   ① 导出：node scripts/export-students.mjs --class cl1
 *        → 生成 exports/学员档案-cl1-YYYYMMDD-HHMM.xlsx
 *   ② 外部编辑：用 Excel / WPS / 飞书表格 打开，直接改任意单元格
 *   ③ 回导：把改完的文件丢进 imports/，说一句「导入学员表」
 *        → node scripts/import-students.mjs --apply
 *
 * 关键约定：
 *   - 学号是主键，改姓名/改内容都能对上人；**不要改学号列**，否则会当新学员。
 *   - 前 9 列（学号…备注）是可回写列，与导入模板一一对应。
 *   - 后面的灰色参考列（年龄段/联系方式/…）只导出不回写，方便外部对照，
 *     导入脚本会忽略它们，留着也不影响。
 *
 * 用法：
 *   SUPABASE_SECRET_KEY=sb_secret_xxx node scripts/export-students.mjs [选项]
 *
 * 选项：
 *   --class <id>    只导出某个班（默认 cl1）；传 all 导出全部
 *   --out <path>    指定输出文件路径（默认 exports/ 下自动生成）
 *   --include-archived   连已归档学员一起导出
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);

const CLASS_ID = argOf('--class', 'cl1');
const INCLUDE_ARCHIVED = has('--include-archived');
const OUT = argOf('--out', '');

// —— 可回写列：与 import 模板严格一致，顺序即为 Excel 列顺序 ——
const EDITABLE_COLS = [
  ['学号', 'student_no'],
  ['姓名', 'nickname'],
  ['身份职业', 'occupation'],
  ['AI使用经验', 'ai_experience'],
  ['用过哪些AI', 'ai_tools_used'],
  ['学习目的', 'goal'],
  ['优先学习方向', 'priority_direction'],
  ['补充开放题', 'open_answer'],
  ['备注', 'remark'],
];

// —— 参考列：只导出不回写，导入时会忽略 ——
const REFERENCE_COLS = [
  ['系统ID', 'id'],
  ['年龄段', 'age_range'],
  ['联系方式', 'contact'],
  ['每周时长(小时)', 'weekly_hours'],
  ['设备', 'devices'],
  ['系统', 'os'],
  ['办公软件', 'office_software'],
  ['自我介绍', 'self_intro'],
  ['档案标签', 'teacher_tags'],
];

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!KEY) {
  console.error('[export] 缺少密钥。用法：SUPABASE_SECRET_KEY=sb_secret_xxx node scripts/export-students.mjs');
  process.exit(1);
}

let url = '';
try {
  const { readFileSync } = await import('node:fs');
  const env = readFileSync(resolve(ROOT, '.env'), 'utf-8');
  url = (env.match(/VITE_SUPABASE_URL\s*=\s*(.+)/) || [])[1]?.trim() || '';
} catch {}
if (!url) url = 'https://soxhbgeaslldykhjrtcf.supabase.co';

// ---------- 拉取学员 ----------
const select = 'id,nickname,student_no,occupation,ai_experience,ai_tools_used,goal,priority_direction,open_answer,remark,age_range,contact,weekly_hours,devices,os,office_software,self_intro,teacher_tags,archived_at';
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(url, KEY);

// 班级归属走 enrollments 关联表，students 表本身没有 class_id
let ids = null;
if (CLASS_ID && CLASS_ID !== 'all') {
  const { data: enr, error } = await sb.from('enrollments').select('student_id').eq('class_id', CLASS_ID);
  if (error) {
    console.error('[export] 查询班级归属失败：', error.message);
    process.exit(1);
  }
  ids = (enr || []).map((e) => e.student_id);
  if (!ids.length) {
    console.error(`[export] 班级 ${CLASS_ID} 下没有学员。`);
    process.exit(1);
  }
  console.log(`[export] 班级 ${CLASS_ID}：${ids.length} 名学员`);
}

let query = sb.from('students').select(select).order('student_no', { ascending: true });
if (ids) query = query.in('id', ids);
const { data: students, error: se } = await query;
if (se) {
  console.error('[export] 拉取学员失败：', se.message);
  process.exit(1);
}

const rows = (students || []).filter((s) => INCLUDE_ARCHIVED || !s.archived_at);
if (!rows.length) {
  console.error('[export] 没有可导出的学员（试试 --include-archived）。');
  process.exit(1);
}

// 学号为空时用系统 id 兜底，保证导出的表能被导入脚本识别
const noOf = (s) => (s.student_no && String(s.student_no).trim()) || (/^[a-zA-Z]*(\d+)$/.exec(s.id || '')?.[1] ?? '');

// 按学号数字排序，与 Excel 名单顺序一致
rows.sort((a, b) => {
  const na = Number((/\d+/.exec(noOf(a)) || [Infinity])[0]);
  const nb = Number((/\d+/.exec(noOf(b)) || [Infinity])[0]);
  return na - nb;
});

// ---------- 调 Python 生成 xlsx ----------
const py = (() => {
  for (const c of ['python3', 'python']) {
    try {
      execFileSync(c, ['-c', 'import openpyxl'], { stdio: 'ignore' });
      return c;
    } catch {}
  }
  console.error('[export] 找不到带 openpyxl 的 Python。先装：pip install openpyxl');
  process.exit(1);
})();

const payload = {
  columns: [...EDITABLE_COLS, ...REFERENCE_COLS],
  editableCount: EDITABLE_COLS.length,
  rows: rows.map((s) => {
    const o = {};
    for (const [label, key] of [...EDITABLE_COLS, ...REFERENCE_COLS]) {
      let v = s[key];
      if (key === 'student_no') v = noOf(s);
      if (Array.isArray(v)) v = v.join('、');
      o[label] = v == null ? '' : String(v);
    }
    return o;
  }),
};

const tmpJson = resolve(ROOT, '.tmp-export-payload.json');
writeFileSync(tmpJson, JSON.stringify(payload, null, 2), 'utf-8');

let outPath = OUT;
if (!outPath) {
  const exportsDir = resolve(ROOT, 'exports');
  if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  outPath = resolve(exportsDir, `学员档案-${CLASS_ID}-${stamp}.xlsx`);
}

try {
  execFileSync(py, [resolve(__dirname, 'build-xlsx.py'), tmpJson, outPath, String(CLASS_ID)], { stdio: 'inherit' });
} catch (e) {
  console.error('[export] 生成 Excel 失败：', e.message);
  process.exit(1);
} finally {
  try {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(tmpJson);
  } catch {}
}

// 统计完整度，提示哪些要回收
const missing = rows.filter((s) => !s.occupation && !s.goal).length;
console.log(`\n🎉 已导出 ${rows.length} 名学员 → ${basename(outPath)}`);
console.log(`   路径：${outPath}`);
console.log(`   前 ${EDITABLE_COLS.length} 列可编辑并回写；后面 ${REFERENCE_COLS.length} 列为只读参考（导入时忽略）。`);
if (missing) console.log(`   ⚠️  其中 ${missing} 人资料待补（编辑完记得保存回导）。`);
console.log(`\n下一步：用 Excel 改完 → 把文件放进 imports/ → 说「导入学员表」。`);
