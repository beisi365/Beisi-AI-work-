#!/usr/bin/env node
/**
 * export-cl2-cl5-csv.mjs（一次性工具）
 * -----------------------------------
 * 读取已提交的 src/data/studentOverrides.cl2-cl5.json（100 名 cl2-cl5 示例学员），
 * 按班级拆成 4 张「资料库表」可直接导入的 CSV，输出到 scripts/lib-csv/。
 *
 * 用途：把 26-125 位学员的起始档案放进资料库，和前 25 位（cl1）一样走
 * 「资料库在线编辑 → sync-library-students.mjs 同步 → 中控自动更新」的桥接。
 *
 * CSV 表头与 sync-library-students.mjs 读取的字段严格一致：
 *   学号,姓名,登录名,年龄段,职业,自我介绍,所属班级,AI基线分析,教师标签,长期观察,学习建议
 * 其中 所属班级 用「clX·班级名」格式（与 cl1 表一致），同步时按前缀 cl1-cl5 映射回班级。
 * 内部四字段（AI基线分析/教师标签/长期观察/学习建议）留空——这些刻意不桥接，仍由中控维护。
 *
 * 防御：文本字段中的半角逗号统一转成全角逗号，避免被同步脚本按列切分错位。
 *
 * 用法：node scripts/export-cl2-cl5-csv.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../src/data/studentOverrides.cl2-cl5.json');
const OUT_DIR = resolve(__dirname, 'lib-csv');

// 班级 → 资料库「所属班级」标签（前缀 cl1-cl5 必须保留，供同步映射）
const CLASS_LABEL = {
  cl2: 'cl2·AI图像/视频',
  cl3: 'cl3·AI办公/PPT',
  cl4: 'cl4·AI智能体/工作流',
  cl5: 'cl5·课程统筹/学员成长',
};

const HEADER = [
  '学号', '姓名', '登录名', '年龄段', '职业', '自我介绍',
  '所属班级', 'AI基线分析', '教师标签', '长期观察', '学习建议',
];

// 半角逗号 → 全角，避免 CSV 列错位
const safe = (v) => String(v ?? '').replace(/,/g, '，');

function toRow(s) {
  const cls = CLASS_LABEL[s.class_id] || s.class_id || '';
  return [
    safe(s.student_id),
    safe(s.nickname),
    safe(`stu_${s.student_id}`), // 登录名，对齐 cl1 的 stu_sXX 约定
    safe(s.age_range),
    safe(s.occupation),
    safe(s.self_intro),
    safe(cls),
    '', // AI基线分析（不桥接）
    '', // 教师标签（不桥接）
    '', // 长期观察（不桥接）
    '', // 学习建议（不桥接）
  ].join(',');
}

const raw = JSON.parse(readFileSync(SRC, 'utf-8'));
const students = raw.students || [];

const byClass = { cl2: [], cl3: [], cl4: [], cl5: [] };
for (const s of students) {
  const c = s.class_id;
  if (byClass[c]) byClass[c].push(s);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const c of ['cl2', 'cl3', 'cl4', 'cl5']) {
  const rows = byClass[c].map(toRow);
  const csv = [HEADER.join(','), ...rows].join('\n') + '\n';
  const file = resolve(OUT_DIR, `${c}.csv`);
  writeFileSync(file, csv, 'utf-8');
  console.log(`[export] ${c}.csv → ${byClass[c].length} 条（${CLASS_LABEL[c]}）`);
}
console.log(`\n[export] CSV 已生成到 ${OUT_DIR}`);
console.log('[export] 下一步：在资料库新建 4 张表（列名严格同表头），分别导入 cl2/cl3/cl4/cl5.csv；');
console.log('        然后拿到 4 张表的 database_id，设置 LIBRARY_DB_ID_CL2..CL5 后跑 sync-library-students.mjs。');
