// ============================================================
// CP2.1 完整能力评估与历史对比 — 服务层
//
// 设计要点（经字段提案与用户确认；本轮为「正式开放前修正」）：
// - 一次完整评估的六维共用一个 assessment_group_id（UUID）；同组必须属于同一学员、同一教师、同一次评估，维度不重复。
// - 生命周期：draft → confirmed → published。
// - 修正流程（本轮修正）：点击「修正」仅创建新的 draft，旧 published 继续有效；
//   只有新版本发布成功时，才在同一事务内将新版设为 published、旧版（同 student 的其他 published 组）设为 voided；
//   新版本确认/发布或事务失败期间，旧版必须继续可见。
// - 确认/发布/作废/修正均为「整组原子」操作：借助 DataLayer.transaction，任一步失败整体回滚。
// - 遗留 CP1 数据为单项记录（assessment_group_id = null），按 'published' 兼容，继续参与 CP1 能力摘要与单维历史，
//   在 CP2 完整历史中标记为「历史单项记录」，绝不用时间戳伪造分组。
// - 不调用任何外部 AI；无证据不得生成/发布分数（确认前六维须齐全、每维主动选择等级且具备具体事实证据）。
// ============================================================

import type { DataLayer } from '../data/repository/DataLayer';
import type {
  AbilityAssessment,
  AbilityDimension,
  AbilityLevel,
  AssessmentSource,
  AssessmentStatus,
} from '../data/types';
import { levelToNum } from './format';

export const ALL_DIMENSIONS: AbilityDimension[] = [
  'basics',
  'requirement',
  'prompt',
  'operation',
  'judgement',
  'application',
];

export interface AssessmentDimInput {
  dimension: AbilityDimension;
  level: AbilityLevel | null; // 新建草稿允许未选择等级（null）
  source: AssessmentSource;
  evidence_id?: string | null;
  evidence_text?: string | null;
  ai_suggested_level?: AbilityLevel | null;
}

export interface CreateAssessmentGroupInput {
  studentId: string;
  teacherId: string; // 创建者 user id（写入 created_by）
  dims: AssessmentDimInput[];
}

/** 单个维度在某组内的快照（供 UI 渲染） */
export interface GroupDimView {
  id: string;
  level: AbilityLevel | null;
  source: AssessmentSource;
  evidence_id: string | null;
  evidence_text: string | null;
  ai_suggested_level: AbilityLevel | null;
  teacher_confirmed_level: AbilityLevel | null;
  status: AssessmentStatus;
}

export interface AssessmentGroupSummary {
  groupId: string;
  studentId: string;
  teacherId: string; // created_by
  status: AssessmentStatus;
  createdAt: number;
  dims: Partial<Record<AbilityDimension, GroupDimView>>;
  isLegacy?: boolean;
}

export interface ListGroupsOpts {
  studentId?: string;
  includeVoided?: boolean;
}

export interface StudentAssessmentView {
  publishedGroups: AssessmentGroupSummary[];
  legacy: AbilityAssessment[]; // 历史单项记录（CP1 遗留，未分组）
}

// 学员端六维能力卡（当前 vs 上一次 published）
export interface AbilityCardDim {
  dimension: AbilityDimension;
  currentLevel: AbilityLevel | null;
  previousLevel: AbilityLevel | null;
  change: number | null; // 当前数值 - 上次数值（null 表示无对比基线）
  evidence: string | null;
  date: number | null; // 当前评估日期
  fromLegacy: boolean; // 当前等级取自遗留基线（无分组评估）
}

export interface StudentComparison {
  cards: AbilityCardDim[];
  legacy: AbilityAssessment[]; // 早期单项评估（CP1 遗留）
  currentGroup: AssessmentGroupSummary | null;
  previousGroup: AssessmentGroupSummary | null;
}

