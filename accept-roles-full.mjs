// P3.5 验证：登录角色入口区铺满整个版面
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const OUT = new URL('./screenshots-login-hero/', import.meta.url).pathname;
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
  // ========== 桌面 1440 ==========
  const d = await browser.newPage();
  d.on('pageerror', (e) => pageErrors.push(String(e)));
  d.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await d.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await d.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // 1) 角色入口区铺满整宽（应 ≈ 视口宽 - 内边距）
  const secD = await d.evaluate(() => {
    const sec = document.querySelector('.hero-login-section');
    const grid = document.querySelector('.hero-role-grid');
    const opt = document.querySelector('.hero-role-opt');
    const r = sec?.getBoundingClientRect();
    const gr = grid?.getBoundingClientRect();
    const or = opt?.getBoundingClientRect();
    const cs = grid ? getComputedStyle(grid) : null;
    return {
      secW: r?.width, secL: r?.left, secR: r?.right,
      gridW: gr?.width,
      cols: cs?.gridTemplateColumns?.split(' ').filter((s) => s.endsWith('px')).length || 0,
      cardW: or?.width,
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  check('[D1] 1440 视口下 .hero-login-section 铺满整宽（>1300px）',
    secD.secW >= 1300 && secD.secL <= 50,
    JSON.stringify(secD));
  check('[D2] 桌面网格 ≥5 列（卡片更紧凑铺满）',
    secD.cols >= 5,
    `cols=${secD.cols}, cardW=${secD.cardW}`);

  // 截图
  await d.screenshot({ path: OUT + 'p3-5-roles-1440.png', fullPage: false });
  // 滚到角色区再截
  await d.evaluate(() => document.getElementById('login-roles')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await sleep(400);
  await d.screenshot({ path: OUT + 'p3-5-roles-1440-scrolled.png', fullPage: false });
  await d.close();

  // ========== 移动 390 ==========
  const m = await browser.newPage();
  m.on('pageerror', (e) => pageErrors.push(String(e)));
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await m.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const secM = await m.evaluate(() => {
    const sec = document.querySelector('.hero-login-section');
    const grid = document.querySelector('.hero-role-grid');
    const cs = grid ? getComputedStyle(grid) : null;
    return {
      secW: sec?.getBoundingClientRect().width,
      cols: cs?.gridTemplateColumns?.split(' ').filter((s) => s.endsWith('px')).length || 0,
      vw: innerWidth,
    };
  });
  check('[M1] 移动 390 视口下角色区铺满整宽（>300px）',
    secM.secW >= 300,
    JSON.stringify(secM));
  check('[M2] 移动端网格 ≥2 列（手机也能看到多列）',
    secM.cols >= 2,
    `cols=${secM.cols}`);
  await m.evaluate(() => document.getElementById('login-roles')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await sleep(400);
  await m.screenshot({ path: OUT + 'p3-5-roles-390.png', fullPage: false });
  await m.close();
} catch (e) {
  console.error('SCRIPT_ERROR:', e.message);
} finally {
  await browser.close();
}

// 错误检查
check('[ERR] 无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n==== P3.5 角色区铺满整版验收：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');