// ============================================================
// 教师排班（时间排版表）工具：配色、日期解析、月历网格、排序
// ============================================================
import type { Teacher, TeacherSchedule } from '../data/types';

// 5 位老师固定配色（t1 用品牌橙 #FF7A1A）
export const TEACHER_COLORS: Record<string, string> = {
  t1: '#FF7A1A',
  t2: '#2D9CDB',
  t3: '#27AE60',
  t4: '#9B51E0',
  t5: '#EB5757',
};

export function teacherColor(teacherId: string, fallback = '#8A8F98'): string {
  return TEACHER_COLORS[teacherId] ?? fallback;
}

export function teacherName(teachers: Teacher[], id: string): string {
  return teachers.find((t) => t.id === id)?.name ?? id;
}

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 解析 'YYYY-MM-DD' 为本地零时 Date（避免 toISOString 的 UTC 偏移） */
export function parseDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

/** Date → 'YYYY-MM-DD' */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return formatDate(new Date());
}

/** 按 日期 → 起止时段 排序 */
export function sortByDateTime(a: TeacherSchedule, b: TeacherSchedule): number {
  if (a.schedule_date !== b.schedule_date) return a.schedule_date < b.schedule_date ? -1 : 1;
  return a.start_time < b.start_time ? -1 : 1;
}

export interface CalendarCell {
  date: Date | null; // null = 占位空白
  inMonth: boolean;
}

/** 生成某年某月的日历网格（周日为首列，含前后补位） */
export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=周日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < startDay; i++) cells.push({ date: null, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ date: null, inMonth: false });
  return cells;
}

/** 月份加减，返回新的 {year, month}（month 为 0-based） */
export function addMonths(y: number, m: number, delta: number): { year: number; month: number } {
  const d = new Date(y, m + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function timeRange(s: TeacherSchedule): string {
  return `${s.start_time}–${s.end_time}`;
}

/** 生成 [start, end] 闭区间内的所有日期（'YYYY-MM-DD' 数组，含首尾）；参数非法返回空数组 */
export function eachDayInRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  if (!startStr || !endStr) return out;
  let cur = parseDate(startStr);
  const end = parseDate(endStr);
  if (cur > end) return out;
  while (cur <= end) {
    out.push(formatDate(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}
