import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../data/repository';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui';
import type { Principal, Student, Teacher, User } from '../data/types';
import { CATEGORY_LABEL, type StudentCategory } from '../lib/format';

interface StuView extends Student {
  user?: User;
  category: StudentCategory;
}

/** 演示用登录：仅做「教师 / 学员」角色切换，不实现真实账号认证 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<StuView[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [ts, sts, us] = await Promise.all([
        db.teachers.list(),
        db.students.list(),
        db.users.list(),
      ]);
      setTeachers(ts);
      setStudents(
        sts.map((s) => ({
          ...s,
          user: us.find((u) => u.id === s.user_id),
          category: inferCategory(s.id),
        })),
      );
    })();
  }, []);

  const enterAsTeacher = (t: Teacher) => {
    const p: Principal = {
      userId: t.user_id,
      role: 'teacher',
      teacherId: t.id,
    };
    login(p);
    navigate('/t/overview');
  };

  const enterAsStudent = (s: StuView) => {
    // 归档账号禁止登录：展示提示页，不进入系统
    if (s.archived_at) {
      setBlocked(s.nickname);
      return;
    }
    const p: Principal = {
      userId: s.user_id ?? '',
      role: 'student',
      studentId: s.id,
    };
    login(p);
    navigate('/s/home');
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        {blocked ? (
          <div className="login-head">
            <h1>AI 培训学习工作台</h1>
            <div className="alert-warn" style={{ marginTop: 16 }}>
              学员「{blocked}」的账号已归档，暂时无法登录。如需恢复访问，请联系老师。
            </div>
            <button
              type="button"
              className="btn btn--primary"
              style={{ marginTop: 16 }}
              onClick={() => setBlocked(null)}
            >
              返回登录
            </button>
          </div>
        ) : (
          <>
        <div className="login-head">
          <h1>AI 培训学习工作台</h1>
          <p>演示登录 · 选择身份进入（仅角色切换，未接入真实账号认证）</p>
        </div>

        <div className="role-block">
          <h3>以教师身份进入</h3>
          <div className="role-grid">
            {teachers.map((t) => (
              <button key={t.id} className="role-opt" onClick={() => enterAsTeacher(t)}>
                <Avatar name="师" size={36} />
                <div>
                  <div className="ro-name">{t.name}</div>
                  <div className="ro-sub">{t.subjects}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="role-block">
          <h3>以学员身份进入（示例账号）</h3>
          <div className="role-grid">
            {students.map((s) => (
              <button key={s.id} className="role-opt" onClick={() => enterAsStudent(s)}>
                <Avatar name={s.nickname} size={36} />
                <div>
                  <div className="ro-name">{s.nickname}</div>
                  <div className="ro-sub">{CATEGORY_LABEL[s.category]}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="login-note">
          提示：学员端仅能看到本人数据，看不到其他学员、教师内部备注与 AI 草稿。教师端可见全部班级与学员。
        </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 依据种子分类规则推断演示类别（与 seed.ts 配比一致：前8正常/后5需关注/再4进步/末3较强） */
function inferCategory(id: string): StudentCategory {
  const n = Number(id.replace(/\D/g, ''));
  if (n <= 8) return 'normal';
  if (n <= 13) return 'behind';
  if (n <= 17) return 'progress';
  return 'strong';
}
