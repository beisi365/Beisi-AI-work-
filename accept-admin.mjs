// 管理员「全面可修改」端到端验收
// 本地数据层（build 时已清空 Supabase 变量）→ vite preview 4173 → 本地 Chrome（puppeteer-core）
// 验证：管理员登录后能进入学员档案/作业页，看到教师级编辑入口并成功保存/评定。
import { createRequire } from 'module';
const require = createRequire('/Users/beisi-peter/.workbuddy/binaries/node/workspace/node_modules/');
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:4173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  const log = (...a) => console.log('[accept-admin]', ...a);

  // 1) 以运营管理员身份登录（本地模式角色卡）
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button.hero-role-opt')];
    const b = btns.find((x) => x.textContent.includes('运营管理员'));
    if (b) { b.click(); return true; }
    return false;
  });
  log('admin entry clicked:', clicked);
  await page.waitForFunction(() => location.pathname.startsWith('/t/'), { timeout: 10000 });
  log('after login url:', await page.url());

  // 2) 进入学员档案列表 → 点开第一个学员
  await page.goto(BASE + '/t/students', { waitUntil: 'networkidle0' });
  await sleep(800);
  const rowClicked = await page.evaluate(() => {
    const row = document.querySelector('table.stable tbody tr.clickable');
    if (row) { row.click(); return true; }
    return false;
  });
  log('student row clicked:', rowClicked);
  await page.waitForFunction(() => location.pathname.startsWith('/t/students/'), { timeout: 10000 });
  await sleep(900);

  // 3) 管理员应看到「编辑档案」教师级入口（之前 isTeacher 不含 admin 时看不到）
  const hasEdit = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '编辑档案'));
  log('ADMIN sees 编辑档案 button:', hasEdit);

  // 4) 打开档案弹窗，改昵称，保存，断言弹窗关闭（保存成功回调）
  let editOk = false;
  if (hasEdit) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '编辑档案');
      b && b.click();
    });
    await sleep(500);
    await page.evaluate(() => {
      const inp = document.querySelector('.modal input.input');
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, '管理员改名' + Date.now());
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await sleep(300);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.modal button')].find((x) => x.textContent.trim() === '保存');
      b && b.click();
    });
    await sleep(1500);
    editOk = await page.evaluate(() => !document.querySelector('.modal'));
  }
  log('ADMIN edit profile saved (modal closed):', editOk);

  // 5) 作业页：展开第一个作业，验证有「教师评定」按钮
  await page.goto(BASE + '/t/works', { waitUntil: 'networkidle0' });
  await sleep(800);
  await page.evaluate(() => {
    const b = document.querySelector('table.works-table tbody tr.clickable');
    b && b.click();
  });
  await sleep(600);
  const hasGrade = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) =>
      ['标记完成', '退回修改', '设为优秀'].includes(b.textContent.trim())));
  log('ADMIN sees grade actions on works:', hasGrade);

  // 6) 点击「标记完成」并等待写入（失败会进 console error）
  let gradeOk = false;
  if (hasGrade) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '标记完成');
      b && b.click();
    });
    await sleep(1200);
    gradeOk = true;
  }
  log('ADMIN grade action executed:', gradeOk);

  log('CONSOLE ERRORS count:', errors.length);
  errors.slice(0, 12).forEach((e) => log('  ERR:', e));

  const pass = hasEdit && editOk && hasGrade && gradeOk && errors.length === 0;
  log(pass ? 'ACCEPT_ADMIN_PASS' : 'ACCEPT_ADMIN_FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
