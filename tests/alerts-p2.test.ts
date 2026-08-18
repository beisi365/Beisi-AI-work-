import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/data/repository';
import {
  ALERT_TYPE,
  confirmConcern,
  convertConcernToTodo,
  completeTodo,
  getTeacherAlertStats,
  resolveConcern,
  syncAlerts,
  type AlertActor,
} from '../src/lib/alerts';

const actor: AlertActor = { actorId: 't1', actorRole: 'teacher' };

/** 构造一条「已上场次 + 绑定作业 + 学员 pending 提交」，用于触发长期未提交预警 */
async function makeLongNoSubmissionScenario() {
  const cls = (await db.classes.list())[0];
  const lesson = (await db.lessons.list())[0];
  const doneSession = (await db.classSessions.list()).find(
    (s) => s.class_id === cls.id && s.status === 'done',
  )!;
  const enrolled = (await db.enrollments.list()).filter((e) => e.class_id === cls.id);
  const stuId = enrolled[0].student_id;
  const asg = await db.assignments.insert(
    {
      class_id: cls.id,
      lesson_id: lesson.id,
      class_session_id: doneSession.id,
      title: 'P2.4 触发作业',
      requirements: 'x',
      due_date: '2026-02-01',
      rubric: 'x',
      created_by: 'u_t1',
    },
    { actorId: 't1', actorRole: 'teacher' },
  );
  await db.submissions.insert({
    assignment_id: asg.id,
    student_id: stuId,
    status: 'pending',
    tools: '',
    prompts: '',
    public_allowed: false,
    final_version_id: null,
    ai_review_id: null,
    teacher_review_id: null,
    created_by: stuId,
  } as never);
  return { stuId };
}

/** 构造「连续缺席」场景：清空目标学员既有考勤后，写入连续 2 场 absent */
async function makeConsecutiveAbsentScenario() {
  const cls = (await db.classes.list())[0];
  const doneSessions = (await db.classSessions.list())
    .filter((s) => s.class_id === cls.id && s.status === 'done')
    .sort((a, b) => a.scheduled_start - b.scheduled_start);
  const enrolled = (await db.enrollments.list()).filter((e) => e.class_id === cls.id);
  const stuId = enrolled[0].student_id;
  // 清空该学员既有考勤，避免 seed 记录干扰连续计数
  const existing = (await db.attendance.list()).filter((a) => a.student_id === stuId);
  for (const a of existing) await db.attendance.remove(a.id);
  for (let i = 0; i < 2 && i < doneSessions.length; i++) {
    await db.attendance.insert({
      class_session_id: doneSessions[i].id,
      student_id: stuId,
      status: 'absent',
      time: doneSessions[i].actual_start as number,
      note: '',
      created_by: 'u_t1',
    } as never);
  }
  return { stuId };
}

