// 教师排班 · 真实浏览器端到端验收
// 覆盖：批量生成写入 → 刷新持久化 → 批量清理（预览 + 二次确认 + 落库）→ 刷新确认
//       → 演示态(?demo=1)只读隐藏入口 → 无 pageerror / console.error
// 数据说明：仅操作浏览器 localStorage（登录即 localStorage.clear = 重置为代码种子），
// 不触碰服务端数据；浏览器上下文关闭即丢弃。
// 前置：需先起「本地数据层」preview 服务（构建时清空 Supabase 环境变量）：
//   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build
//   npx vite preview --port 4173
import fs from 'node:fs';
import { createRequire } from 'node:module';

// puppeteer-core 未安装进项目依赖（避免污染 package.json），而是装在 WorkBuddy 托管 workspace。
// ESM 的 import 不认 NODE_PATH，故用 createRequire 按路径加载；可用 PUPPETEER_CORE_PATH 覆盖。
const require = createRequire(import.meta.url);
const puppeteer = require(
  process.env.PUPPETEER_CORE_PATH ||
    '/Users/beisi-peter/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core',
);

const CHROME =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = new URL('./screenshots-schedule/', import.meta.url).pathname;
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
  // 批量清理有 window.confirm 二次确认，必须自动接受否则页面卡死
  p.on('dialog', async (d) => {
    await d.accept();
  });
  await p.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  return p;
}
async function go(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await sleep(700);
}
async function prepareLogin(page) {
  // 登录页已改版为 hero 版：无 .role-opt，容器类为 .hero-login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.hero-login', { timeout: 8000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.hero-login', { timeout: 8000 });
}
async function loginTeacher(page) {
  await prepareLogin(page);
  // 点击「王老师」卡片 → 以教师 t1 身份进入
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      x.textContent.includes('王老师'),
    );
    if (b) b.click();
  });
  await page.waitForSelector('.sidebar', { timeout: 8000 });
  await sleep(600);
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
/** 受控 React 输入：用原生 setter + input/change 事件驱动 */
async function setInputByIndex(page, type, index, value) {
  return page.evaluate(
    (t, i, v) => {
      const el = [...document.querySelectorAll(`input[type="${t}"]`)][i];
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    type,
    index,
    value,
  );
}
async function setTitle(page, value) {
  return page.evaluate((v) => {
    const el = [...document.querySelectorAll('input.input')].find((x) =>
      (x.placeholder || '').includes('AI写作第3讲'),
    );
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, value);
}
/** 从 localStorage 直接读真实落库的排班条数（不依赖 DOM 渲染） */
async function scheduleCount(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      try {
        const db = JSON.parse(raw);
        if (db && Array.isArray(db.teacher_schedules)) return db.teacher_schedules.length;
      } catch {
        /* 非 JSON 键，跳过 */
      }
    }
    return -1;
  });
}
async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

// 用一段远离种子数据（种子在「今天 ±14 天」）的日期，避免与既有排班相互干扰
const D1 = '2030-01-01';
const D2 = '2030-01-07';
const EXPECT = 7; // 2030-01-01 ~ 01-07 共 7 天，重复规律默认「每天」

const page = await newPage(1440, 900);

// —— 1. 登录并进入排班总表 ——
await loginTeacher(page);
await page.goto(`${BASE}/t/schedule`, { waitUntil: 'networkidle0' });
await sleep(700);
check('教师可进入排班总表', (await bodyText(page)).includes('教师排班表'));

const before = await scheduleCount(page);
check('可读取排班数据（种子已生成）', before > 0, `初始 ${before} 条`);
check(
  '教师可见「批量生成」入口',
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '批量生成'),
  ),
);

// —— 2. 批量生成 ——
check('打开批量弹窗', await clickExact(page, '批量生成'));
await sleep(500);
check('弹窗显示「操作模式」切换', (await bodyText(page)).includes('操作模式'));

