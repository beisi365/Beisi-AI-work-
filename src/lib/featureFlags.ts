// CP2 功能开关（Feature Flags）
//
// 约定：
// - 所有开关默认 false（未发布）。未完成模块不得在正式导航中显示为可用入口。
// - 每完成一个 CP2.x 阶段并通过验收后，将对应开关置为 true（或改为从运行配置读取）。
// - 数据契约：CP2 优先复用现有 21 张表；确需新增字段时，须先提交最小字段变更提案并经确认，
//   严禁把结构化状态塞入普通文本字段。

export type Cp2Module =
  | 'assessments' // CP2.1 完整能力评估与历史对比
  | 'reviews' // CP2.2 教师评审管理
  | 'communications' // CP2.3 教学沟通与跟进记录
  | 'alerts' // CP2.4 学习预警（与待办同阶段）
  | 'todos'; // CP2.4 教师待办（与预警同阶段）

export const CP2_FLAGS: Record<Cp2Module, boolean> = {
  assessments: false,
  reviews: false,
  communications: false,
  alerts: false,
  todos: false,
};

/** 判断某个 CP2 模块是否已对正式导航开放 */
export function isCp2Enabled(module: Cp2Module): boolean {
  return CP2_FLAGS[module] === true;
}