// —— 组 ID 生成：UUID；不可用时回退稳定随机 ID ——
function genGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** 是否覆盖全部六维（无重复由调用方保证） */
export function hasAllDimensions(dims: { dimension: AbilityDimension }[]): boolean {
  if (dims.length < ALL_DIMENSIONS.length) return false;
  const set = new Set(dims.map((d) => d.dimension));
  return ALL_DIMENSIONS.every((d) => set.has(d));
}

/** 维度是否具备可发布的事实证据（关联记录或事实说明，二者其一即可） */
export function isEvidenceComplete(d: {
  evidence_id?: string | null;
  evidence_text?: string | null;
}): boolean {
  return !!d.evidence_id || !!(d.evidence_text && d.evidence_text.trim().length > 0);
}

// 兼容读取：遗留记录无 status 字段，按 published 处理
function effStatus(r: AbilityAssessment): AssessmentStatus {
  return (r.status ?? 'published') as AssessmentStatus;
}

// ============================================================
// 写操作（整组原子）
// ============================================================

export async function createAssessmentGroup(
  db: DataLayer,
  input: CreateAssessmentGroupInput,
): Promise<string> {
  if (!input.dims.length) throw new Error('评估组至少需要一个维度');
  const seen = new Set<AbilityDimension>();
  for (const d of input.dims) {
    if (seen.has(d.dimension)) throw new Error(`同一评估组维度不可重复：${d.dimension}`);
    seen.add(d.dimension);
  }
  const groupId = genGroupId();
  const now = Date.now();
  await db.transaction(async (tx) => {
    for (const d of input.dims) {
      await tx.abilityAssessments.insert({
        student_id: input.studentId,
        dimension: d.dimension,
        level: (d.level ?? null) as AbilityLevel,
        source: d.source,
        evidence_id: d.evidence_id ?? null,
        ai_suggested_level: d.ai_suggested_level ?? null,
        teacher_confirmed_level: null,
        status: 'draft',
        evidence_text: d.evidence_text ?? null,
        assessment_group_id: groupId,
        assessed_at: now,
        created_by: input.teacherId,
      } as unknown as AbilityAssessment);
    }
  });
  return groupId;
}

export async function confirmAssessmentGroup(db: DataLayer, groupId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = (await tx.abilityAssessments.list({
      where: { assessment_group_id: groupId } as Partial<AbilityAssessment>,
    })) as AbilityAssessment[];
    if (!rows.length) throw new Error('评估组不存在');
    if (!rows.every((r) => effStatus(r) === 'draft')) {
      throw new Error('仅草稿状态的评估组可确认');
    }
    if (!hasAllDimensions(rows)) throw new Error('确认前六维必须齐全');
    if (rows.some((r) => r.level == null)) {
      throw new Error('确认前每个维度须先主动选择等级');
    }
    if (!rows.every(isEvidenceComplete)) throw new Error('确认前每个维度须具备具体事实证据');
    for (const r of rows) {
      await tx.abilityAssessments.update(r.id, { status: 'confirmed' } as Partial<AbilityAssessment>);
    }
  });
}

/**
 * 发布：仅已确认组可发布。发布成功时在同一事务内将同 student 的「其他已发布组」（旧版）整组设为 voided，
 * 实现「发布即原子替换」——新版本 published、旧版本 voided；任一步失败整体回滚，旧版不受影响。
 */
export async function publishAssessmentGroup(db: DataLayer, groupId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = (await tx.abilityAssessments.list({
      where: { assessment_group_id: groupId } as Partial<AbilityAssessment>,
    })) as AbilityAssessment[];
    if (!rows.length) throw new Error('评估组不存在');
    if (!rows.every((r) => r.status === 'confirmed')) {
      throw new Error('仅已确认状态的评估组可发布');
    }
    const studentId = rows[0].student_id;
    // 先作废同 student 的其他已发布组（旧版）
    const all = (await tx.abilityAssessments.list()) as AbilityAssessment[];
    for (const r of all) {
      if (
        r.assessment_group_id &&
        r.assessment_group_id !== groupId &&
        r.student_id === studentId &&
        r.status === 'published'
      ) {
        await tx.abilityAssessments.update(r.id, { status: 'voided' } as Partial<AbilityAssessment>);
      }
    }
    // 再发布新版
    for (const r of rows) {
      await tx.abilityAssessments.update(r.id, { status: 'published' } as Partial<AbilityAssessment>);
    }
  });
}

