// P2.4 浏览器端到端验收（预警与待办处置闭环）
// 复用 accept-p2-3.mjs 的登录/导航/填值/点击脚手架。
// 覆盖：自动扫描生成、刷新幂等、确认/解决/转待办/完成真实落库、
//       总览「需要关注」「我的待办」联动、390px 移动端、无运行时错误。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = new URL('./screenshots-p2-4/', import.meta.url).pathname;
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

// —— P2.4 专用断言辅助 ——
async function readTile(page, keyword) {
  return page.evaluate((kw) => {
    const tiles = [...document.querySelectorAll('.todo-tile')];
    const t = tiles.find((x) => x.textContent.includes(kw));
    if (!t) return null;
    const m = (t.textContent || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }, keyword);
}
async function sectionCount(page, label) {
  return page.evaluate((lb) => {
    const sections = [...document.querySelectorAll('section')];
    const sec = sections.find((s) => {
      const h = s.querySelector('.section-title');
      return h && h.textContent.includes(lb);
    });
    if (!sec) return -1;
    return sec.querySelectorAll('.alert-row').length;
  }, label);
}
async function dbTable(page, table) {
  return page.evaluate((t) => {
    const raw = JSON.parse(localStorage.getItem('aiwb_db_v1') || '{}');
    return raw[t] || [];
  }, table);
}
async function waitFor(page, fn, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(200);
  }
  return false;
}

// ============================================================
// 1. P1 验收起点：直进 /t/overview（不先访问 /t/alerts）自动幂等预扫描
// ============================================================
const desktop = await newPage(1440, 960);
await loginTeacher(desktop); // localStorage 清空 = reset seed，初始 0 条 concern
await go(desktop, '/t/overview');
// 总览挂载即触发 syncAlerts；等待扫描产出未解决 concern（最长 9s）
const overviewScanned = await waitFor(
  desktop,
  () => {
    const raw = JSON.parse(localStorage.getItem('aiwb_db_v1') || '{}');
    return (raw.concerns || []).some((c) => c.status !== 'resolved');
  },
  9000,
);
await sleep(400);
const beforeAlerts = await readTile(desktop, '需要关注');
const beforeTodos = await readTile(desktop, '我的待办');
const dbConcernsOverview = await dbTable(desktop, 'concerns');
const dbUnresolvedOverview = dbConcernsOverview.filter((c) => c.status !== 'resolved').length;
check('总览可读到「需要关注」「我的待办」Tile', beforeAlerts !== null && beforeTodos !== null, `alerts=${beforeAlerts} todos=${beforeTodos}`);
check(
  'P1: 直进总览不访问 alerts 即自动扫描出预警(从0变真实值)',
  overviewScanned && beforeAlerts > 0,
  `tile=${beforeAlerts} dbUnresolved=${dbUnresolvedOverview}`,
);
check(
  'P1: 总览「需要关注」= 未解决 concern 数',
  beforeAlerts === dbUnresolvedOverview,
  `tile=${beforeAlerts} db=${dbUnresolvedOverview}`,
);
await desktop.screenshot({ path: OUT + 'overview.png', fullPage: true });
// 留存总览预扫描后 concern 总数，供后续幂等校验
const dbCountAfterOverviewScan = dbConcernsOverview.length;

// ============================================================
// 2. 进入 /t/alerts 自动扫描 → 预警出现
// ============================================================
await go(desktop, '/t/alerts');
const scanned = await waitFor(desktop, () => document.querySelectorAll('.alert-row').length > 0, 6000);
const headerOk = await desktop.evaluate(() => document.body.innerText.includes('学习预警'));
const pendingCount = await sectionCount(desktop, '待确认');
check('进入 /t/alerts 自动扫描生成预警(pending>0)', headerOk && scanned && pendingCount > 0, `header=${headerOk} pending=${pendingCount}`);
const bodyText = await desktop.evaluate(() => document.body.innerText);
const hasLong = bodyText.includes('长期未提交');
const hasWeak = bodyText.includes('能力偏弱');
const hasPersist = bodyText.includes('持续学习困难');
const hasAbsent = bodyText.includes('连续缺席');
check('预警含「长期未提交」类型', hasLong);
check('预警含「能力偏弱」或「持续学习困难」类型', hasWeak || hasPersist, `weak=${hasWeak} persist=${hasPersist}`);
if (hasAbsent) {
  check('预警含「连续缺席」类型', true);
} else {
  console.log('NOTE  seed 演示数据未触发连续缺席；该类生成逻辑已由单元测试 alerts-p2 覆盖「连续缺席能生成 concern」');
}
// db 层确认扫描写入了 concern
const dbConcernsAfterScan = await dbTable(desktop, 'concerns');
const typeDist = {};
for (const c of dbConcernsAfterScan) typeDist[c.type] = (typeDist[c.type] || 0) + 1;
console.log('  [scan diag] concerns 类型分布 =', JSON.stringify(typeDist), '总数=', dbConcernsAfterScan.length);
// P1 幂等：走访 /t/alerts 时其自身也会扫描，但已存在的未解决 concern 应被跳过（不重复）
check(
  'P1: 走访 /t/alerts 不重复生成 concern(幂等)',
  dbConcernsAfterScan.length === dbCountAfterOverviewScan,
  `overviewScan=${dbCountAfterOverviewScan} alertsScan=${dbConcernsAfterScan.length}`,
);
await desktop.screenshot({ path: OUT + 'alerts.png', fullPage: true });

