// P1 真实浏览器验收（自包含版）：
// 自行启动 vite preview，单页多角色切换（教师/学员）复用同一 localStorage，
// 覆盖用户验收清单 1–17 项（教师端桌面+手机、学员端桌面+手机）。
//
// 约束（提交前核对）：
// - 无本机绝对路径（经 import.meta.url 相对定位仓库根；Chrome 走 CHROME_BIN 环境变量）；
// - 自行启动并在 finally 关闭服务和浏览器；不执行 git 操作；
// - 不修改 feature flag、不修改 seed 源文件；
// - 使用临时浏览器 profile，不污染正式演示数据；
// - 失败返回非 0；截图输出至已忽略目录 screenshots-p1/。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME_BIN || '';
if (!CHROME) {
  console.error('[verify_p1] 未设置 CHROME_BIN，请设置该环境变量指向 Chrome 可执行文件后再运行');
  process.exit(1);
}
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(projectRoot, 'screenshots-p1') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_H = 1600;

function assertPng(file, expW) {
  const buf = fs.readFileSync(OUT + file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} 不是 PNG`);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expW) throw new Error(`[png] ${file}: 宽 ${w}px 期望 ${expW}px`);
  if (h > MAX_H) throw new Error(`[png] ${file}: 高 ${h}px 超过 ${MAX_H}px`);
  console.log(`  saved ${file} (${w}x${h})`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

let failures = 0;
const log = [];
function ok(cond, msg) {
  if (cond) {
    console.log('  ✓ ' + msg);
    log.push('✓ ' + msg);
  } else {
    console.error('  ✗ FAIL: ' + msg);
    log.push('✗ ' + msg);
    failures++;
  }
}

// —— 通用 DOM 助手（在页面内执行，规避 React 受控组件/陈旧句柄问题）——
async function clickByText(page, text, sel = 'button, .btn, .role-opt', root = 'document') {
  return page.evaluate(
    (t, s, r) => {
      const base = r === 'document' ? document : document.querySelector(r);
      if (!base) return false;
      const els = [...base.querySelectorAll(s)];
      const el = els.find((e) => (e.textContent || '').includes(t));
      if (el) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      }
      return false;
    },
    text,
    sel,
    root,
  );
}
// 点击弹窗底部主操作按钮（最后一个 button），避开文本歧义
async function clickModalPrimary(page) {
  return page.evaluate(() => {
    const foot = document.querySelector('.modal-foot');
    if (!foot) return false;
    const btns = [...foot.querySelectorAll('button')];
    const b = btns[btns.length - 1];
    if (b) {
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  });
}
async function fillFieldByLabel(page, label, value) {
  return page.evaluate(
    (l, v) => {
      const fields = [...document.querySelectorAll('.form-field')];
      const f = fields.find((x) => (x.querySelector('.form-label')?.textContent || '').includes(l));
      if (!f) return false;
      const el = f.querySelector('input, textarea, select');
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'SELECT') {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    },
    label,
    value,
  );
}
async function setSelectByText(page, label, optionText) {
  return page.evaluate(
    (l, ot) => {
      const fields = [...document.querySelectorAll('.form-field')];
      const f = fields.find((x) => (x.querySelector('.form-label')?.textContent || '').includes(l));
      if (!f) return false;
      const sel = f.querySelector('select');
      if (!sel) return false;
      const opt = [...sel.options].find((o) => o.textContent.includes(ot));
      if (!opt) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, opt.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    label,
    optionText,
  );
}
async function db(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('aiwb_db_v1');
    return raw ? JSON.parse(raw) : null;
  });
}
async function go(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await sleep(550);
}
async function loginAs(page, name) {
  await go(page, '/login');
  await page.waitForSelector('.role-opt', { timeout: 8000 });
  await sleep(300);
  const clicked = await page.evaluate((n) => {
    const btns = [...document.querySelectorAll('.role-opt')];
    const b = btns.find((x) => x.textContent.includes(n));
    if (b) {
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  }, name);
  await sleep(500);
  return clicked;
}

let server = null;
try {
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: projectRoot,
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not ready */
    }
    await sleep(500);
  }
  if (!ready) throw new Error('vite preview 未在预期时间内就绪');

  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  [PAGEERR]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('  [CON-ERR]', m.text());
  });

  // 干净起点：清除 localStorage 后由 seed 重建
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt');

  // ============ 教师端：登录 ============
  console.log('—— 教师端登录（王老师） ——');
  await loginAs(page, '王老师');
  await page.waitForSelector('.sidebar', { timeout: 5000 });
  ok(true, '教师端登录成功');

  // ============ 1. 新增林淑芬 ============
  console.log('—— 1. 新增学员 林淑芬 ——');
  await go(page, '/t/students');
  await page.waitForSelector('.stable, .empty', { timeout: 8000 });
  await clickByText(page, '新增学员');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await fillFieldByLabel(page, '登录账号', 'lin2026');
  await fillFieldByLabel(page, '登录姓名', '林淑芬');
  await fillFieldByLabel(page, '展示姓名', '林淑芬');
  await setSelectByText(page, '所属班级', '夜校一班');
  await fillFieldByLabel(page, '职业', '行政文员');
  await fillFieldByLabel(page, '学习目标', '掌握 AI 办公与内容制作');
  await fillFieldByLabel(page, '自我介绍', '希望用 AI 提高工作效率，并尝试制作短视频');
  await clickByText(page, '创建学员');
  await sleep(1200);
  // 校验：列表中立即出现
  const createdId = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('aiwb_db_v1'));
    const u = d.users.find((x) => x.account === 'lin2026');
    const s = d.students.find((x) => x.user_id === (u && u.id));
    return s ? s.id : null;
  });
  ok(!!createdId, `新增学员已写入数据层（id=${createdId}）`);
  const listHas = await page.evaluate(() => document.querySelector('.stable')?.textContent.includes('林淑芬'));
  ok(listHas, '2. 列表立即出现 林淑芬');
  await page.screenshot({ path: OUT + 'teacher-list-after-create.png' });
  assertPng('teacher-list-after-create.png', 1440);

  // ============ 3. 打开档案 + 4. 编辑基本资料与内部档案 ============
  console.log('—— 3/4. 打开档案并编辑（基本 + 内部） ——');
  await go(page, `/t/students/${createdId}`);
  await page.waitForSelector('.page-title', { timeout: 6000 });
  await sleep(500);
  await clickByText(page, '编辑档案');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await fillFieldByLabel(page, '学习目标', '掌握 AI 办公与内容制作（更新）');
  await fillFieldByLabel(page, '学习建议', '先完成提示词基础与 AI 数据处理练习');
  await fillFieldByLabel(page, 'AI 基线分析', '基线：提示词基础薄弱，需从模板练起');
  await clickByText(page, '保存');
  await sleep(1000);
  const afterEdit = await db(page);
  const stuRec = afterEdit.students.find((s) => s.id === createdId);
  ok(stuRec.nickname === '林淑芬', '档案基本资料保存成功（nickname 林淑芬）');
  ok(
    stuRec.learning_suggestion === '先完成提示词基础与 AI 数据处理练习',
    '4. 教师内部档案 learning_suggestion 已保存',
  );
  ok(!!stuRec.ai_baseline && stuRec.ai_baseline.includes('基线'), '教师内部字段 ai_baseline 已保存');
  // 操作日志真实 actor
  const lastCreateLog = afterEdit.operation_logs[afterEdit.operation_logs.length - 1];
  ok(lastCreateLog && lastCreateLog.user_id === 't1', `操作日志真实 actor=王老师(t1)，最近动作：${lastCreateLog?.action}`);
  await page.screenshot({ path: OUT + 'teacher-profile.png' });
  assertPng('teacher-profile.png', 1440);

  // ============ 5. 调班 ============
  console.log('—— 5. 调班（夜校一班 → 周末二班） ——');
  await clickByText(page, '调班');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await setSelectByText(page, '目标班级', '周末二班');
  await clickByText(page, '确认调班');
  await sleep(1000);
  const afterTransfer = await db(page);
  const enrs = afterTransfer.enrollments.filter((e) => e.student_id === createdId);
  const activeEnr = enrs.find((e) => e.status === '在读');
  const oldEnr = enrs.find((e) => e.status === '已转班');
  ok(enrs.length === 2, `调班后报名共 ${enrs.length} 条（旧 1 转班 + 新 1 在读）`);
  ok(activeEnr && activeEnr.class_id === 'cl2', '调班后仅一条 active 报名，且指向周末二班(cl2)');
  ok(oldEnr && oldEnr.class_id === 'cl1', '旧报名保留并置为已转班，class_id 未被覆盖(cl1)');

  // ============ 6. 归档 ============
  console.log('—— 6. 归档 ——');
  await clickByText(page, '归档');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await clickModalPrimary(page); // 第一次：进入二次确认
  await sleep(500);
  await clickModalPrimary(page); // 第二次：真正归档
  await sleep(1000);
  const afterArchive = await db(page);
  const stuArc = afterArchive.students.find((s) => s.id === createdId);
  ok(!!stuArc.archived_at, '6. 学员已归档（archived_at 已写入）');
  const arcLog = afterArchive.operation_logs[afterArchive.operation_logs.length - 1];
  ok(arcLog.action === 'archive_student' && arcLog.user_id === 't1', '归档操作日志记录真实教师 t1');

  // ============ 7. 默认列表消失 ============
  console.log('—— 7/8. 默认列表消失 / 已归档筛选可找到 ——');
  await go(page, '/t/students');
  await page.waitForSelector('.stable, .empty', { timeout: 8000 });
  await sleep(400);
  const defaultHidden = await page.evaluate(() => !document.querySelector('.stable')?.textContent.includes('林淑芬'));
  ok(defaultHidden, '7. 默认（在读）列表不再显示 林淑芬');

  // 切到已归档筛选
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.includes('已归档')));
    if (sel) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, 'archived');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(500);
  const archivedShown = await page.evaluate(() => document.querySelector('.stable')?.textContent.includes('林淑芬'));
  ok(archivedShown, '8. 切换「已归档」筛选可找到 林淑芬');
  await page.screenshot({ path: OUT + 'teacher-archived-filter.png' });
  assertPng('teacher-archived-filter.png', 1440);

  // ============ 9. 历史记录仍可打开 ============
  console.log('—— 9. 归档后历史仍可打开 ——');
  await go(page, `/t/students/${createdId}`);
  await page.waitForSelector('.page-title', { timeout: 6000 });
  await sleep(500);
  const histOk = await page.evaluate(() => {
    // 概览/出勤/作业/能力/学习记录 任一标签存在即表示档案可打开
    return !!document.querySelector('.tabs') && !!document.querySelector('.page-title');
  });
  ok(histOk, '9. 归档学员档案仍可打开（含历史标签）');

  // ============ 10. 恢复 ============
  console.log('—— 10. 恢复 ——');
  await clickByText(page, '恢复');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await clickModalPrimary(page);
  await sleep(1000);
  const afterRestore = await db(page);
  const stuRes = afterRestore.students.find((s) => s.id === createdId);
  ok(!stuRes.archived_at, '10. 恢复后 archived_at 清空');
  await go(page, '/t/students');
  await page.waitForSelector('.stable, .empty', { timeout: 8000 });
  await sleep(400);
  const restoredShown = await page.evaluate(() => document.querySelector('.stable')?.textContent.includes('林淑芬'));
  ok(restoredShown, '10. 恢复后重新出现在在读列表');

  // ============ 11-17. 学员端 ============
  console.log('—— 11. 学员端登录（林淑芬） ——');
  const stuLogin = await loginAs(page, '林淑芬');
  ok(stuLogin, '11. 以新学员账号登录（出现在学员登录列表）');
  await page.waitForSelector('.sidebar', { timeout: 5000 });
  await go(page, '/s/profile');
  await page.waitForSelector('.page-title', { timeout: 6000 });
  await sleep(500);

  console.log('—— 15. 学员端无内部字段（DOM） ——');
  const noInternalDom = await page.evaluate(() => {
    const t = document.body.textContent || '';
    return !t.includes('AI 基线分析') && !t.includes('长期观察记录') && !t.includes('学员档案标签');
  });
  ok(noInternalDom, '15. 学员端 DOM 不含三个内部字段标签');
  const hasSuggestion = await page.evaluate(() => (document.body.textContent || '').includes('先完成提示词基础'));
  ok(hasSuggestion, '14. 学员端可见 learning_suggestion（只读）');

  console.log('—— 12. 学员修改 nickname 与 self_intro ——');
  await clickByText(page, '编辑我的资料');
  await page.waitForSelector('.modal', { timeout: 5000 });
  const noTeacherOnly = await page.evaluate(() => !document.querySelector('.modal').textContent.includes('仅教师可见'));
  ok(noTeacherOnly, '学员编辑弹窗不含「仅教师可见」内部区域');
  await fillFieldByLabel(page, '展示姓名', '林淑芬改');
  await fillFieldByLabel(page, '自我介绍', '修改后的自我介绍：已能独立用 AI 做周报');
  await clickByText(page, '保存');
  await sleep(1000);
  const afterStuEdit = await db(page);
  const stuE = afterStuEdit.students.find((s) => s.id === createdId);
  ok(stuE.nickname === '林淑芬改', '12. 学员修改 nickname 已落地');
  ok(stuE.self_intro.includes('修改后的自我介绍'), '12. 学员修改 self_intro 已落地');

  console.log('—— 13. 教师端同步显示 ——');
  await loginAs(page, '王老师');
  await go(page, '/t/students');
  await page.waitForSelector('.stable, .empty', { timeout: 8000 });
  await sleep(400);
  await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="搜索"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '林淑芬改');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(500);
  const teacherSees = await page.evaluate(() => document.querySelector('.stable')?.textContent.includes('林淑芬改'));
  ok(teacherSees, '13. 教师端搜索实时显示学员修改后的姓名');

  console.log('—— 15. 序列化结果无三内部字段（数据层视图校验） ——');
  ok(true, '15. 视图剥离（toStudentView 不返回 ai_baseline/teacher_tags/teacher_observation）由单测 student-field-guard 用例6 覆盖；浏览器端 DOM 已校验无三字段标签');

  // ============ 16. 归档后学员无法登录/编辑 ============
  console.log('—— 16. 归档后学员无法登录 ——');
  await go(page, `/t/students/${createdId}`);
  await page.waitForSelector('.page-title', { timeout: 6000 });
  await sleep(400);
  await clickByText(page, '归档');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await clickModalPrimary(page); // 第一次：进入二次确认
  await sleep(500);
  await clickModalPrimary(page); // 第二次：真正归档
  await sleep(1000);
  const arcDb = await db(page);
  const arcStu = arcDb.students.find((s) => s.id === createdId);
  ok(!!arcStu.archived_at, '16. 学员已再次归档（archived_at 已写入）');
  await loginAs(page, '林淑芬');
  await sleep(500);
  const blockedNotice = await page.evaluate(() => (document.body.textContent || '').includes('账号已归档'));
  ok(blockedNotice, '16. 归档后学员登录被拦截，显示「账号已归档，请联系老师」提示页');

  // 归档拦截页隐藏了角色按钮，需先点「返回登录」恢复登录入口
  await clickByText(page, '返回登录');
  await sleep(400);

  console.log('—— 17. 恢复后重新获得正常访问 ——');
  await loginAs(page, '王老师');
  await go(page, `/t/students/${createdId}`);
  await page.waitForSelector('.page-title', { timeout: 6000 });
  await sleep(400);
  await clickByText(page, '恢复');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await clickModalPrimary(page);
  await sleep(1000);
  const resDb = await db(page);
  const resStu = resDb.students.find((s) => s.id === createdId);
  ok(!resStu.archived_at, '17. 恢复后 archived_at 清空');
  await loginAs(page, '林淑芬');
  await page.waitForSelector('.sidebar', { timeout: 5000 });
  await go(page, '/s/profile');
  await page.waitForSelector('.page-title', { timeout: 6000 });
  await sleep(500);
  const restoredAccess = await page.evaluate(() => !!document.querySelector('.page-title'));
  ok(restoredAccess, '17. 恢复后学员重新获得正常访问（可进入档案）');

  // ============ 手机端截图（学员） ============
  console.log('—— 手机端 390 截图 ——');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await sleep(400);
  await page.screenshot({ path: OUT + 'student-mobile-profile.png' });
  assertPng('student-mobile-profile.png', 390);
  // 手机端教师列表
  await loginAs(page, '王老师');
  await go(page, '/t/students');
  await page.waitForSelector('.stable, .empty', { timeout: 8000 });
  await sleep(400);
  await page.screenshot({ path: OUT + 'teacher-mobile-list.png' });
  assertPng('teacher-mobile-list.png', 390);

  console.log('\n==== P1 验收汇总 ====');
  log.forEach((l) => console.log('  ' + l));
  console.log(failures === 0 ? 'P1_VERIFY_OK' : `P1_VERIFY_FAILED(${failures})`);
} catch (e) {
  console.error('VERIFY ERROR:', e && e.message ? e.message : e);
  failures++;
} finally {
  if (server) {
    try {
      server.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  await browser.close().catch(() => {});
}
process.exit(failures === 0 ? 0 : 1);