describe('P2.4 预警与待办处置闭环', () => {
  beforeEach(async () => {
    await db.reset();
  });

  it('连续缺席能生成 concern（A）', async () => {
    await makeConsecutiveAbsentScenario();
    const created = await syncAlerts(db, actor);
    expect(created).toBeGreaterThanOrEqual(1);
    const concerns = await db.concerns.list({ where: { type: ALERT_TYPE.consecutiveAbsent } } as never);
    expect(concerns.length).toBeGreaterThanOrEqual(1);
    expect(concerns[0].status).toBe('pending');
  });

  it('长期未提交能生成 concern（B）', async () => {
    await makeLongNoSubmissionScenario();
    const created = await syncAlerts(db, actor);
    expect(created).toBeGreaterThanOrEqual(1);
    const concerns = await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never);
    expect(concerns.length).toBeGreaterThanOrEqual(1);
  });

  it('重复扫描不会重复生成（幂等去重）', async () => {
    await makeLongNoSubmissionScenario();
    const first = await syncAlerts(db, actor);
    const second = await syncAlerts(db, actor);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(second).toBe(0); // 已存在未解决 concern，不重复创建
    const concerns = await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never);
    // 同一 (student, type) 仅一条
    const sameStudent = concerns.filter((c) => c.student_id === concerns[0].student_id);
    expect(sameStudent.length).toBe(1);
  });

  it('已 resolved 后再次满足条件可以产生新的 concern', async () => {
    const { stuId } = await makeLongNoSubmissionScenario();
    await syncAlerts(db, actor);
    let concerns = await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never);
    const target = concerns.find((c) => c.student_id === stuId)!;
    await resolveConcern(db, target.id, '已补交', actor);
    // 再次扫描：该学员仍满足长期未提交（pending 仍在），且原 concern 已 resolved → 应新建
    const createdAgain = await syncAlerts(db, actor);
    expect(createdAgain).toBeGreaterThanOrEqual(1);
    concerns = await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never);
    const sameStudent = concerns.filter((c) => c.student_id === stuId);
    expect(sameStudent.length).toBe(2); // 一条 resolved + 一条新的
  });

  it('concern 确认状态真实落库', async () => {
    await makeLongNoSubmissionScenario();
    await syncAlerts(db, actor);
    const c = (await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never))[0];
    await confirmConcern(db, c.id, actor);
    const reread = await db.concerns.get(c.id);
    expect(reread?.status).toBe('confirmed');
    expect(reread?.confirmed_by).toBe('t1');
    expect(reread?.confirmed_at).toBeTruthy();
  });

  it('concern 解决状态与结果真实落库', async () => {
    await makeLongNoSubmissionScenario();
    await syncAlerts(db, actor);
    const c = (await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never))[0];
    await resolveConcern(db, c.id, '已电话沟通并补交', actor);
    const reread = await db.concerns.get(c.id);
    expect(reread?.status).toBe('resolved');
    expect(reread?.resolved_at).toBeTruthy();
    expect(reread?.result).toBe('已电话沟通并补交'); // 复用现有 result 字段
  });

  it('concern 可以手动转为 todo（不自动生成 system todo）', async () => {
    await makeLongNoSubmissionScenario();
    await syncAlerts(db, actor);
    const c = (await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never))[0];
    const sysBefore = (await db.todos.list()).filter((t) => t.owner_type === 'system').length;
    const todo = await convertConcernToTodo(db, c, '学员甲', actor);
    expect(todo.owner_type).toBe('teacher');
    expect(todo.related_student_id).toBe(c.student_id);
    expect(todo.status).toBe('todo');
    // 转换不产生新的 system todo（seed 自身可能已有 system todo，故比较前后计数）
    const sysAfter = (await db.todos.list()).filter((t) => t.owner_type === 'system').length;
    expect(sysAfter).toBe(sysBefore);
  });

  it('todo 完成真实落库（status → done）', async () => {
    const before = (await db.todos.list()).length;
    await db.todos.insert(
      {
        owner_type: 'teacher',
        owner_id: 't1',
        title: 'P2.4 测试待办',
        related_student_id: null,
        due: null,
        status: 'todo',
      },
      { actorId: 't1', actorRole: 'teacher' },
    );
    expect((await db.todos.list()).length).toBe(before + 1);
    const t = (await db.todos.list()).find((x) => x.title === 'P2.4 测试待办')!;
    await completeTodo(db, t.id, actor);
    const reread = await db.todos.get(t.id);
    expect(reread?.status).toBe('done');
  });

  it('总览需要关注数量随未解决 concern 真实变化', async () => {
    const before = await getTeacherAlertStats(db, 't1');
    await makeLongNoSubmissionScenario();
    const created = await syncAlerts(db, actor);
    const after = await getTeacherAlertStats(db, 't1');
    expect(created).toBeGreaterThanOrEqual(1);
    expect(after.openConcerns).toBe(before.openConcerns + created);
  });

  it('解决 concern 后总览需要关注数量减少', async () => {
    await makeLongNoSubmissionScenario();
    await syncAlerts(db, actor);
    const c = (await db.concerns.list({ where: { type: ALERT_TYPE.longNoSubmission } } as never))[0];
    const before = await getTeacherAlertStats(db, 't1');
    await resolveConcern(db, c.id, '已补交', actor);
    const after = await getTeacherAlertStats(db, 't1');
    expect(after.openConcerns).toBe(before.openConcerns - 1);
  });

  it('总览我的待办数量随教师待办真实变化', async () => {
    const before = await getTeacherAlertStats(db, 't1');
    await db.todos.insert(
      {
        owner_type: 'teacher',
        owner_id: 't1',
        title: 'P2.4 待办统计',
        related_student_id: null,
        due: null,
        status: 'todo',
      },
      { actorId: 't1', actorRole: 'teacher' },
    );
    const after = await getTeacherAlertStats(db, 't1');
    expect(after.myTodos).toBe(before.myTodos + 1);
  });

  it('能力偏弱能生成 concern（C）', async () => {
    const stu = (await db.students.list())[0];
    await db.abilityAssessments.insert(
      {
        student_id: stu.id,
        dimension: '提示词工程',
        level: 'L1',
        source: 'teacher',
        evidence_id: null,
        ai_suggested_level: null,
        teacher_confirmed_level: null,
        status: 'published',
        evidence_text: '入门水平',
        assessment_group_id: null,
        assessed_at: Date.now(),
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by: 'u_t1',
      } as never,
      { actorId: 't1', actorRole: 'teacher' },
    );
    const created = await syncAlerts(db, actor);
    expect(created).toBeGreaterThanOrEqual(1);
    const concerns = await db.concerns.list({ where: { type: ALERT_TYPE.weakAbility } } as never);
    expect(concerns.length).toBeGreaterThanOrEqual(1);
    expect(concerns[0].status).toBe('pending');
  });

  it('持续学习困难能生成 concern（D）', async () => {
    const stu = (await db.students.list())[0];
    for (let i = 0; i < 2; i++) {
      await db.learningRecords.insert(
        {
          student_id: stu.id,
          class_session_id: 'cs_d_test',
          submission_id: null,
          prep: '准备不足',
          exercise_completion: '60%',
          tools: '通用 AI 工具',
          key_prompts: '请生成…',
          problems: '不理解提示词',
          need_help: true,
          teacher_observation: '需跟进',
          ai_analysis_ref: null,
          next_suggestion: '继续练习',
          created_at: Date.now(),
          updated_at: Date.now(),
          created_by: 'u_t1',
        } as never,
        { actorId: 't1', actorRole: 'teacher' },
      );
    }
    const created = await syncAlerts(db, actor);
    expect(created).toBeGreaterThanOrEqual(1);
    const concerns = await db.concerns.list({ where: { type: ALERT_TYPE.persistentDifficulty } } as never);
    expect(concerns.length).toBeGreaterThanOrEqual(1);
    expect(concerns[0].status).toBe('pending');
  });
});