// ============================================================
// 3. 刷新预警 → 幂等（不重复生成）
// ============================================================
const beforeRefreshPending = await sectionCount(desktop, '待确认');
const beforeRefreshAll = dbConcernsAfterScan.length;
const refreshed = await clickText(desktop, 'button', '刷新预警');
await sleep(900);
const afterRefreshPending = await sectionCount(desktop, '待确认');
const afterRefreshAll = (await dbTable(desktop, 'concerns')).length;
check(
  '刷新预警幂等：未重复生成 concern',
  refreshed && afterRefreshPending === beforeRefreshPending && afterRefreshAll === beforeRefreshAll,
  `pending ${beforeRefreshPending}->${afterRefreshPending} all ${beforeRefreshAll}->${afterRefreshAll}`,
);

// ============================================================
// 4. 确认 concern → 落库（status=confirmed，进入「已确认」区）
// ============================================================
const pendingBeforeConfirm = await sectionCount(desktop, '待确认');
const clickedConfirm = await clickText(desktop, '.alert-row button', '确认');
await sleep(800);
const pendingAfterConfirm = await sectionCount(desktop, '待确认');
const confirmedCount = await sectionCount(desktop, '已确认');
const dbConfirmed = (await dbTable(desktop, 'concerns')).filter((c) => c.status === 'confirmed');
check(
  '确认 concern 落库(进入已确认区且 pending-1)',
  clickedConfirm && confirmedCount >= 1 && pendingAfterConfirm === pendingBeforeConfirm - 1,
  `pending ${pendingBeforeConfirm}->${pendingAfterConfirm} confirmed=${confirmedCount}`,
);
check('确认真实落库(concerns.status=confirmed)', dbConfirmed.length >= 1, `dbConfirmed=${dbConfirmed.length}`);

// ============================================================
// 5. 解决 concern → 落库(result 字段) + 刷新持久化
// ============================================================
const clickedResolve = await clickText(desktop, '.alert-row button', '解决');
await sleep(500);
const modalOpen = await desktop.evaluate(() => !!document.querySelector('.modal'));
await setReactValue(desktop, '.modal textarea', '已电话沟通，学员承诺本周补交');
await sleep(150);
const clickedResolveOk = await clickText(desktop, '.modal button', '确认解决');
await sleep(800);
const resolvedCount = await sectionCount(desktop, '已解决');
const dbResolved = (await dbTable(desktop, 'concerns')).filter((c) => c.status === 'resolved');
const resolvedHasResult = await desktop.evaluate(() => document.body.innerText.includes('处理结果：'));
check(
  '解决 concern 落库(进入已解决区)',
  clickedResolve && modalOpen && clickedResolveOk && resolvedCount >= 1 && dbResolved.length >= 1,
  `modal=${modalOpen} resolved=${resolvedCount} dbResolved=${dbResolved.length}`,
);
check('解决备注写入 result 字段并显示', resolvedHasResult);
// 持久化：reload + relink 后仍为已解决
await desktop.reload({ waitUntil: 'networkidle0' });
await sleep(500);
await relinkTeacher(desktop);
await go(desktop, '/t/alerts');
await sleep(1500);
const resolvedAfterReload = await sectionCount(desktop, '已解决');
check('解决后刷新持久化(仍为已解决)', resolvedAfterReload >= 1, `resolved=${resolvedAfterReload}`);

