// 生产构建验证：隐藏 dev 路由不可访问（含已登录态）+ 正式导航无能力评估入口
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = '/Users/beisi-peter/WorkBuddy/2026-08-13-16-35-17/ai-training-workbench/docs/cp2-plan/shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[build-verify]', ...a);
const rec = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

async function loginTo(role) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.role-opt');
  await page.evaluate((role) => {
    const blocks = [...document.querySelectorAll('.role-block')];
    const block = role === 'teacher' ? blocks[0] : blocks[1];
    block.querySelector('.role-opt').click();
  }, role);
  await page.waitForFunction(
    (role) => location.pathname === (role === 'teacher' ? '/t/overview' : '/s/home'),
    { timeout: 8000 },
    role,
  );
  await sleep(400);
}

try {
  // 1) 隐藏 dev 路由在生产构建中不可访问（未登录）
  await page.goto(`${BASE}/t/dev/assessments`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const r1 = await page.evaluate(() => ({
    path: location.pathname,
    hasTeacher: document.body.textContent.includes('能力评估 · 内部开发页')
      || document.body.textContent.includes('评估组（按时间倒序）'),
  }));
  const pass1 = !r1.hasTeacher && r1.path !== '/t/dev/assessments';
  rec.push({ name: '生产-隐藏dev路由不可访问(未登录)', pass: pass1, detail: JSON.stringify(r1) });
  log(pass1 ? 'PASS' : 'FAIL', '生产-dev路由(未登录)', JSON.stringify(r1));
  await page.screenshot({ path: `${OUT}/13_build_dev_inaccessible.png` });

  // 2) 正式导航无能力评估入口（featureFlags.assessments=false）
  await loginTo('teacher');
  await sleep(400);
  const r2 = await page.evaluate(() => {
    const nav = document.querySelector('nav, aside');
    const navText = nav ? nav.textContent : '';
    return { navHasAssess: navText.includes('能力评估') };
  });
  const pass2 = !r2.navHasAssess;
  rec.push({ name: '生产-正式导航无能力评估入口', pass: pass2, detail: JSON.stringify(r2) });
  log(pass2 ? 'PASS' : 'FAIL', '生产-导航', JSON.stringify(r2));
  await page.screenshot({ path: `${OUT}/14_build_teacher_overview_nav.png` });

  // 3) 已登录学员直接访问 /s/dev/assessments 仍不可用（不渲染学员评估页）
  await loginTo('student');
  await page.evaluate(() => {
    history.pushState({}, '', '/s/dev/assessments');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await sleep(1200);
  const r3 = await page.evaluate(() => ({
    path: location.pathname,
    hasStudentDev: document.body.textContent.includes('我的能力评估')
      || document.body.textContent.includes('能力总览（六维）'),
  }));
  const pass3 = !r3.hasStudentDev;
  rec.push({ name: '生产-已登录学员访问dev路由不可用', pass: pass3, detail: JSON.stringify(r3) });
  log(pass3 ? 'PASS' : 'FAIL', '生产-dev路由(学员已登录)', JSON.stringify(r3));
  await page.screenshot({ path: `${OUT}/15_build_student_dev_inaccessible.png` });

  // 4) 已登录教师直接访问 /t/dev/assessments 仍不可用（不渲染教师评估页）
  await loginTo('teacher');
  await page.evaluate(() => {
    history.pushState({}, '', '/t/dev/assessments');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await sleep(1200);
  const r4 = await page.evaluate(() => ({
    path: location.pathname,
    hasTeacherDev: document.body.textContent.includes('能力评估 · 内部开发页')
      || document.body.textContent.includes('评估组（按时间倒序）'),
  }));
  const pass4 = !r4.hasTeacherDev;
  rec.push({ name: '生产-已登录教师访问dev路由不可用', pass: pass4, detail: JSON.stringify(r4) });
  log(pass4 ? 'PASS' : 'FAIL', '生产-dev路由(教师已登录)', JSON.stringify(r4));
  await page.screenshot({ path: `${OUT}/16_build_teacher_dev_inaccessible.png` });
} catch (e) {
  rec.push({ name: '脚本异常', pass: false, detail: String(e) });
} finally {
  await browser.close();
}

fs.writeFileSync(`${OUT}/build_results.json`, JSON.stringify(rec, null, 2));
log('SUMMARY', `${rec.filter((r) => r.pass).length}/${rec.length} passed`);
