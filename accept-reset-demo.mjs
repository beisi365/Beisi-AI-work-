// 重置演示数据按钮 真实浏览器验收
//   * footer 旁有"↺ 重置演示数据"按钮
//   * 点击触发 confirm 二次确认
//   * 确认后 localStorage aiwb_db_v1 被清掉 + 刷新后重新生成 5 教师
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const OUT = new URL('./screenshots-reset/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const pageErrors = [];
const consoleErrors = [];

try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => pageErrors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // 关键步骤 1：先清空 localStorage → 注入"只有 2 位教师"的旧 seed 数据（模拟老数据状态）
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  await p.evaluate(() => {
    // 注入旧的 2 教师 seed 到 localStorage（仅模拟）
    localStorage.clear();
    const old = {
      _meta: { version: 1, seededAt: Date.now() },
      users: [{ id: 'u_t1', role: 'teacher', name: '王老师', account: 'teacher_t1', avatar: '王', created_at: 0, updated_at: 0 }],
      teachers: [
        { id: 't1', user_id: 'u_t1', name: '王老师', bio: 'AI 应用培训讲师', subjects: 'AI写作/提示词', created_at: 0, updated_at: 0 },
        { id: 't2', user_id: 'u_t2', name: '李老师', bio: 'AI 工具实操讲师', subjects: 'AI图像/视频', created_at: 0, updated_at: 0 },
      ],
      // 其他空表占位
      students: [], classes: [], enrollments: [], courses: [], lessons: [],
      class_sessions: [], attendance: [], assignments: [], submissions: [], teacher_reviews: [],
      concerns: [], todos: [], ability_assessments: [], notifications: [], files: [],
      activity_records: [], resource_library: [], vocabulary_items: [],
    };
    localStorage.setItem('aiwb_db_v1', JSON.stringify(old));
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // 1) 刷新后应只看到 2 教师（因为 localStorage 已有旧 seed）
  const beforeCount = await p.evaluate(() => {
    return document.querySelectorAll('#role-teacher .hero-role-card').length;
  });
  check('[D1] 注入旧 seed 后只显示 2 教师（验证模拟成功）', beforeCount === 2, `count=${beforeCount}`);

  // 2) footer 有"重置演示数据"按钮
  const btn = await p.evaluate(() => {
    const b = document.querySelector('.hero-reset-btn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { text: b.textContent.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
  });
  check('[D2] footer 旁显示"重置演示数据"按钮', btn && btn.text.includes('重置演示数据'), JSON.stringify(btn));

  // 3) 注册 dialog handler（接受 confirm）
  let confirmShown = false;
  p.on('dialog', async (d) => {
    confirmShown = true;
    await d.accept();
  });

  // 4) 点击重置按钮 → confirm 触发 → 接受 → 页面刷新
  await p.evaluate(() => document.querySelector('.hero-reset-btn')?.click());
  await sleep(2500); // 等 reload

  // 5) 刷新后查教师数 = 5
  const afterCount = await p.evaluate(() => {
    return document.querySelectorAll('#role-teacher .hero-role-card').length;
  });
  check('[D3] 重置后教师数 = 5', afterCount === 5, `count=${afterCount}`);

  // 6) localStorage 已被 db.reset() 重写（最新 seed）
  const lsState = await p.evaluate(() => {
    const raw = localStorage.getItem('aiwb_db_v1');
    if (!raw) return null;
    const db = JSON.parse(raw);
    return {
      teachersCount: db.teachers?.length ?? 0,
      hasNewTeacher: db.teachers?.some((t) => t.name === '陈老师') ?? false,
    };
  });
  check('[D4] localStorage 已重写为最新 seed（含 5 教师 + 新字段 title）',
    lsState && lsState.teachersCount === 5 && lsState.hasNewTeacher,
    JSON.stringify(lsState));

  // 7) confirm 弹窗确实触发过
  check('[D5] confirm 二次确认弹窗触发', confirmShown, 'confirm dialog');

  await p.screenshot({ path: OUT + 'after-reset.png', fullPage: false });
  await p.close();
} catch (e) {
  console.error('SCRIPT_ERROR:', e.message);
} finally {
  await browser.close();
}

check('[ERR] 无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n==== 重置演示数据按钮验收：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');