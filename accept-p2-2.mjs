import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = new URL('./screenshots-p2-2/', import.meta.url).pathname;
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

async function newPage(vw, vh) {
  const p = await browser.newPage();
  p.on('pageerror', (e) => pageErrors.push(String(e)));
  p.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await p.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  return p;
}
async function go(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await sleep(650);
}
async function prepareLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt', { timeout: 8000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt', { timeout: 8000 });
}
async function loginTeacher(page) {
  await prepareLogin(page);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.role-opt')].find((x) => x.textContent.includes('老师'));
    if (b) b.click();
  });
  await page.waitForSelector('.sidebar', { timeout: 6000 });
  await sleep(400);
}
// 刷新后 principal 丢失（仅存内存），重新登录但不清 localStorage（保留已登记数据）
async function relinkTeacher(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt', { timeout: 8000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.role-opt')].find((x) => x.textContent.includes('老师'));
    if (b) b.click();
  });
  await page.waitForSelector('.sidebar', { timeout: 6000 });
  await sleep(400);
}
// 设置 React 受控 input/textarea 的值并触发 input 事件
async function setReactValue(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    selector,
    value,
  );
}
async function clickText(page, selector, text) {
  return page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t));
      if (el) {
        el.click();
        return true;
      }
      return false;
    },
    selector,
    text,
  );
}
// 读取总览首个班级卡片的出勤率（用于同步断言）
async function classRate(page, titleSubstr) {
  return page.evaluate((sub) => {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) {
      const title = c.querySelector('.card-title')?.textContent || '';
      if (!title.includes(sub)) continue;
      for (const sp of c.querySelectorAll('.spread')) {
        const label = sp.querySelector('span')?.textContent || '';
        if (label.includes('出勤率')) return sp.querySelector('strong')?.textContent || '';
      }
    }
    return null;
  }, titleSubstr);
}
// 打开某班级首个「登记出勤」弹窗（按班级标题定位其首个按钮）
async function openRegister(page, classSubstr) {
  const ok = await page.evaluate((sub) => {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) {
      const title = c.querySelector('.card-title')?.textContent || '';
      if (!title.includes(sub)) continue;
      const b = [...c.querySelectorAll('button')].find((x) => x.textContent.includes('登记出勤'));
      if (b) {
        b.click();
        return true;
      }
    }
    return false;
  }, classSubstr);
  await sleep(500);
  await page.waitForSelector('.att-register-row', { timeout: 6000 });
  return ok;
}
async function saveModal(page) {
  await clickText(page, '.modal button', '保存考勤');
  await sleep(500);
}
async function closeModal(page) {
  await page.evaluate(() => {
    const c = document.querySelector('.modal-close');
    if (c) c.click();
  });
  await sleep(300);
}

const NOTE1 = 'P2.2备注A';
const NOTE2 = 'P2.2备注B';

// ============================================================
// 1. 总览基线：捕获首个班级出勤率（修改前后对比，验证同步）
// ============================================================
const desktop = await newPage(1440, 960);
await loginTeacher(desktop);
await go(desktop, '/t/overview');
await sleep(900);
const className = await desktop.evaluate(() => document.querySelector('.card .card-title')?.textContent || '');
check('总览存在班级卡片', !!className, `className=${className}`);
const rate0 = await classRate(desktop, className);
check('总览可读到班级出勤率', !!rate0, `rate0=${rate0}`);

// ============================================================
// 2. 进入课程与出勤：真实班级 + 真实课次
// ============================================================
await go(desktop, '/t/classes');
await sleep(900);
{
  const txt = await desktop.evaluate(() => document.body.innerText);
  const hasSection = txt.includes('课次与出勤');
  const hasRegBtn = await desktop.$$eval('button', (els) => els.some((e) => e.textContent.includes('登记出勤')));
  const hasHistBtn = await desktop.$$eval('button', (els) => els.some((e) => e.textContent.includes('查看出勤')));
  const hasPlanBtn = txt.includes('教学记录'); // 规划中占位
  check('课程与出勤页显示真实班级与课次区块', hasSection && hasRegBtn && hasHistBtn, `hasPlan=${hasPlanBtn}`);
  await desktop.screenshot({ path: OUT + 'classes-desktop.png', fullPage: true });
  console.log('  saved classes-desktop.png');
}

