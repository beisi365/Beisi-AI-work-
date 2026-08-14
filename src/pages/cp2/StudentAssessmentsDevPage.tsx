import { StudentAssessmentViewer } from '../../components/assessments/StudentAssessmentViewer';

// 仅开发环境可见（App.tsx 中以 import.meta.env.DEV 守卫注册）。
// 复用与正式入口完全相同的核心组件，避免两套业务逻辑。
export default function StudentAssessmentsDevPage() {
  return <StudentAssessmentViewer />;
}
