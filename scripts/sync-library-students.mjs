#!/usr/bin/env node
/**
 * sync-library-students.mjs（多班版）
 * --------------------------------
 * 把「资料库在线表格」中【各班】的学员信息同步进中控本地桥接文件，使中控在
 * buildSeed 时按学号覆盖 students 表字段、并按「所属班级」调整 enrollments 班级归属。
 *
 * 为什么这样设计：
 * - 中控是纯前端 SPA，资料库 API 需 token 鉴权，前端直连会暴露 token；
 * - 故采用「资料库(在线编辑) → 本脚本导出本地 JSON → 中控 import」的桥接，
 *   不触碰 localStorage 架构、不暴露任何凭证。
 * - 本脚本是【单向拉取】，不写资料库；把数据放进资料库需在你自己的资料库账号里操作
 *   （见 scripts/export-cl2-cl5-csv.mjs 导出的 CSV，可一键导入新建的各班表）。
 *
 * 每班一张资料库表，DB ID 通过环境变量配置：
 *   LIBRARY_TOKEN          必填，资料库 token
 *   LIBRARY_SKILL_ROOT     选填，资料库 skill 根目录
 *   LIBRARY_DB_ID_CL1      选填，默认 cl1 表 ID（已有真实数据）
 *   LIBRARY_DB_ID_CL2      选填，cl2 表 ID；未设置则跳过该班
 *   LIBRARY_DB_ID_CL3      选填，cl3 表 ID；未设置则跳过该班
 *   LIBRARY_DB_ID_CL4      选填，cl4 表 ID；未设置则跳过该班
 *   LIBRARY_DB_ID_CL5      选填，cl5 表 ID；未设置则跳过该班
 *
 * 输出：
 *   src/data/studentOverrides.cl1.json        cl1 表（始终按默认/配置拉取）
 *   src/data/studentOverrides.cl2-cl5.json     cl2-cl5 已配置表的合并结果；
 *                                             未配置任何表时保留原有文件（本地示例）不动
 *
 * 合并策略（防数据丢失）：
 *   cl2-cl5 以已提交的示例文件为基底，仅【覆盖】被资料库表覆盖到的学号；
 *   某班表未配置时，该班示例学员原样保留；某班表只填了部分学员时，未填的示例学员也保留。
 *
 * 用法：
 *   LIBRARY_TOKEN=<op_xxx> node scripts/sync-library-students.mjs
 *   LIBRARY_TOKEN=<op_xxx> LIBRARY_DB_ID_CL2=<id2> LIBRARY_DB_ID_CL3=<id3> \
 *     LIBRARY_DB_ID_CL4=<id4> LIBRARY_DB_ID_CL5=<id5> node scripts/sync-library-students.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../src/data');

const TOKEN = process.env.LIBRARY_TOKEN || '';
const SKILL_ROOT =
  process.env.LIBRARY_SKILL_ROOT ||
  '/Users/beisi-peter/.workbuddy/plugins/cache/workbuddy-builtin/skill-library/0.5.9';

const CL1_DEFAULT = '1bgEQBWo4vOXnHD21foeSQ';
// 读取 scripts/lib-db-ids.json（建表时自动生成的 4 个 database_id），作为 cl2-cl5 默认来源；
// 环境变量 LIBRARY_DB_ID_CLx 优先级更高，两者皆无则该班跳过。
function readIdsFile() {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, 'lib-db-ids.json'), 'utf-8')) || {};
  } catch {
    return {};
  }
}
const IDS_FILE = readIdsFile();
// 每班：id / 环境变量名 / dbId（空=跳过）/ 输出文件
const CLASSES = [
  { id: 'cl1', dbEnv: 'LIBRARY_DB_ID_CL1', dbId: process.env.LIBRARY_DB_ID_CL1 || CL1_DEFAULT, out: 'studentOverrides.cl1.json' },
  { id: 'cl2', dbEnv: 'LIBRARY_DB_ID_CL2', dbId: process.env.LIBRARY_DB_ID_CL2 || IDS_FILE.cl2 || '', out: 'studentOverrides.cl2-cl5.json' },
  { id: 'cl3', dbEnv: 'LIBRARY_DB_ID_CL3', dbId: process.env.LIBRARY_DB_ID_CL3 || IDS_FILE.cl3 || '', out: 'studentOverrides.cl2-cl5.json' },
  { id: 'cl4', dbEnv: 'LIBRARY_DB_ID_CL4', dbId: process.env.LIBRARY_DB_ID_CL4 || IDS_FILE.cl4 || '', out: 'studentOverrides.cl2-cl5.json' },
  { id: 'cl5', dbEnv: 'LIBRARY_DB_ID_CL5', dbId: process.env.LIBRARY_DB_ID_CL5 || IDS_FILE.cl5 || '', out: 'studentOverrides.cl2-cl5.json' },
];

if (!TOKEN) {
  console.error('[sync] 缺少 LIBRARY_TOKEN，无法拉取资料库；请传入 token 或在中控对话中让我执行。');
  process.exit(1);
}

// 调资料库脚本拿某张表的 CSV，解析为学员对象数组
function pullTable(dbId) {
  const raw = execFileSync(
    'python3',
    [
      resolve(SKILL_ROOT, 'database/get_database_content.py'),
      '--token-stdin',
      '--database-id',
      dbId,
    ],
    { input: TOKEN, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
  );
  const json = JSON.parse(raw);
  const csv = json.content || '';
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  const idx = (name) => header.indexOf(name);
  const iSid = idx('学号');
  const iName = idx('姓名');
  const iLogin = idx('登录名');
  const iAge = idx('年龄段');
  const iOcc = idx('职业');
  const iIntro = idx('自我介绍');
  const iClass = idx('所属班级');
  const iBaseline = idx('AI基线分析');
  const iTags = idx('教师标签');
  const iObs = idx('长期观察');
  const iSug = idx('学习建议');

  const students = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    const sid = row[iSid];
    if (!sid) continue;
    const tags = (row[iTags] || '')
      .split(/[;/|]/)
      .map((t) => t.trim())
      .filter(Boolean);
    students.push({
      student_id: sid,
      nickname: row[iName] || undefined,
      loginName: row[iLogin] || undefined,
      age_range: row[iAge] || undefined,
      occupation: row[iOcc] || undefined,
      self_intro: row[iIntro] || '',
      class_id: row[iClass] || undefined,
      ai_baseline: row[iBaseline] || null,
      teacher_tags: tags,
      teacher_observation: row[iObs] || null,
      learning_suggestion: row[iSug] || null,
    });
  }
  return students;
}

// 读取已提交的 cl2-cl5 示例文件作为基底（防误删未配置班的学员）
function readBase() {
  try {
    const p = resolve(DATA_DIR, 'studentOverrides.cl2-cl5.json');
    return JSON.parse(readFileSync(p, 'utf-8')).students || [];
  } catch {
    return [];
  }
}

// ---- 主流程 ----
const base = readBase();
const merged = new Map();
for (const s of base) if (s?.student_id) merged.set(s.student_id, s);

let cl1Written = false;
const configuredCl25 = [];

for (const c of CLASSES) {
  if (!c.dbId) {
    console.log(`[sync] ${c.id} 未配置 ${c.dbEnv}，跳过（保留本地示例/已有数据）`);
    continue;
  }
  const pulled = pullTable(c.dbId);
  console.log(`[sync] ${c.id} 拉取 ${pulled.length} 条`);
  if (c.id === 'cl1') {
    writeFileSync(
      resolve(DATA_DIR, c.out),
      JSON.stringify(
        { _comment: '由 scripts/sync-library-students.mjs 从资料库自动生成，请勿手改。', students: pulled },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    cl1Written = true;
  } else {
    configuredCl25.push(c.id);
    for (const s of pulled) if (s?.student_id) merged.set(s.student_id, s);
  }
}

if (configuredCl25.length) {
  const all = [...merged.values()];
  writeFileSync(
    resolve(DATA_DIR, 'studentOverrides.cl2-cl5.json'),
    JSON.stringify(
      {
        _comment: `由 scripts/sync-library-students.mjs 从资料库 ${configuredCl25.join('/')} 表合并生成，请勿手改；未配置的班保留本地示例。`,
        students: all,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
  console.log(`[sync] cl2-cl5 合并写入 ${all.length} 条 → studentOverrides.cl2-cl5.json（已配置班：${configuredCl25.join(', ')}）`);
} else {
  console.log('[sync] 未配置任何 cl2-cl5 表，保留原有 studentOverrides.cl2-cl5.json（本地示例）不动。');
}

if (cl1Written) console.log('[sync] cl1 已更新 → studentOverrides.cl1.json');
console.log('[sync] 中控「重置演示数据」或清空 localStorage 后即生效。');
