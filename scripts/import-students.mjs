#!/usr/bin/env node
/**
 * import-students.mjs —— Excel 学员表 → 云端教师档案（一键导入，可重复运行）
 * ------------------------------------------------------------------------
 * 设计原则：
 *   1. 默认 dry-run（只预览不写入），必须显式加 --apply 才动云端数据；
 *   2. 幂等：按学员 id upsert，重复导入同一份表不会产生重复记录、也不会清空已有数据；
 *   3. 不覆盖原则：Excel 里为空的字段不会去清掉云端已有值（除非加 --overwrite-empty）；
 *   4. 待补学员照常导入，打上「待补资料」标签，教师端一眼可见哪些要回收。
 *
 * 常用用法：
 *   # 预览（安全，默认）
 *   SUPABASE_SECRET_KEY=sb_secret_xxx node scripts/import-students.mjs \
 *       --file imports/AI赋能课-学员信息汇总表.xlsx --class cl1 --teacher t1 --prefix s
 *
 *   # 正式写入（先跑预览确认无误再加 --apply）
 *   SUPABASE_SECRET_KEY=sb_secret_xxx node scripts/import-students.mjs \
 *       --file imports/xxx.xlsx --class cl1 --teacher t1 --prefix s \
 *       --class-name "市民夜校·AI赋能课" --create-class --apply
 *
 *   # 首次从「拼接式旧数据」升级为结构化字段时加 --clean-legacy
 *   SUPABASE_SECRET_KEY=sb_secret_xxx node scripts/import-students.mjs --apply --clean-legacy
 *
 * 参数：
 *   --file <path>      Excel 路径；省略则自动取 imports/ 下最新 .xlsx
 *   --sheet <name>     工作表名；省略则自动找含「学号」列的表
 *   --class <id>       目标班级 id（默认 cl1）
 *   --class-name <n>   班级名称，配合 --create-class 使用
 *   --teacher <id>     教师 id（默认 t1 = Peter 汪老师）
 *   --prefix <p>       学员 id 前缀（默认 s，生成 s01…s25）
 *   --create-class     班级不存在时自动创建
 *   --apply            真正写入；不加则只预览
 *   --overwrite-empty  允许用空值覆盖云端已有内容（谨慎）
 *   --clean-legacy     清理早期版本把问卷拼进 self_intro/goal/notes/ai_baseline 的痕迹
 *
 * 字段映射（Excel 列 → 云端字段，逐项独立存储）：
 *   学号→student_no  姓名→nickname  身份职业→occupation  AI使用经验→ai_experience
 *   用过哪些AI→ai_tools_used  学习目的→goal  优先学习方向→priority_direction
 *   补充开放题→open_answer  备注→remark
 *
 * 依赖：Python + openpyxl（用于解析 xlsx）。脚本会自动探测解释器，找不到会明确报错。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMPORTS_DIR = resolve(ROOT, 'imports');

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);

const APPLY = has('--apply');
const CREATE_CLASS = has('--create-class');
const OVERWRITE_EMPTY = has('--overwrite-empty');
const CLEAN_LEGACY = has('--clean-legacy');
const CLASS_ID = argOf('--class', 'cl1');
const CLASS_NAME = argOf('--class-name', '市民夜校·AI赋能课');
const TEACHER_ID = argOf('--teacher', 't1');
const PREFIX = argOf('--prefix', 's');
const SHEET = argOf('--sheet', '');

let FILE = argOf('--file', '');
if (!FILE) {
  if (!existsSync(IMPORTS_DIR)) {
    console.error(`[import] 未指定 --file，且 imports/ 目录不存在。\n把 Excel 放进：${IMPORTS_DIR}`);
    process.exit(1);
  }
  const list = readdirSync(IMPORTS_DIR)
    .filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    .map((f) => ({ f, t: statSync(resolve(IMPORTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!list.length) {
    console.error(`[import] imports/ 里没有 Excel 文件：${IMPORTS_DIR}`);
    process.exit(1);
  }
  FILE = resolve(IMPORTS_DIR, list[0].f);
  console.log(`[import] 未指定 --file，自动取最新：${basename(FILE)}`);
}
if (!existsSync(FILE)) {
  console.error(`[import] 文件不存在：${FILE}`);
  process.exit(1);
}

// ---------- 探测 Python ----------
const PY_CANDIDATES = [
  '/Users/beisi-peter/.workbuddy/binaries/python/envs/default/bin/python',
  '/Users/beisi-peter/.workbuddy/binaries/python/versions/3.13.12/bin/python3',
  '/usr/bin/python3',
  'python3',
];
let PY = '';
for (const p of PY_CANDIDATES) {
  try {
    execFileSync(p, ['-c', 'import openpyxl'], { stdio: 'ignore' });
    PY = p;
    break;
  } catch {}
}
if (!PY) {
  console.error('[import] 找不到带 openpyxl 的 Python。请先安装：pip install openpyxl');
  process.exit(1);
}

// ---------- 解析 Excel ----------
console.log(`[import] 解析 ${basename(FILE)} …`);
const args = [resolve(__dirname, 'parse-xlsx.py'), FILE];
if (SHEET) args.push(SHEET);
let parsed;
try {
  const out = execFileSync(PY, args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  parsed = JSON.parse(out);
} catch (e) {
  console.error('[import] 解析失败：', e.message);
  process.exit(1);
}
if (!parsed.ok) {
  console.error('[import] 解析失败：', parsed.error);
  process.exit(1);
}
console.log(
  `[import] 工作表「${parsed.sheet}」表头第 ${parsed.header_row} 行 · 学员 ${parsed.stats.total} 人（已收 ${parsed.stats.filled}／待补 ${parsed.stats.pending}）`,
);

// ---------- 字段映射 ----------
const pad = (n) => String(n).padStart(2, '0');
const join = (sep, ...parts) => parts.filter((x) => x && String(x).trim()).join(sep);

/**
 * Excel 行 → 云端学员记录（结构化写入）
 * ------------------------------------------------------------------------
 * 问卷每一列写进独立字段，不再拼接成字符串。这样：
 *   ① 个人档案里能逐项看到「AI 使用经验 / 学习目的 / 优先方向 / 开放题 / 备注」；
 *   ② 平台里改完能导出回 Excel，外部改完再导回来 —— 学号是主键，一一对应。
 * 历史遗留：早期版本把问卷拼进了 self_intro / goal / notes / ai_baseline，
 * 用 --clean-legacy 可把这四类拼接痕迹清掉（见下方 cleanLegacy）。
 */
