import { TeacherAssessmentComposer } from '../../components/assessments/TeacherAssessmentComposer';

// CP2.1 正式入口：教师能力评估。
// featureFlags.assessments 开启后由 AppShell 导航显示“能力评估”。
// 与开发隐藏路由复用同一核心组件，仅标题/提示不同。
export default function AssessmentsPage() {
  return <TeacherAssessmentComposer />;
}
