import { PageHeader, Card, EmptyState } from '../../components/ui';

/**
 * CP2 共享页面骨架（占位）。
 * 仅用于 CP2.0 阶段建立路由、权限守卫与页面结构；不含任何业务逻辑。
 * 各 CP2.x 阶段将用真实实现替换对应页面。
 */
export function Cp2Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <PageHeader title={title} desc={`CP2 规划模块 · 当前为骨架阶段（计划 ${phase}）`} />
      <Card title="开发状态">
        <EmptyState
          title="模块开发中"
          hint={`「${title}」尚未实现业务逻辑。当前仅建立路由、权限守卫与共享页面骨架；导航入口由功能开关隐藏，阶段验收通过后将自动揭示。`}
        />
      </Card>
    </div>
  );
}