// ============================================================
// 6. 转为待办 → todos 新增(teacher)且 system 不增；Todos 页可见
// ============================================================
const dbTodosBefore = await dbTable(desktop, 'todos');
const sysBefore = dbTodosBefore.filter((t) => t.owner_type === 'system').length;
const teacherBefore = dbTodosBefore.filter((t) => t.owner_type === 'teacher').length;
const clickedConvert = await clickText(desktop, '.alert-row button', '转为待办');
await sleep(800);
const dbTodosAfter = await dbTable(desktop, 'todos');
const sysAfter = dbTodosAfter.filter((t) => t.owner_type === 'system').length;
const teacherAfter = dbTodosAfter.filter((t) => t.owner_type === 'teacher').length;
check(
  '转为待办：新增 teacher todo 且 system todo 不增',
  clickedConvert && teacherAfter === teacherBefore + 1 && sysAfter === sysBefore,
  `teacher ${teacherBefore}->${teacherAfter} sys ${sysBefore}->${sysAfter}`,
);
await go(desktop, '/t/todos');
await sleep(900);
const todosHasConverted = await desktop.evaluate(() => document.body.innerText.includes('关注['));
check('Todos 页显示转换来的待办', todosHasConverted);
await desktop.screenshot({ path: OUT + 'todos.png', fullPage: true });

// ============================================================
// 7. 总览联动：需要关注 = 当前未解决 concern 数；我的待办 +1（转待办后）
// ============================================================
const dbConcernsNow = await dbTable(desktop, 'concerns');
const statusDist = {};
for (const c of dbConcernsNow) statusDist[c.status] = (statusDist[c.status] || 0) + 1;
const unresolvedNow = dbConcernsNow.filter((c) => c.status !== 'resolved').length;
console.log('  [overview diag] concerns 状态分布 =', JSON.stringify(statusDist), '未解决=', unresolvedNow);
await go(desktop, '/t/overview');
await sleep(900);
const afterAlertsTile = await readTile(desktop, '需要关注');
const afterTodosTile = await readTile(desktop, '我的待办');
check('总览「需要关注」= 未解决 concern 数', afterAlertsTile === unresolvedNow, `tile=${afterAlertsTile} unresolved=${unresolvedNow}`);
check('总览「我的待办」因转待办 +1', afterTodosTile === beforeTodos + 1, `before=${beforeTodos} after=${afterTodosTile}`);

// ============================================================
// 8. 完成待办 → 落库(status=done)；总览「我的待办」-1
// ============================================================
await go(desktop, '/t/todos');
await sleep(900);
const teacherOpenBefore = (await dbTable(desktop, 'todos')).filter((t) => t.owner_type === 'teacher' && t.status !== 'done').length;
const clickedDone = await clickText(desktop, 'button', '完成');
await sleep(800);
const teacherOpenAfter = (await dbTable(desktop, 'todos')).filter((t) => t.owner_type === 'teacher' && t.status !== 'done').length;
const doneInDb = (await dbTable(desktop, 'todos')).filter((t) => t.status === 'done').length;
check(
  '完成待办落库(status=done)',
  clickedDone && teacherOpenAfter === teacherOpenBefore - 1 && doneInDb >= 1,
  `open ${teacherOpenBefore}->${teacherOpenAfter} done=${doneInDb}`,
);
await go(desktop, '/t/overview');
await sleep(900);
const todosTileFinal = await readTile(desktop, '我的待办');
check('完成待办后总览「我的待办」-1', todosTileFinal === beforeTodos, `final=${todosTileFinal} base=${beforeTodos}`);

// ============================================================
// 8b. P1 step 9：刷新 /t/overview 后「需要关注」仍与 DB 未解决一致
// ============================================================
await desktop.reload({ waitUntil: 'networkidle0' });
await sleep(400);
await relinkTeacher(desktop);
await go(desktop, '/t/overview');
await sleep(1000);
const finalOvTile = await readTile(desktop, '需要关注');
const finalDbUnresolved = (await dbTable(desktop, 'concerns')).filter((c) => c.status !== 'resolved').length;
check('P1: 刷新总览后「需要关注」仍与 DB 未解决一致', finalOvTile === finalDbUnresolved, `tile=${finalOvTile} db=${finalDbUnresolved}`);

// ============================================================
// 9. 移动端 390：预警页渲染且不溢出
// ============================================================
{
  const m = await newPage(390, 844);
  await loginTeacher(m);
  await go(m, '/t/alerts');
  const mScanned = await waitFor(m, () => document.querySelectorAll('.alert-row').length > 0, 6000);
  const overflow = await m.evaluate(() => {
    const el = document.querySelector('.page') || document.body;
    return el.scrollWidth - el.clientWidth;
  });
  check('移动端(390)预警页渲染且不溢出', mScanned && overflow <= 5, `rows=${mScanned} overflow=${overflow}`);
  await m.screenshot({ path: OUT + 'alerts-mobile.png', fullPage: true });
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
console.log(`\n==== P2.4 验收结果：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');
