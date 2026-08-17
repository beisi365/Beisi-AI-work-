// ============================================================
// 报名状态集中常量 + 展示标签映射
// 禁止在业务代码 / UI 中手写裸字符串（“在读”“已转班”）。
// 复用 enrollment.status 开放字符串语义，不新增枚举字段 / 表。
// ============================================================
export const ENROLLMENT_STATUS = {
  /** 当前在读（有效报名，查询当前班级只认此状态） */
  ACTIVE: '在读',
  /** 已调离原班级（历史报名，保留不删除，禁止覆盖其 class_id） */
  TRANSFERRED: '已转班',
} as const;

/** 数据状态 → 展示文案（UI 文案与数据状态分离） */
export const ENROLLMENT_LABEL: Record<string, string> = {
  [ENROLLMENT_STATUS.ACTIVE]: '在读',
  [ENROLLMENT_STATUS.TRANSFERRED]: '已转班',
};