function mapStudent(r) {
  const id = `${PREFIX}${pad(r.seq)}`;
  const pending = !r.occupation && !r.goal;
  return {
    id,
    student_no: pad(r.seq), // 学号：外部 Excel 主键，导出/回导靠它对齐
    nickname: r.name || `学员${pad(r.seq)}`,
    occupation: r.occupation,
    ai_experience: r.ai_experience,
    ai_tools_used: r.ai_tools,
    goal: r.goal,
    priority_direction: r.priority,
    open_answer: r.open_answer,
    remark: r.remark,
    teacher_tags: pending ? ['待补资料'] : [],
    created_by: TEACHER_ID,
    _pending: pending,
    _seq: r.seq,
  };
}

/** 需要「不覆盖云端原值」的字段（Excel 为空时保留平台已填内容） */
const NO_OVERWRITE_FIELDS = [
  'nickname',
  'student_no',
  'occupation',
  'ai_experience',
  'ai_tools_used',
  'goal',
  'priority_direction',
  'open_answer',
  'remark',
  'self_intro',
  'notes',
  'ai_baseline',
];

// —— 历史拼接痕迹特征：命中才清，避免误伤教师/学员后来真实填写的内容 ——
const LEGACY_PATTERNS = {
  self_intro: /^身份[：:]/,
  ai_baseline: /^AI\s*使用经验[：:]/,
  goal: /^学习目的[：:]/,
  notes: /^(备注|开放题)[：:]/,
};

/**
 * 清理早期版本把问卷拼进通用字段留下的痕迹（仅在 --clean-legacy 时调用）。
 * 只清「看起来就是拼接产物」的值；教师后来手写的分析/建议一律保留。
 */
function cleanLegacy(out, old) {
  const cleared = [];
  for (const [field, re] of Object.entries(LEGACY_PATTERNS)) {
    const cur = (old ?? {})[field];
    if (typeof cur === 'string' && re.test(cur.trim()) && !out[field]) {
      out[field] = field === 'ai_baseline' ? null : '';
      cleared.push(field);
    }
  }
  return cleared;
}

const students = parsed.rows.map(mapStudent);

// ---------- 预览 ----------
console.log('\n——— 导入预览 ———');
console.log('目标班级：', CLASS_ID, CLASS_NAME ? `（${CLASS_NAME}）` : '', '｜教师：', TEACHER_ID);
console.log('学员 id 示例：', students[0]?.id, '…', students[students.length - 1]?.id);
console.log('');
for (const s of students) {
  const flag = s._pending ? '⚠️ 待补' : '✅ 已收';
  console.log(
    `  ${s._seq.toString().padStart(2)} → ${s.id.padEnd(7)} ${flag}  ${s.nickname.padEnd(8)} ${(s.occupation || '—').padEnd(12)} ${(s.goal || '').slice(0, 34)}`,
  );
}
if (parsed.skipped.length) {
  console.log(`\n⚠️  以下 ${parsed.skipped.length} 行未导入（学号为空/非数字，需人工认领后补录）：`);
  for (const s of parsed.skipped) console.log(`   第${s.row}行 ${s.label} / ${s.name}`);
}

if (!APPLY) {
  console.log('\n🔎 这是预览（dry-run），未写入任何数据。确认无误后加 --apply 正式导入。');
  process.exit(0);
}

