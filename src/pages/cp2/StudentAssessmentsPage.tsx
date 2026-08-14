import { StudentAssessmentViewer } from '../../components/assessments/StudentAssessmentViewer';

// CP2.1 正式入口：学员能力评估（只读）。
// featureFlags.assessments 开启后由 AppShell 导航显示“我的评估”。
// 与开发隐藏路由复用同一核心组件，避免两套业务逻辑。
export default function StudentAssessmentsPage() {
  return <StudentAssessmentViewer />;
}
