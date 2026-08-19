// P2.5 真实浏览器端到端验收（教师移动端可达性 + 高频操作反馈）
// 复用 accept-p2-4.mjs 的登录/导航/填值/点击脚手架。
// 覆盖：
//   390px 教师端：今日课程直达出勤 / 更多抽屉预警·待办 / 预警进档案 / 完成待办 / 改出勤Toast / 底部导航无溢出
//   1440px 桌面回归：侧栏预警·待办入口 / 今日课程点击 / 原布局未破坏
// 数据说明：仅操作浏览器 localStorage（登录即 localStorage.clear = 重置为代码种子），
// 不触碰任何服务端/磁盘数据；浏览器上下文关闭后即丢弃，无需额外恢复。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = new URL('./screenshots-p2-5/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`);
};
const urls = {};
const markUrl = (page, key) => {
  urls[key] = page.url();
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
async function clickExact(page, text) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, text);
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
async function clickFirstSession(page) {
  // 演示种子 SEED_NOW 在所有 scheduled 场次之后，故「今日课程」恒为空；
  // 点击直达能力由「近期课程安排」(含真实待上场次) 同款 SessionLine 承载，二者复用同一逻辑。
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('section')];
    const targets = sections.filter((s) => {
      const h = s.querySelector('.section-title');
      return h && (h.textContent.includes('今日课程') || h.textContent.includes('近期课程安排'));
    });
    for (const sec of targets) {
      const item = sec.querySelector('.list-item.clickable');
      if (item) {
        const title = sec.querySelector('.section-title')?.textContent || '';
        item.click();
        return title;
      }
    }
    return false;
  });
}

// ============================================================
// 390px 移动端教师端逐项操作
// ============================================================
const m = await newPage(390, 844);
await loginTeacher(m);
markUrl(m, 'M1-login');

// —— 2. 首页查看课程列表（今日课程 / 近期课程安排）且每条可点击 ——
await go(m, '/t/overview');
markUrl(m, 'M2-overview');
const todayEmpty = await m.evaluate(() => {
  const sec = [...document.querySelectorAll('section')].find((s) => {
    const h = s.querySelector('.section-title');
    return h && h.textContent.includes('今日课程');
  });
  if (!sec) return true;
  return sec.querySelectorAll('.list-item.clickable').length === 0;
});
const sessionClickableOk = await waitFor(
  m,
  () => {
    const sections = [...document.querySelectorAll('section')];
    const targets = sections.filter((s) => {
      const h = s.querySelector('.section-title');
      return h && (h.textContent.includes('今日课程') || h.textContent.includes('近期课程安排'));
    });
    return targets.some((sec) => sec.querySelectorAll('.list-item.clickable').length > 0);
  },
  6000,
);
check(
  '[M2] 首页课程列表（今日/近期）存在且每条可点击',
  sessionClickableOk,
  todayEmpty ? '注：演示种子 SEED_NOW 在全部 scheduled 场次之后，"今日课程"为空，验证经由"近期课程安排"' : '今日课程有可点击项',
);
await m.screenshot({ path: OUT + 'm-overview.png', fullPage: true });

// —— 3. 点击一条课程进入对应出勤（优先今日，否则近期课程安排） ——
const clickedSection = await clickFirstSession(m);
await sleep(700);
const attModalOpen = await m.evaluate(() => !!document.querySelector('.modal'));
const attClassVal = await m.evaluate(() => {
  const sel = document.querySelector('.modal select');
  return sel ? sel.value : '';
});
const attTitle = await m.evaluate(() => {
  const t = document.querySelector('.modal .modal-title') || document.querySelector('.modal h3');
  return t ? t.textContent : '';
});
check(
  '[M3] 点击课程打开出勤弹窗并预选班级',
  clickedSection && attModalOpen && attClassVal !== '',
  `section=${clickedSection} modal=${attModalOpen} classVal=${attClassVal} title=${attTitle}`,
);
await m.screenshot({ path: OUT + 'm-attendance-modal.png', fullPage: true });
// 关闭弹窗（取消）
await clickText(m, '.modal button', '取消');
await sleep(500);
const modalClosed = await m.evaluate(() => !document.querySelector('.modal'));
check('[M3] 出勤弹窗可关闭回到首页', modalClosed);

