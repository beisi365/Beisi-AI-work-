// ============================================================
// 学员批量导入 · 纯前端 CSV 方案（零外部依赖）
// 解析 → 模板生成 → 逐行校验 → 复用 createStudent 事务批量写入。
// 设计为可在 Node（单元测试）与浏览器（弹窗）两端复用：
// 解析/校验/模板生成均为纯函数；仅 runBatchImport 依赖 DataLayer。
// ============================================================
import type { DataLayer } from '../data/repository/DataLayer';
import type { ChangeActor } from './submissionStatusGuards';
import type { ClassRow, User } from '../data/types';
import { createStudent, type CreateStudentInput } from './studentService';

// —— 列定义（中文表头即模板表头，导入时按表头精确匹配） ——
export interface ImportColumn {
  /** 对应 CreateStudentInput 的字段键；className 为导入专用（解析为 classId） */
  key: keyof CreateStudentInput | 'className';
  /** 模板表头（中文） */
  header: string;
  /** 是否必填 */
  required: boolean;
  /** 模板示例值 */
  example?: string;
  /** 说明 */
  hint?: string;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'account', header: '登录账号', required: true, example: 'lsf001', hint: '登录用，需唯一' },
  { key: 'loginName', header: '登录姓名', required: true, example: '林淑芬', hint: '系统身份名' },
  { key: 'nickname', header: '展示姓名', required: true, example: '小琳', hint: '页面显示昵称' },
  { key: 'className', header: '班级', required: true, example: 'AI应用基础班', hint: '需与系统内班级名一致' },
  { key: 'age_range', header: '年龄段', required: false, example: '30-40' },
  { key: 'occupation', header: '职业', required: false, example: '行政文员' },
  { key: 'contact', header: '联系方式', required: false, example: '138****0000' },
  { key: 'goal', header: '学习目标', required: false, example: '掌握结构化提示词' },
  { key: 'weekly_hours', header: '每周学习小时', required: false, example: '10' },
  { key: 'devices', header: '设备', required: false, example: '笔记本' },
  { key: 'os', header: '系统', required: false, example: 'Windows' },
  { key: 'office_software', header: '办公软件', required: false, example: 'Office、WPS' },
  { key: 'ai_tools_used', header: '常用AI工具', required: false, example: '豆包、文心' },
  { key: 'self_intro', header: '自我介绍', required: false, example: '零基础，想提升效率' },
  { key: 'can_self_service', header: '自助能力', required: false, example: '否', hint: '是/否' },
  { key: 'uses_paid_ai', header: '使用付费AI', required: false, example: '否', hint: '是/否' },
];

// ============================================================
// CSV 解析（RFC4180 取向，兼容引号/逗号/换行/Windows CRLF/BOM）
// ============================================================
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 去 BOM
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows
    .slice(1)
    .filter((r) => r.length > 0 && r.some((c) => c.trim() !== '')); // 丢弃全空行
  return { headers, rows: dataRows };
}

// ============================================================
// CSV 生成（字段含逗号/引号/换行时加引号转义）
// ============================================================
export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (s: string) => {
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map((c) => esc(c ?? '')).join(','));
  return lines.join('\r\n');
}

/** 生成带 UTF-8 BOM 的 CSV 模板（BOM 保证 Excel/Windows 正确识别中文） */
export function buildTemplateCsv(firstClassName?: string): string {
  const headers = IMPORT_COLUMNS.map((c) => c.header);
  const exampleRow = IMPORT_COLUMNS.map((c) => {
    if (c.key === 'className' && firstClassName) return firstClassName;
    return c.example ?? '';
  });
  const blankRow = IMPORT_COLUMNS.map(() => '');
  return '﻿' + toCsv(headers, [exampleRow, blankRow]);
}

// ============================================================
// 辅助：班级名→id 映射、已有账号集合
// ============================================================
export function buildClassMap(classes: ClassRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of classes) m.set(c.name.trim().toLowerCase(), c.id);
  return m;
}

export function collectAccounts(users: User[]): Set<string> {
  return new Set(users.map((u) => u.account.trim().toLowerCase()).filter(Boolean));
}