// ============================================================
// 3. 登记一次（首个课次：全员置缺席 + 首名学员备注）
// ============================================================
{
  const ok = await openRegister(desktop, className);
  check('从课次行打开登记出勤弹窗', ok);
  // 全员置「缺勤」
  await desktop.evaluate(() => {
    document.querySelectorAll('.att-register-row').forEach((row) => {
      const inp = row.querySelector('.att-opt--absent input');
      if (inp && !inp.checked) inp.click();
    });
  });
  await sleep(200);
  // 首名学员备注
  const firstName = await desktop.evaluate(() => document.querySelector('.att-register-row .att-register-name')?.textContent || '');
  await setReactValue(desktop, '.att-register-row .att-note-input', NOTE1);
  await sleep(150);
  await saveModal(desktop);
  check('登记出勤保存成功(弹窗关闭)', !(await desktop.$('.modal')));
  // 重新打开，验证预填（持久化/读取）
  await openRegister(desktop, className);
  const prefill = await desktop.evaluate((note) => {
    const row = document.querySelector('.att-register-row');
    const absentChecked = !!row.querySelector('.att-opt--absent input')?.checked;
    const noteVal = row.querySelector('.att-note-input')?.value || '';
    return { absentChecked, noteMatch: noteVal === note };
  }, NOTE1);
  check('登记后重新打开：状态与备注正确预填', prefill.absentChecked && prefill.noteMatch, JSON.stringify(prefill));
  await closeModal(desktop);
  // 首名学员姓名供后续学员档案校验
  globalThis.__firstName = firstName;
}

// ============================================================
// 4. 修改一次（第二个课次：首名学员置迟到 + 新备注）
// ============================================================
{
  // 找到同一班级的第二处「登记出勤」按钮（班级卡片内第二个）
  const ok = await desktop.evaluate((sub) => {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) {
      const title = c.querySelector('.card-title')?.textContent || '';
      if (!title.includes(sub)) continue;
      const btns = [...c.querySelectorAll('button')].filter((x) => x.textContent.includes('登记出勤'));
      if (btns[1]) {
        btns[1].click();
        return true;
      }
    }
    return false;
  }, className);
  await sleep(500);
  await desktop.waitForSelector('.att-register-row', { timeout: 6000 });
  check('打开第二个课次登记弹窗', ok);
  await desktop.evaluate(() => {
    const row = document.querySelector('.att-register-row');
    const inp = row.querySelector('.att-opt--late input');
    if (inp && !inp.checked) inp.click();
  });
  await sleep(150);
  await setReactValue(desktop, '.att-register-row .att-note-input', NOTE2);
  await sleep(150);
  await saveModal(desktop);
  // 重新打开验证修改
  const ok2 = await desktop.evaluate((sub) => {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) {
      const title = c.querySelector('.card-title')?.textContent || '';
      if (!title.includes(sub)) continue;
      const btns = [...c.querySelectorAll('button')].filter((x) => x.textContent.includes('登记出勤'));
      if (btns[1]) {
        btns[1].click();
        return true;
      }
    }
    return false;
  }, className);
  await sleep(500);
  await desktop.waitForSelector('.att-register-row', { timeout: 6000 });
  const mod = await desktop.evaluate((note) => {
    const row = document.querySelector('.att-register-row');
    const lateChecked = !!row.querySelector('.att-opt--late input')?.checked;
    const noteVal = row.querySelector('.att-note-input')?.value || '';
    return { lateChecked, noteMatch: noteVal === note };
  }, NOTE2);
  check('修改后重新打开：迟到状态与新备注预填', mod.lateChecked && mod.noteMatch, JSON.stringify(mod));
  await closeModal(desktop);
}

