import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = new URL('./screenshots-p2-3/', import.meta.url).pathname;
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
// 刷新后 principal 丢失（仅存内存），重新登录但不清 localStorage（保留已登记/已建数据）
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
async function clickFirst(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, selector);
}
async function pendingGradingNum(page) {
  return page.evaluate(() => {
    const t = [...document.querySelectorAll('.todo-tile')].find((x) => x.textContent.includes('待批作业'));
    if (!t) return null;
    const m = (t.textContent || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  });
}
// 验证 WorksPage 当前筛选是否与 URL 参数一致（status / student）
async function worksFilter(page) {
  return page.evaluate(() => {
    const url = new URL(location.href);
    const st = url.searchParams.get('status');
    const student = url.searchParams.get('student');
    const selects = [...document.querySelectorAll('select')];
    const statusMatch = st ? selects.some((s) => s.value === st) : true;
    const studentMatch = student ? selects.some((s) => s.value === student) : true;
    return { url: location.href, st, student, statusMatch, studentMatch };
  });
}
// 展开表格第 i 行（tr.clickable）
async function clickRow(page, i) {
  return page.evaluate((idx) => {
    const rows = [...document.querySelectorAll('tr.clickable')];
    if (rows[idx]) {
      rows[idx].click();
      return true;
    }
    return false;
  }, i);
}

const NEW_TITLE = 'P2.3新建作业标题';
const NEW_TITLE2 = 'P2.3编辑后标题';
const NEW_REQ = 'P2.3作业要求说明';
const REVIEW_TEXT = 'P2.3教师评语';

// ============================================================
// 1. 登录 + 总览基线
// ============================================================
const desktop = await newPage(1440, 960);
await loginTeacher(desktop);
await go(desktop, '/t/overview');
await sleep(900);
const hasOverview = await desktop.evaluate(() => document.body.innerText.includes('长期未提交作品学员'));
check('总览页加载且含长期未提交作品区块', hasOverview);
const r0 = await pendingGradingNum(desktop);
check('总览可读到待批作业数量', r0 !== null, `pendingGrading=${r0}`);
await desktop.screenshot({ path: OUT + 'overview.png', fullPage: true });

// ============================================================
// 2. A. 总览点击「待批作业」→ /t/works 自动 to_review 筛选
// ============================================================
{
  const clicked = await clickText(desktop, '.todo-tile', '待批作业');
  await sleep(900);
  const f = await worksFilter(desktop);
  const ok = clicked && f.url.includes('status=to_review') && f.statusMatch;
  check('A. 待批作业点击进入 /t/works 并自动 to_review 筛选', ok, JSON.stringify(f));
  await desktop.screenshot({ path: OUT + 'works-to_review.png', fullPage: true });
}

// ============================================================
// 3. B. 总览点击「长期未提交作品」学员 → /t/works 自动 student/pending 筛选
// ============================================================
{
  await go(desktop, '/t/overview');
  await sleep(900);
  const clicked = await clickText(desktop, '.list-item.clickable', '份作业待提交');
  await sleep(900);
  const f = await worksFilter(desktop);
  const ok = clicked && f.url.includes('status=pending') && f.student && f.statusMatch && f.studentMatch;
  check('B. 长期未提交作品点击进入 /t/works 并自动 student/pending 筛选', ok, JSON.stringify(f));
}

// ============================================================
// 4. C. 新建作业
// ============================================================
{
  await go(desktop, '/t/works');
  await sleep(900);
  const openOk = await clickText(desktop, 'button', '新建作业');
  await sleep(500);
  await desktop.waitForSelector('.modal', { timeout: 6000 });
  // 班级/课节使用默认（已预填），填标题/要求/截止
  await setReactValue(desktop, '.modal .input', NEW_TITLE);
  await setReactValue(desktop, '.modal textarea', NEW_REQ);
  await setReactValue(desktop, '.modal input[type="date"]', '2026-03-01');
  await sleep(200);
  await clickText(desktop, '.modal button', '保存作业');
  await sleep(600);
  const closed = !(await desktop.$('.modal'));
  const listed = await desktop.evaluate((t) => document.body.innerText.includes(t), NEW_TITLE);
  check('C. 新建作业保存成功且列表出现', closed && listed, `closed=${closed} listed=${listed}`);
}

// ============================================================
// 5. D. 刷新后新建作业仍存在
// ============================================================
{
  await desktop.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await relinkTeacher(desktop);
  await go(desktop, '/t/works');
  await sleep(900);
  const persisted = await desktop.evaluate((t) => document.body.innerText.includes(t), NEW_TITLE);
  check('D. 刷新后新建作业仍存在(持久化)', persisted);
}

// ============================================================
// 6. E. 编辑作业（从作业目录）
// ============================================================
{
  await go(desktop, '/t/works');
  await sleep(900);
  const openEdit = await clickText(desktop, 'button', '编辑');
  await sleep(500);
  await desktop.waitForSelector('.modal', { timeout: 6000 });
  const prefillTitle = await desktop.evaluate(() => document.querySelector('.modal .input')?.value || '');
  await setReactValue(desktop, '.modal .input', NEW_TITLE2);
  await sleep(150);
  await clickText(desktop, '.modal button', '保存作业');
  await sleep(800);
  const closed = !(await desktop.$('.modal'));
  const dbState = await desktop.evaluate((pt) => {
    const raw = JSON.parse(localStorage.getItem('aiwb_db_v1') || '{}');
    const asgs = raw.assignments || [];
    return {
      hasNew: asgs.some((a) => a.title === 'P2.3编辑后标题'),
      hasOld: asgs.some((a) => a.title === pt),
      count: asgs.length,
      firstTitles: asgs.slice(0, 4).map((a) => a.title),
    };
  }, prefillTitle);
  console.log('  [E diag]', JSON.stringify(dbState), 'prefill=', prefillTitle);
  const firstDirTitle = await desktop.evaluate(() => {
    const row = document.querySelector('.assignment-dir-row');
    return row ? row.querySelector('strong')?.textContent || '' : '';
  });
  const updated = dbState.hasNew;
  // 作业目录首条即被编辑的 assignment；seed 中同 lesson 跨班级会产生同标题记录，
  // 故以「首条标题已从旧变新」精确锁定被编辑条目，而非全局旧标题消失。
  const oldGone = firstDirTitle === NEW_TITLE2 && firstDirTitle !== prefillTitle;
  check(
    'E. 编辑作业：预填正确且标题更新、旧标题消失、无重复记录',
    openEdit && !!prefillTitle && closed && updated && oldGone && dbState.count === 25,
    `prefill=${prefillTitle} firstDir=${firstDirTitle} updated=${updated} oldGone=${oldGone} count=${dbState.count}`,
  );
  // 刷新验证编辑持久化
  await desktop.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await relinkTeacher(desktop);
  await go(desktop, '/t/works');
  await sleep(900);
  const persistedEdit = await desktop.evaluate((t) => document.body.innerText.includes(t), NEW_TITLE2);
  check('E. 编辑后刷新仍正确(持久化)', persistedEdit);
}

// ============================================================
// 7. F. 打开待批作品 → 结构化标签 + 文字评语 → 保存 → 刷新后仍存在
// ============================================================
{
  await go(desktop, '/t/works?status=to_review');
  await sleep(900);
  await clickRow(desktop, 0);
  await sleep(500);
  const openComment = await clickText(desktop, 'button', '填写评语');
  await sleep(400);
  // 选择若干结构化标签
  await clickText(desktop, '.tag-chip', '达标');
  await clickText(desktop, '.tag-chip', '结构清晰');
  await clickText(desktop, '.tag-chip', '深化主题');
  await sleep(150);
  await setReactValue(desktop, '.grade-actions textarea', REVIEW_TEXT);
  await sleep(150);
  await clickText(desktop, '.grade-actions button', '保存评语');
  await sleep(600);
  const saved = await desktop.evaluate(
    (t) => document.body.innerText.includes(t) && document.body.innerText.includes('达标'),
    REVIEW_TEXT,
  );
  check('F. 结构化标签 + 文字评语保存成功', openComment && saved, `openComment=${openComment} saved=${saved}`);
  // 刷新后仍在
  await desktop.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await relinkTeacher(desktop);
  await go(desktop, '/t/works?status=to_review');
  await sleep(900);
  await clickRow(desktop, 0);
  await sleep(500);
  await clickText(desktop, 'button', '填写评语');
  await sleep(400);
  const afterReload = await desktop.evaluate(
    (t) => document.body.innerText.includes(t) && document.body.innerText.includes('达标'),
    REVIEW_TEXT,
  );
  check('F. 刷新后评语与标签仍存在', afterReload);
  await desktop.screenshot({ path: OUT + 'works-review.png', fullPage: true });
}

// ============================================================
// 8. G. 标记完成 → 总览 pendingGrading 减少
// ============================================================
{
  await go(desktop, '/t/overview');
  await sleep(900);
  const before = await pendingGradingNum(desktop);
  await go(desktop, '/t/works?status=to_review');
  await sleep(900);
  await clickRow(desktop, 0);
  await sleep(500);
  const graded = await clickText(desktop, '.grade-actions button', '标记完成');
  await sleep(700);
  await go(desktop, '/t/overview');
  await sleep(900);
  const after = await pendingGradingNum(desktop);
  check('G. 标记完成后总览 pendingGrading 减少', graded && after === before - 1, `before=${before} after=${after} graded=${graded}`);
}

// ============================================================
// 9. H. 移动端 390：新建作业弹窗正常、表单不溢出、可保存/关闭
// ============================================================
{
  const m = await newPage(390, 844);
  await loginTeacher(m);
  await go(m, '/t/works');
  await sleep(900);
  const openOk = await clickText(m, 'button', '新建作业');
  await sleep(500);
  const modalShown = await m.evaluate(() => !!document.querySelector('.modal'));
  const overflow = await m.evaluate(() => {
    const modal = document.querySelector('.modal');
    if (!modal) return 999;
    const content = modal.querySelector('.modal-content') || modal;
    return content.scrollWidth - content.clientWidth;
  });
  // 填标题后保存，验证可保存（弹窗关闭）
  await setReactValue(m, '.modal .input', NEW_TITLE);
  await sleep(150);
  await clickText(m, '.modal button', '保存作业');
  await sleep(600);
  const savedClosed = !(await m.$('.modal'));
  const noOverflow = overflow <= 5;
  check('H. 移动端(390)新建作业弹窗正常/不溢出/可保存', openOk && modalShown && noOverflow && savedClosed, `open=${openOk} modal=${modalShown} overflow=${overflow} saved=${savedClosed}`);
  await m.screenshot({ path: OUT + 'works-mobile.png', fullPage: true });
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
console.log(`\n==== P2.3 验收结果：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');