function parseBool(s: string): boolean {
  const v = s.trim().toLowerCase();
  return v === '是' || v === 'true' || v === '1' || v === 'y' || v === 'yes';
}

// ============================================================
// 逐行校验 → 生成导入计划（纯函数，便于测试）
// ============================================================
export interface ImportPlanRow {
  /** 数据行号（表头为第 1 行，首条数据为第 2 行） */
  lineNo: number;
  nickname: string;
  /** 校验通过则为可写入的入参，否则为 null */
  input: CreateStudentInput | null;
  errors: string[];
}

export function validateImportRows(
  parsed: { headers: string[]; rows: string[][] },
  classByName: Map<string, string>,
  existingAccounts: Set<string>,
): ImportPlanRow[] {
  const headerIndex = new Map<string, number>();
  parsed.headers.forEach((h, i) => headerIndex.set(h.trim(), i));

  const get = (row: string[], key: ImportColumn['key']): string => {
    const col = IMPORT_COLUMNS.find((c) => c.key === key);
    if (!col) return '';
    const hi = headerIndex.get(col.header.trim());
    if (hi === undefined) return '';
    return (row[hi] ?? '').trim();
  };

  const plan: ImportPlanRow[] = [];
  const seenAccounts = new Set<string>();

  parsed.rows.forEach((row, idx) => {
    const lineNo = idx + 2;
    const errors: string[] = [];
    const nickname = get(row, 'nickname');
    let account = get(row, 'account');
    const loginName = get(row, 'loginName') || nickname;
    const className = get(row, 'className');

    if (!nickname) errors.push('展示姓名必填');
    if (!account) errors.push('登录账号必填');

    let classId = '';
    if (!className) {
      errors.push('班级必填');
    } else {
      classId = classByName.get(className.toLowerCase()) ?? '';
      if (!classId) errors.push(`班级「${className}」在系统中不存在`);
    }

    if (account) {
      const a = account.toLowerCase();
      if (existingAccounts.has(a) || seenAccounts.has(a)) {
        errors.push('登录账号已存在（重复）');
      } else {
        seenAccounts.add(a);
      }
    }

    const valid = !errors.length && !!nickname && !!account && !!classId;
    const input: CreateStudentInput | null = valid
      ? {
          account,
          loginName,
          nickname,
          classId,
          age_range: get(row, 'age_range'),
          occupation: get(row, 'occupation'),
          contact: get(row, 'contact'),
          goal: get(row, 'goal'),
          weekly_hours: Number(get(row, 'weekly_hours')) || 0,
          devices: get(row, 'devices'),
          os: get(row, 'os'),
          office_software: get(row, 'office_software'),
          ai_tools_used: get(row, 'ai_tools_used'),
          can_self_service: parseBool(get(row, 'can_self_service')),
          uses_paid_ai: parseBool(get(row, 'uses_paid_ai')),
          self_intro: get(row, 'self_intro'),
        }
      : null;

    plan.push({ lineNo, nickname, input, errors });
  });

  return plan;
}

// ============================================================
// 批量写入：复用 createStudent（含事务/唯一校验/操作日志）
// ============================================================
export interface BatchImportResult {
  created: number;
  failed: { lineNo: number; nickname: string; reason: string }[];
}

export async function runBatchImport(
  db: DataLayer,
  actor: ChangeActor,
  plan: ImportPlanRow[],
): Promise<BatchImportResult> {
  const result: BatchImportResult = { created: 0, failed: [] };
  for (const row of plan) {
    if (!row.input) {
      // 预览阶段已标记的错误行：计入失败并带上原因，避免教师误以为"全部成功"
      result.failed.push({
        lineNo: row.lineNo,
        nickname: row.nickname || '(空)',
        reason: row.errors[0] || '未通过预览校验',
      });
      continue;
    }
    try {
      await createStudent(db, actor, row.input);
      result.created++;
    } catch (e) {
      result.failed.push({
        lineNo: row.lineNo,
        nickname: row.nickname || '(空)',
        reason: e instanceof Error ? e.message : '导入失败',
      });
    }
  }
  return result;
}
