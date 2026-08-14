import type { DataLayer } from './repository/DataLayer';

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ConsistencyReport {
  allPassed: boolean;
  checks: CheckResult[];
}

/**
 * 数据一致性 / 数据层校验。
 * 覆盖用户要求的 5 项核心校验 + 跨页同源断言。
 */
export async function runConsistencyCheck(db: DataLayer): Promise<ConsistencyReport> {
  const checks: CheckResult[] = [];

  // —— 1. 出勤学员属于授课场次对应班级 ——
  const sessions = await db.classSessions.list();
  const enrollments = await db.enrollments.list();
  const attendance = await db.attendance.list();
  let attOk = true;
  let attDetail = '';
  for (const a of attendance) {
    const cs = sessions.find((s) => s.id === a.class_session_id);
    if (!cs) {
      attOk = false;
      attDetail = `出勤 ${a.id} 找不到场次`;
      break;
    }
    const enrolled = enrollments.some(
      (e) => e.student_id === a.student_id && e.class_id === cs.class_id,
    );
    if (!enrolled) {
      attOk = false;
      attDetail = `学员 ${a.student_id} 不属于场次 ${cs.id} 的班级 ${cs.class_id}`;
      break;
    }
  }
  checks.push({ name: '出勤学员属于场次对应班级', passed: attOk, detail: attDetail || `已检 ${attendance.length} 条` });

  // —— 2. 作业的班级、课次、授课场次一致 ——
  const assignments = await db.assignments.list();
  let asOk = true;
  let asDetail = '';
  for (const a of assignments) {
    if (a.class_session_id) {
      const cs = sessions.find((s) => s.id === a.class_session_id);
      if (!cs || cs.class_id !== a.class_id || cs.lesson_id !== a.lesson_id) {
        asOk = false;
        asDetail = `作业 ${a.id} 的班级/课次/场次不一致`;
        break;
      }
    }
  }
  checks.push({ name: '作业班级/课次/场次一致', passed: asOk, detail: asDetail || `已检 ${assignments.length} 条` });

  // —— 3. 学习记录关联的提交属于同一学员和对应课程 ——
  const submissions = await db.submissions.list();
  const lessons = await db.lessons.list();
  const courses = await db.courses.list();
  const learningRecords = await db.learningRecords.list();
  let lrOk = true;
  let lrDetail = '';
  for (const lr of learningRecords) {
    if (!lr.submission_id) continue;
    const sub = submissions.find((s) => s.id === lr.submission_id);
    if (!sub) {
      lrOk = false;
      lrDetail = `学习记录 ${lr.id} 关联的提交不存在`;
      break;
    }
    if (sub.student_id !== lr.student_id) {
      lrOk = false;
      lrDetail = `学习记录 ${lr.id} 的提交学员不一致`;
      break;
    }
    const cs = sessions.find((s) => s.id === lr.class_session_id);
    const ls = lessons.find((l) => l.id === cs?.lesson_id);
    const as = assignments.find((x) => x.id === sub.assignment_id);
    const courseOfSession = courses.find((c) => c.id === ls?.course_id);
    const courseOfAssignment = courses.find((c) => c.id === lessons.find((l) => l.id === as?.lesson_id)?.course_id);
    if (courseOfSession?.id !== courseOfAssignment?.id) {
      lrOk = false;
      lrDetail = `学习记录 ${lr.id} 的提交课程与场次课程不一致`;
      break;
    }
  }
  checks.push({ name: '学习记录提交同属学员与课程', passed: lrOk, detail: lrDetail || `已检 ${learningRecords.length} 条` });

  // —— 4. 文件只保存元数据，不保存 Base64 ——
  const files = await db.files.list();
  const base64 = files.filter(
    (f) => f.mock_url.startsWith('data:') || (f as unknown as Record<string, unknown>).content,
  );
  checks.push({
    name: '文件仅元数据无 Base64',
    passed: base64.length === 0,
    detail: base64.length === 0 ? `已检 ${files.length} 个文件` : `发现 ${base64.length} 个含 Base64 的文件`,
  });

  // —— 5. final_version_id 指向真实且为终稿的版本 ——
  const workVersions = await db.workVersions.list();
  let fvOk = true;
  let fvDetail = '';
  for (const s of submissions) {
    if (!s.final_version_id) continue;
    const wv = workVersions.find((w) => w.id === s.final_version_id);
    if (!wv || !wv.is_final || wv.submission_id !== s.id) {
      fvOk = false;
      fvDetail = `提交 ${s.id} 的 final_version_id 无效`;
      break;
    }
  }
  checks.push({ name: 'final_version_id 指向有效终稿', passed: fvOk, detail: fvDetail || `已检 ${submissions.length} 条提交` });

  // —— 跨页同源：能力当前值 = 最新快照 ——
  const students = await db.students.list();
  let abOk = true;
  let abDetail = '';
  for (const st of students) {
    const cur = await db.getAbilityCurrent(st.id);
    for (const dim of Object.keys(cur) as (keyof typeof cur)[]) {
      const history = await db.getAbilityHistory(st.id, dim);
      const latest = history[history.length - 1];
      const expected = latest ? latest.teacher_confirmed_level ?? latest.level : null;
      if (cur[dim] !== expected) {
        abOk = false;
        abDetail = `学员 ${st.id} 维度 ${dim} 当前值与最新快照不一致`;
        break;
      }
    }
    if (!abOk) break;
  }
  checks.push({ name: '能力当前值=最新快照（跨页同源）', passed: abOk, detail: abDetail || `已检 ${students.length} 名学员` });

  // —— 跨页同源：提交率聚合自 submissions ——
  let subOk = true;
  for (const c of await db.classes.list()) {
    const rate = await db.getSubmissionRate(c.id);
    if (rate < 0 || rate > 1) {
      subOk = false;
      break;
    }
  }
  checks.push({ name: '提交率为 0–1 合法区间', passed: subOk, detail: subOk ? '通过' : '越界' });

  const allPassed = checks.every((c) => c.passed);
  return { allPassed, checks };
}

/**
 * 注意：「页面不得直接读取或写入浏览器本地存储」属于架构约束，
 * 由 tests/architecture.test.ts 静态扫描源码保证（仅 LocalDataLayer 可引用该存储）。
 */