// ============================================================
// 5. 刷新后持久化（localStorage）
// ============================================================
{
  await desktop.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await relinkTeacher(desktop); // 刷新后重新登录（不清 localStorage）
  await go(desktop, '/t/classes');
  await sleep(800);
  const ok = await desktop.evaluate((sub) => {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) {
      const title = c.querySelector('.card-title')?.textContent || '';
      if (!title.includes(sub)) continue;
      const btns = [...c.querySelectorAll('button')].filter((x) => x.textContent.includes('登记出勤'));
      if (btns[1]) {
        btns[1].click();
        return true;
      }
    }
    return false;
  }, className);
  await sleep(500);
  await desktop.waitForSelector('.att-register-row', { timeout: 6000 });
  const persisted = await desktop.evaluate((note) => {
    const row = document.querySelector('.att-register-row');
    const lateChecked = !!row.querySelector('.att-opt--late input')?.checked;
    const noteVal = row.querySelector('.att-note-input')?.value || '';
    return { lateChecked, noteMatch: noteVal === note };
  }, NOTE2);
  check('刷新后数据持久化(迟到+备注仍在)', persisted.lateChecked && persisted.noteMatch, JSON.stringify(persisted));
  await closeModal(desktop);
}

// ============================================================
// 6. 班级出勤历史（查看出勤）：累计与备注可见
// ============================================================
{
  const ok = await clickText(desktop, '.card button', '本班出勤历史与累计出勤率');
  await sleep(500);
  await desktop.waitForSelector('.modal', { timeout: 6000 });
  const txt = await desktop.evaluate(() => document.body.innerText);
  check('出勤历史弹窗显示累计出勤率', txt.includes('累计出勤率'));
  check('出勤历史弹窗含登记备注', txt.includes(NOTE1) || txt.includes(NOTE2), `note1=${txt.includes(NOTE1)} note2=${txt.includes(NOTE2)}`);
  await closeModal(desktop);
}

// ============================================================
// 7. 总览同步：班级出勤率因缺勤修改而下降
// ============================================================
{
  await go(desktop, '/t/overview');
  await sleep(900);
  const rate1 = await classRate(desktop, className);
  const r0 = parseInt(String(rate0).replace('%', ''), 10);
  const r1 = parseInt(String(rate1).replace('%', ''), 10);
  check('总览同步：班级出勤率随缺勤修改下降', r1 < r0, `rate0=${rate0} rate1=${rate1}`);
}

// ============================================================
// 8. 学员档案最近出勤同步（首名学员）
// ============================================================
{
  const name = globalThis.__firstName;
  await go(desktop, '/t/students');
  await sleep(800);
  const clicked = await desktop.evaluate((nm) => {
    const tr = [...document.querySelectorAll('tr.clickable')].find((x) => x.textContent.includes(nm));
    if (tr) {
      tr.click();
      return true;
    }
    return false;
  }, name);
  await sleep(900);
  // 切到「出勤」Tab
  await clickText(desktop, '.tab, button', '出勤');
  await sleep(600);
  const txt = await desktop.evaluate(() => document.body.innerText);
  check('学员档案出勤页含登记备注(同步)', clicked && (txt.includes(NOTE1) || txt.includes(NOTE2)), `clicked=${clicked} note1=${txt.includes(NOTE1)} note2=${txt.includes(NOTE2)}`);
  await desktop.screenshot({ path: OUT + 'student-profile-attendance.png', fullPage: true });
  console.log('  saved student-profile-attendance.png');
}

// ============================================================
// 9. 移动端 390：课程与出勤可用
// ============================================================
{
  const m = await newPage(390, 844);
  await loginTeacher(m);
  await go(m, '/t/classes');
  await sleep(900);
  const hasContent = await m.evaluate(() => document.body.innerText.includes('课次与出勤'));
  const ok = await clickText(m, 'button', '登记出勤');
  await sleep(500);
  const modalShown = await m.evaluate(() => !!document.querySelector('.modal'));
  check('移动端(390)课程与出勤可用且弹窗可开', hasContent && ok && modalShown, `hasContent=${hasContent} ok=${ok} modal=${modalShown}`);
  await m.screenshot({ path: OUT + 'classes-mobile.png', fullPage: true });
  console.log('  saved classes-mobile.png');
  await m.close();
}

// ============================================================
// 10. 运行时错误汇总
// ============================================================
check('无页面运行时错误(pageerror)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('无应用级 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== P2.2 验收结果：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');
