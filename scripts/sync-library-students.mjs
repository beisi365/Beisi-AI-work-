#!/usr/bin/env node
/**
 * sync-library-students.mjs
 * --------------------------
 * 把「资料库在线表格」中的学员信息同步进中控本地桥接文件
 * src/data/studentOverrides.cl1.json，使中控在 buildSeed 时按学号覆盖
 * students 表字段、并按「所属班级」调整 enrollments 班级归属。
 *
 * 为什么这样设计：
 * - 中控是纯前端 SPA，资料库 API 需 token 鉴权，前端直连会暴露 token；
 * - 故采用「资料库(在线编辑) → 本脚本导出本地 JSON → 中控 import」的桥接，
 *   不触碰 localStorage 架构、不暴露任何凭证。
 *
 * 用法（在 WorkBuddy 对话中让我跑，或你自己用有 token 的环境跑）：
 *   node scripts/sync-library-students.mjs
 *
 * 前置：需设置环境变量 LIBRARY_DB_ID（资料库表 ID）与 LIBRARY_TOKEN，
 * 或用默认值。脚本通过 space_api.py 的 get_database_content 拉取 CSV。
 *
 * 同步后：中控「重置演示数据」或清空 localStorage 即会应用新数据。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_ID = process.env.LIBRARY_DB_ID || '1bgEQBWo4vOXnHD21foeSQ';
const TOKEN = process.env.LIBRARY_TOKEN || '';
const SKILL_ROOT =
  process.env.LIBRARY_SKILL_ROOT ||
  '/Users/beisi-peter/.workbuddy/plugins/cache/workbuddy-builtin/skill-library/0.5.9';
const OUT = resolve(__dirname, '../src/data/studentOverrides.cl1.json');

if (!TOKEN) {
  console.error('[sync] 缺少 LIBRARY_TOKEN，无法拉取资料库；请传入 token 或在中控对话中让我执行。');
  process.exit(1);
}

// 调资料库脚本拿 CSV
const raw = execFileSync(
  'python3',
  [
    resolve(SKILL_ROOT, 'database/get_database_content.py'),
    '--token-stdin',
    '--database-id',
    DB_ID,
  ],
  { input: TOKEN, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
);
const json = JSON.parse(raw);
const csv = json.content || '';
const lines = csv.trim().split('\n');
if (lines.length < 2) {
  console.error('[sync] 资料库表为空或解析失败');
  process.exit(1);
}

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

writeFileSync(
  OUT,
  JSON.stringify({ _comment: '由 scripts/sync-library-students.mjs 从资料库自动生成，请勿手改。', students }, null, 2) + '\n',
  'utf-8',
);
console.log(`[sync] 已写入 ${students.length} 条学员覆盖到 ${OUT}`);
console.log('[sync] 中控「重置演示数据」或清空 localStorage 后即生效。');