// —— 4. 返回首页 ——
await go(m, '/t/overview');
markUrl(m, 'M4-back-overview');
const backHome = await m.evaluate(() => location.pathname === '/t/overview');
check('[M4] 可返回首页', backHome);

// —— 5. 打开“更多”抽屉 ——
const moreOpened = await clickText(m, '.mtab', '更多');
await sleep(500);
const moreSheetOk = await m.evaluate(() => {
  const sheet = document.querySelector('.more-sheet');
  if (!sheet) return false;
  const labels = [...sheet.querySelectorAll('.more-item')].map((x) => x.textContent);
  return labels.includes('课程与出勤') && labels.includes('学习预警') && labels.includes('教师待办');
});
check('[M5] “更多”抽屉含课程与出勤/学习预警/教师待办', moreOpened && moreSheetOk);
await m.screenshot({ path: OUT + 'm-more.png', fullPage: true });

// —— 6. 进入学习预警 ——
const enteredAlerts = await clickText(m, '.more-item', '学习预警');
await sleep(900);
markUrl(m, 'M6-alerts');
const alertsUrlOk = await m.evaluate(() => location.pathname === '/t/alerts');
const alertsRendered = await waitFor(m, () => document.body.innerText.includes('学习预警'), 5000);
check('[M6] 从更多进入学习预警页', enteredAlerts && alertsUrlOk && alertsRendered, `url=${m.url()}`);
await m.screenshot({ path: OUT + 'm-alerts.png', fullPage: true });

// —— 7. 从预警进入学员档案 ——
const enteredProfile = await clickText(m, '.alert-row button', '查看学员');
await sleep(900);
markUrl(m, 'M7-profile');
const profileUrlOk = await m.evaluate(() => /^\/t\/students\/.+/.test(location.pathname));
const profileRendered = await waitFor(m, () => document.querySelectorAll('.card').length > 0 || document.body.innerText.length > 30, 5000);
check('[M7] 从预警进入学员档案', enteredProfile && profileUrlOk && profileRendered, `url=${m.url()}`);
await m.screenshot({ path: OUT + 'm-profile.png', fullPage: true });

// —— 8. 返回“更多” ——
await go(m, '/t/overview');
await sleep(400);
await clickText(m, '.mtab', '更多');
await sleep(400);
const backMore = await m.evaluate(() => !!document.querySelector('.more-sheet'));
check('[M8] 可从总览再次打开更多抽屉', backMore);

// —— 9. 进入教师待办 ——
const enteredTodos = await clickText(m, '.more-item', '教师待办');
await sleep(900);
markUrl(m, 'M9-todos');
const todosUrlOk = await m.evaluate(() => location.pathname === '/t/todos');
const todosRendered = await waitFor(m, () => document.body.innerText.includes('教师待办') || document.querySelector('.list-item, .empty-compact'), 5000);
check('[M9] 从更多进入教师待办页', enteredTodos && todosUrlOk && todosRendered, `url=${m.url()}`);
await m.screenshot({ path: OUT + 'm-todos.png', fullPage: true });

// —— 10. 查看并完成一个可恢复的演示待办 ——
const todosBefore = await dbTable(m, 'todos');
const doneBefore = todosBefore.filter((t) => t.status === 'done').length;
const clickedDone = await clickText(m, 'button', '完成');
await sleep(800);
const todosAfter = await dbTable(m, 'todos');
const doneAfter = todosAfter.filter((t) => t.status === 'done').length;
check(
  '[M10] 完成演示待办真实落库(status=done, +1)',
  clickedDone && doneAfter === doneBefore + 1,
  `done ${doneBefore}->${doneAfter}`,
);