const okStart = await setInputByIndex(page, 'date', 0, D1);
const okEnd = await setInputByIndex(page, 'date', 1, D2);
const okTitle = await setTitle(page, 'E2E 验收排课');
check('填入起止日期与标题', okStart && okEnd && okTitle, `start=${okStart} end=${okEnd} title=${okTitle}`);
await sleep(200);

await clickExact(page, '一键生成');
await sleep(2500);
const afterGen = await scheduleCount(page);
const genMsg = (await bodyText(page)).match(/批量生成完成：([^。]+)/);
check(
  `批量生成写入 ${EXPECT} 条`,
  afterGen === before + EXPECT,
  `${before} → ${afterGen}（${genMsg ? genMsg[1] : '无汇总文案'}）`,
);

// —— 3. 刷新持久化 ——
await page.reload({ waitUntil: 'networkidle0' });
await sleep(900);
const afterReload = await scheduleCount(page);
check('刷新后生成结果仍持久化', afterReload === afterGen, `${afterReload} 条`);

// —— 4. 批量清理：预览 ——
await page.goto(`${BASE}/t/schedule`, { waitUntil: 'networkidle0' });
await sleep(700);
await clickExact(page, '批量生成');
await sleep(500);
check('切换到「批量清理（删除）」模式', await clickText(page, 'span', '批量清理（删除）'));
await sleep(400);
await setInputByIndex(page, 'date', 0, D1);
await setInputByIndex(page, 'date', 1, D2);
await sleep(500);
const preview = (await bodyText(page)).match(/将删除 (\d+) 条排班/);
check(
  '清理模式显示命中预览且数量正确',
  !!preview && Number(preview[1]) === EXPECT,
  preview ? preview[0] : '未找到预览文案',
);
check(
  '清理模式隐藏生成专属字段（标题/冲突策略）',
  !(await bodyText(page)).includes('当天已有排班时') && (await setTitle(page, 'x')) === false,
);

// —— 5. 批量清理：执行 ——
await clickExact(page, '确认删除');
await sleep(2500);
const afterClear = await scheduleCount(page);
check(`批量清理删除 ${EXPECT} 条`, afterClear === before, `${afterGen} → ${afterClear}`);

await page.reload({ waitUntil: 'networkidle0' });
await sleep(900);
const afterClearReload = await scheduleCount(page);
check('刷新后删除结果仍持久化', afterClearReload === before, `${afterClearReload} 条`);

// —— 6. 演示态只读 ——
await page.goto(`${BASE}/t/schedule?demo=1`, { waitUntil: 'networkidle0' });
await sleep(1000);
const demoText = await bodyText(page);
check(
  '演示态隐藏「批量生成」入口',
  !(await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '批量生成'),
  )),
);
check('演示态隐藏「+ 新增排班」入口', !demoText.includes('+ 新增排班'));
check('演示态给出只读提示', demoText.includes('演示'));

// —— 7. 移动端可达 ——
const mp = await newPage(390, 844);
await loginTeacher(mp);
await mp.goto(`${BASE}/t/schedule`, { waitUntil: 'networkidle0' });
await sleep(800);
const overflow = await mp.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check('390px 移动端无横向溢出', overflow <= 1, `overflow=${overflow}px`);
await mp.screenshot({ path: `${OUT}schedule-390.png`, fullPage: false });

// —— 8. 无错误 ——
check('无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
const realConsoleErrors = consoleErrors.filter((t) => !/favicon|404/i.test(t));
check('无 console.error', realConsoleErrors.length === 0, realConsoleErrors.slice(0, 2).join(' | '));

await page.screenshot({ path: `${OUT}schedule-desktop.png`, fullPage: false });
await browser.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n===== 排班端到端验收：${passed}/${results.length} 通过 =====`);
if (passed !== results.length) {
  console.log('失败项：');
  results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name} :: ${r.extra}`));
  process.exit(1);
}
