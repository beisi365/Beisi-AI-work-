import type {
  AbilityDimension,
  AbilityLevel,
  AttendanceStatus,
  SubmissionStatus,
  SessionStatus,
  ConcernStatus,
  Role,
} from '../data/types';

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 学员分类（演示配比） */
export type StudentCategory = 'normal' | 'behind' | 'progress' | 'strong';

export const CATEGORY_LABEL: Record<StudentCategory, string> = {
  normal: '正常跟进',
  behind: '需重点关注',
  progress: '进步明显',
  strong: '基础较强',
};

export const CATEGORY_TONE: Record<StudentCategory, 'success' | 'danger' | 'accent' | 'neutral'> = {
  normal: 'success',
  behind: 'danger',
  progress: 'accent',
  strong: 'neutral',
};

export const ABILITY_LABEL: Record<AbilityDimension, string> = {
  basics: '基础认知',
  requirement: '需求拆解',
  prompt: '提示词',
  operation: '工具操作',
  judgement: '判断甄别',
  application: '应用落地',
};

export const ABILITY_ORDER: AbilityDimension[] = [
  'basics',
  'requirement',
  'prompt',
  'operation',
  'judgement',
  'application',
];

export const LEVEL_LABEL: Record<AbilityLevel, string> = {
  L1: '入门',
  L2: '了解',
  L3: '熟练',
  L4: '精通',
};

export function levelToNum(l: AbilityLevel): number {
  return { L1: 1, L2: 2, L3: 3, L4: 4 }[l];
}

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: '出勤',
  late: '迟到',
  leave: '请假',
  absent: '缺勤',
};

export const ATTENDANCE_TONE: Record<AttendanceStatus, 'success' | 'accent' | 'neutral' | 'danger'> = {
  present: 'success',
  late: 'accent',
  leave: 'neutral',
  absent: 'danger',
};

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  pending: '待提交',
  to_review: '待批改',
  need_revise: '需修改',
  completed: '已完成',
  excellent: '优秀作品',
};

export const SUBMISSION_TONE: Record<
  SubmissionStatus,
  'neutral' | 'accent' | 'weak' | 'danger' | 'success' | 'review'
> = {
  pending: 'neutral',
  to_review: 'review',
  need_revise: 'danger',
  completed: 'success',
  excellent: 'success',
};

/**
 * 学员端可直接设置（下拉可选）的提交状态：仅「待提交 / 待批改」。
 * - completed / excellent 由教师批改后设定，学员不得直接设置；
 * - need_revise 由学员通过「新增作品版本」重新提交，自动转为 to_review，不在下拉可选范围。
 * 该集合同时被页面（WorksPage）与断言（business-assertions.test.ts）引用，确保口径一致。
 */
export const STUDENT_SETTABLE_STATUS: SubmissionStatus[] = ['pending', 'to_review'];

/**
 * 教师对提交的评定动作（状态流转）。新增作品版本仅学员可做，教师不可。
 * - 退回 → need_revise（需修改）
 * - 完成 → completed（已完成）
 * - 评优 → excellent（优秀作品）
 * 与 STUDENT_SETTABLE_STATUS 无交集，确保「评定/批改仅教师可发起」的权限边界。
 * 该集合同时被页面（WorksPage 教师评定栏）与断言（works.test.ts）引用，确保口径一致。
 */
export const TEACHER_GRADE_ACTIONS: {
  label: string;
  to: SubmissionStatus;
  variant: 'danger' | 'primary' | 'default';
}[] = [
  { label: '退回修改', to: 'need_revise', variant: 'danger' },
  { label: '标记完成', to: 'completed', variant: 'primary' },
  { label: '设为优秀', to: 'excellent', variant: 'default' },
];

/** 教师「填写评语」按钮文案；评语只保存 teacher_reviews.teacher_text，不改变提交状态 */
export const TEACHER_COMMENT_LABEL = '填写评语';

/**
 * 教师是否可对某状态进行评定（退回 / 完成 / 评优）。
 * pending（学员尚未提交）不可被教师直接完成或评优，亦无内容可退回，故返回 false。
 * 该判定同时被页面（按钮 disabled）与断言（works.test.ts）引用，确保口径一致。
 */
export function teacherCanGrade(status: SubmissionStatus): boolean {
  return status !== 'pending';
}

export const SESSION_LABEL: Record<SessionStatus, string> = {
  scheduled: '待上课',
  ongoing: '进行中',
  done: '已上',
  canceled: '已取消',
};

export const CONCERN_LABEL: Record<ConcernStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  resolved: '已解决',
};

export const ROLE_LABEL: Record<Role, string> = {
  teacher: '教师',
  student: '学员',
};

/** 出勤率中文描述 */
export function rateText(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** 简易百分比进度文案 */
export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