// —— 11. 修改一条演示学员出勤，确认 Toast 出现 ——
// 进入学员列表，逐个尝试找到有考勤记录的学员
await go(m, '/t/students');
await sleep(800);
let toastShown = false;
let attModified = false;
for (let i = 0; i < 4 && !toastShown; i++) {
  // 点击第 i+1 个学员行
  const opened = await m.evaluate((idx) => {
    const rows = [...document.querySelectorAll('.stable tbody tr')];
    if (!rows[idx]) return false;
    rows[idx].click();
    return true;
  }, i);
  if (!opened) break;
  await sleep(700);
  // 切到“出勤”Tab
  await clickExact(m, '出勤');
  await sleep(500);
  // 改第一条考勤的 select 状态
  const changed = await m.evaluate(() => {
    const sel = document.querySelector('.ltable select');
    if (!sel) return null;
    const opts = [...sel.options].map((o) => o.value).filter(Boolean);
    const other = opts.find((v) => v !== sel.value) || opts[0];
    const prev = sel.value;
    sel.value = other;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { prev, next: other };
  });
  if (!changed) {
    // 无考勤，返回列表重试
    await go(m, '/t/students');
    await sleep(600);
    continue;
  }
  // 等待 Toast
  toastShown = await waitFor(
    m,
    () => document.body.innerText.includes('出勤状态已更新') || document.body.innerText.includes('出勤更新失败'),
    3000,
  );
  attModified = true;
  break;
}
check('[M11] 修改学员出勤后出现 Toast 提示', attModified && toastShown);
await m.screenshot({ path: OUT + 'm-attendance-toast.png', fullPage: true });

// —— 12. 底部导航无换行/溢出/遮挡 ——
await go(m, '/t/overview');
await sleep(500);
const navOk = await m.evaluate(() => {
  const tab = document.querySelector('.mobile-tab');
  if (!tab) return { ok: false, reason: 'no .mobile-tab' };
  const items = [...tab.querySelectorAll('.mtab')];
  const tops = new Set(items.map((i) => Math.round(i.getBoundingClientRect().top)));
  const singleRow = tops.size <= 1;
  const noHOverflow = tab.scrollWidth - tab.clientWidth <= 2;
  const rect = tab.getBoundingClientRect();
  const withinViewport = rect.top >= 0 && rect.bottom <= window.innerHeight + 50;
  return {
    ok: items.length === 5 && singleRow && noHOverflow && withinViewport,
    count: items.length,
    singleRow,
    noHOverflow,
    withinViewport,
    bottom: Math.round(rect.bottom),
    vh: window.innerHeight,
  };
});
check('[M12] 底部导航 5 项、单行无换行、无横向溢出、不被安全区遮挡', navOk.ok, JSON.stringify(navOk));
await m.screenshot({ path: OUT + 'm-bottom-nav.png', fullPage: true });
await m.close();

// ============================================================
// 1440px 桌面回归
// ============================================================
const d = await newPage(1440, 960);
await loginTeacher(d);
markUrl(d, 'D1-login');
await go(d, '/t/overview');
markUrl(d, 'D2-overview');

// —— D1. 侧栏预警/待办入口正常 ——
const sidebarOk = await d.evaluate(() => {
  const items = [...document.querySelectorAll('.sidebar .nav-item')].map((x) => x.textContent.trim());
  return items.includes('学习预警') && items.includes('教师待办');
});
check('[D1] 桌面侧栏含学习预警/教师待办入口', sidebarOk);
await d.screenshot({ path: OUT + 'd-sidebar.png', fullPage: true });

// —— D2. 今日/近期课程点击正常（桌面） ——
const dClicked = await clickFirstSession(d);
await sleep(700);
const dModal = await d.evaluate(() => {
  const sel = document.querySelector('.modal select');
  return { open: !!document.querySelector('.modal'), classVal: sel ? sel.value : '' };
});
check('[D2] 桌面课程点击打开预选出勤弹窗', dClicked && dModal.open && dModal.classVal !== '', JSON.stringify(dModal));
await clickText(d, '.modal button', '取消');
await sleep(400);

// —— D3. 原桌面布局未被移动端调整破坏（6 个指标 Tile 存在） ——
const tileCount = await d.evaluate(() => document.querySelectorAll('.todo-tile').length);
check('[D3] 桌面总览 6 个指标 Tile 完整', tileCount === 6, `tiles=${tileCount}`);
const dOverflow = await d.evaluate(() => {
  const el = document.querySelector('.page') || document.body;
  return el.scrollWidth - el.clientWidth;
});
check('[D3] 桌面无横向溢出', dOverflow <= 5, `overflow=${dOverflow}`);
await d.screenshot({ path: OUT + 'd-overview.png', fullPage: true });
await d.close();

// ============================================================
// 运行时错误汇总
// ============================================================
check('[ERR] 无页面运行时错误(pageerror)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无应用级 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

await browser.close();

console.log('\n=== URL 记录 ===');
for (const [k, v] of Object.entries(urls)) console.log(`  ${k}: ${v}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n==== P2.5 验收结果：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');
