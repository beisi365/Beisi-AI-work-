import { TeacherAssessmentComposer } from '../../components/assessments/TeacherAssessmentComposer';

// 仅开发环境可见（App.tsx 中以 import.meta.env.DEV 守卫注册）。
// 复用与正式入口完全相同的核心组件，仅以 devMode 显示“内部开发页”提示，避免两套业务逻辑。
export default function AssessmentsDevPage() {
  return <TeacherAssessmentComposer devMode />;
}