export async function voidAssessmentGroup(db: DataLayer, groupId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = (await tx.abilityAssessments.list({
      where: { assessment_group_id: groupId } as Partial<AbilityAssessment>,
    })) as AbilityAssessment[];
    if (!rows.length) throw new Error('评估组不存在');
    for (const r of rows) {
      await tx.abilityAssessments.update(r.id, { status: 'voided' } as Partial<AbilityAssessment>);
    }
  });
}

/**
 * 修正：已发布组不可直接修改。点击「修正」仅创建新的 draft 组（复制当前权威等级与证据），
 * 旧 published 继续有效。旧组在新版本「发布成功」时才由 publishAssessmentGroup 同事务作废。
 */
export async function reviseAssessmentGroup(db: DataLayer, groupId: string): Promise<string> {
  const newGroupId = genGroupId();
  await db.transaction(async (tx) => {
    const oldRows = (await tx.abilityAssessments.list({
      where: { assessment_group_id: groupId } as Partial<AbilityAssessment>,
    })) as AbilityAssessment[];
    if (!oldRows.length) throw new Error('评估组不存在');
    if (oldRows.some((r) => r.status !== 'published')) {
      throw new Error('仅已发布状态的评估组可修正');
    }
    const now = Date.now();
    for (const r of oldRows) {
      await tx.abilityAssessments.insert({
        student_id: r.student_id,
        dimension: r.dimension,
        // 复制当前已发布权威等级，便于教师在此基础上调整
        level: (r.teacher_confirmed_level ?? r.level) as AbilityLevel,
        source: 'teacher',
        evidence_id: r.evidence_id,
        ai_suggested_level: r.ai_suggested_level,
        teacher_confirmed_level: null,
        status: 'draft',
        evidence_text: r.evidence_text,
        assessment_group_id: newGroupId,
        assessed_at: now,
        created_by: r.created_by,
      } as unknown as AbilityAssessment);
    }
    // 注意：此处不立即作废旧组；旧组在「新版发布成功」时由 publishAssessmentGroup 同事务作废
  });
  return newGroupId;
}

// ============================================================
// 读操作
// ============================================================

function toGroupSummary(groupId: string, grp: AbilityAssessment[]): AssessmentGroupSummary {
  const dims: Partial<Record<AbilityDimension, GroupDimView>> = {};
  let createdAt = 0;
  for (const r of grp) {
    dims[r.dimension] = {
      id: r.id,
      level: r.level,
      source: r.source,
      evidence_id: r.evidence_id,
      evidence_text: r.evidence_text,
      ai_suggested_level: r.ai_suggested_level,
      teacher_confirmed_level: r.teacher_confirmed_level,
      status: r.status,
    };
    createdAt = Math.max(createdAt, r.assessed_at);
  }
  return {
    groupId,
    studentId: grp[0].student_id,
    teacherId: grp[0].created_by,
    // 同组状态一致（原子流转），取首行即可
    status: grp[0].status,
    createdAt,
    dims,
  };
}