// ---------- 连接云端 ----------
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!KEY) {
  console.error('[import] 缺少 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
let url = '';
try {
  const { readFileSync } = await import('node:fs');
  const env = readFileSync(resolve(ROOT, '.env'), 'utf-8');
  url = (env.match(/VITE_SUPABASE_URL\s*=\s*(.+)/) || [])[1]?.trim() || '';
} catch {}
if (!url) url = 'https://soxhbgeaslldykhjrtcf.supabase.co';
const sb = createClient(url, KEY);

// ---------- 班级检查/创建 ----------
const { data: cls, error: ce } = await sb.from('classes').select('id,name,teacher_id').eq('id', CLASS_ID).maybeSingle();
if (ce) {
  console.error('[import] 查询班级失败：', ce.message);
  process.exit(1);
}
if (!cls) {
  if (!CREATE_CLASS) {
    console.error(`[import] 班级 ${CLASS_ID} 不存在。加 --create-class 自动创建，或换一个已存在的班级 id。`);
    process.exit(1);
  }
  const now = Date.now();
  const { error: e } = await sb.from('classes').insert({
    id: CLASS_ID,
    name: CLASS_NAME,
    course_id: '',
    teacher_id: TEACHER_ID,
    start_date: '',
    end_date: '',
    schedule: '',
    capacity: students.length,
    status: 'active',
    created_at: now,
    updated_at: now,
    created_by: TEACHER_ID,
  });
  if (e) {
    console.error('[import] 创建班级失败：', e.message);
    process.exit(1);
  }
  console.log(`[import] ✅ 已创建班级 ${CLASS_ID}「${CLASS_NAME}」→ 教师 ${TEACHER_ID}`);
} else {
  console.log(`[import] 复用已有班级 ${CLASS_ID}「${cls.name}」（教师 ${cls.teacher_id}）`);
}

// ---------- 写入学员（幂等 upsert） ----------
const { data: existing, error: ee } = await sb
  .from('students')
  .select(
    'id,nickname,student_no,occupation,goal,self_intro,notes,ai_tools_used,ai_baseline,ai_experience,priority_direction,open_answer,remark,teacher_tags',
  )
  .in('id', students.map((s) => s.id));
if (ee) {
  console.error('[import] 查询已有学员失败：', ee.message);
  process.exit(1);
}
const existMap = new Map((existing || []).map((s) => [s.id, s]));
const now = Date.now();
const legacyCleared = []; // 记录被清掉拼接痕迹的学员，便于事后核对

const payload = students.map((s) => {
  const old = existMap.get(s.id);
  const out = { ...s, updated_at: now };
  delete out._pending;
  delete out._seq;
  if (!old) {
    // 新学员：补齐必填默认字段
    out.user_id = null;
    out.age_range = out.age_range || '';
    out.contact = out.contact || '';
    out.enroll_date = out.enroll_date || new Date().toISOString().slice(0, 10);
    out.weekly_hours = 0;
    out.devices = out.devices || '';
    out.os = out.os || '';
    out.office_software = out.office_software || '';
    out.can_self_service = false;
    out.uses_paid_ai = false;
    out.archived_at = null;
    out.created_at = now;
    return out;
  }
  // 已存在：不覆盖原则 —— Excel 里为空的字段保留云端原值
  if (!OVERWRITE_EMPTY) {
    for (const k of NO_OVERWRITE_FIELDS) {
      if (!out[k]) out[k] = old[k];
    }
    if (!out.teacher_tags?.length) out.teacher_tags = old.teacher_tags || [];
  }
  // 可选：清掉早期版本把问卷拼进通用字段留下的痕迹
  if (CLEAN_LEGACY) {
    const cleared = cleanLegacy(out, old);
    if (cleared.length) legacyCleared.push(`${s.id}(${cleared.join(',')})`);
  }
  delete out.created_at;
  return out;
});

const { error: ue } = await sb.from('students').upsert(payload, { onConflict: 'id' });
if (ue) {
  console.error('[import] 写入学员失败：', ue.message);
  process.exit(1);
}
const created = students.filter((s) => !existMap.has(s.id)).length;
console.log(`[import] ✅ 学员写入完成：新增 ${created}／更新 ${students.length - created}`);
if (legacyCleared.length) {
  console.log(`[import] 🧹 已清理 ${legacyCleared.length} 条历史拼接痕迹：${legacyCleared.slice(0, 8).join('、')}${legacyCleared.length > 8 ? ' …' : ''}`);
}

// ---------- 写入归属关系 ----------
const enrollDate = new Date().toISOString().slice(0, 10);
const enrolls = students.map((s) => ({
  id: `en_${s.id}_${CLASS_ID}`,
  student_id: s.id,
  class_id: CLASS_ID,
  enroll_date: enrollDate,
  status: 'active',
  created_at: now,
  updated_at: now,
}));
const { error: ene } = await sb.from('enrollments').upsert(enrolls, { onConflict: 'id' });
if (ene) {
  console.error('[import] 写入归属关系失败：', ene.message);
  process.exit(1);
}
console.log(`[import] ✅ 归属关系写入完成：${enrolls.length} 人 → ${CLASS_ID}`);

console.log(`\n🎉 导入完成。用管理员账号登录 →「学员档案」即可看到这 ${students.length} 位学员（待补 ${students.filter((s) => s._pending).length} 位已打「待补资料」标签）。`);