export async function listAssessmentGroups(
  db: DataLayer,
  opts: ListGroupsOpts = {},
): Promise<AssessmentGroupSummary[]> {
  let rows = (await db.abilityAssessments.list()) as AbilityAssessment[];
  if (opts.studentId) rows = rows.filter((r) => r.student_id === opts.studentId);
  const groups = new Map<string, AbilityAssessment[]>();
  for (const r of rows) {
    if (!r.assessment_group_id) continue; // 遗留单项不在此列
    if (!opts.includeVoided && r.status === 'voided') continue;
    const arr = groups.get(r.assessment_group_id) ?? [];
    arr.push(r);
    groups.set(r.assessment_group_id, arr);
  }
  const out: AssessmentGroupSummary[] = [];
  for (const [groupId, grp] of groups) {
    out.push(toGroupSummary(groupId, grp));
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

/** 历史单项记录（CP1 遗留，未分组）；按 assessed_at 正序 */
export async function getLegacyAssessments(
  db: DataLayer,
  studentId?: string,
): Promise<AbilityAssessment[]> {
  let rows = (await db.abilityAssessments.list()) as AbilityAssessment[];
  rows = rows.filter((r) => !r.assessment_group_id);
  if (studentId) rows = rows.filter((r) => r.student_id === studentId);
  rows.sort((a, b) => a.assessed_at - b.assessed_at);
  return rows;
}

/** 学员端视图：仅本人已发布组 + 历史单项记录；绝不包含 draft/confirmed/voided 与教师内部 AI 原文 */
export async function getStudentAssessmentView(
  db: DataLayer,
  studentId: string,
): Promise<StudentAssessmentView> {
  const groups = await listAssessmentGroups(db, { studentId, includeVoided: false });
  const publishedGroups = groups.filter((g) => g.status === 'published');
  const legacy = (await getLegacyAssessments(db, studentId)).filter(
    (r) => effStatus(r) === 'published',
  );
  return { publishedGroups, legacy };
}

/**
 * 学员端六维能力卡对比：当前等级 vs 上一次 published 评估（含被本次发布替换掉的旧版）。
 * 仅取本人数据；无分组评估时回退到遗留基线（早期单项评估）。不使用其他学员数据。
 */
export async function getStudentComparison(
  db: DataLayer,
  studentId: string,
): Promise<StudentComparison> {
  const allGroups = await listAssessmentGroups(db, { studentId, includeVoided: true });
  const byTime = [...allGroups].sort((a, b) => b.createdAt - a.createdAt);
  const currentGroup = byTime.find((g) => g.status === 'published') ?? null;
  let previousGroup: AssessmentGroupSummary | null = null;
  if (currentGroup) {
    // 上一版 = 时间上早于当前的组（可能是被替换掉的 voided 旧版，或更早的 published）
    previousGroup =
      byTime.find(
        (g) => g.groupId !== currentGroup.groupId && (g.status === 'voided' || g.status === 'published'),
      ) ?? null;
  }

  const legacy = (await getLegacyAssessments(db, studentId));
  // 每维最新遗留等级（遗留按 assessed_at 正序，取最后一条）
  const legacyByDim: Partial<Record<AbilityDimension, AbilityAssessment>> = {};
  for (const r of legacy) legacyByDim[r.dimension] = r;

  const cards: AbilityCardDim[] = ALL_DIMENSIONS.map((dim) => {
    const cur = currentGroup?.dims[dim] ?? null;
    const prev = previousGroup?.dims[dim] ?? null;
    const curLevel = cur ? cur.level : (legacyByDim[dim]?.level ?? null);
    const fromLegacy = !cur && !!legacyByDim[dim];
    const prevLevel = prev ? prev.level : (legacyByDim[dim]?.level ?? null);
    const change =
      curLevel != null && prevLevel != null ? levelToNum(curLevel) - levelToNum(prevLevel) : null;
    const evidence = cur ? cur.evidence_text : (legacyByDim[dim]?.evidence_text ?? null);
    const date = cur ? currentGroup!.createdAt : (legacyByDim[dim]?.assessed_at ?? null);
    return { dimension: dim, currentLevel: curLevel, previousLevel: prevLevel, change, evidence, date, fromLegacy };
  });

  return { cards, legacy, currentGroup, previousGroup };
}
