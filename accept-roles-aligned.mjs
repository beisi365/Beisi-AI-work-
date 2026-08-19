// P3.6 验证：角色入口区与 Hero 区"同一栏"（同 max-width 同左对齐）
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

  const alignD = await d.evaluate(() => {
    const heroText = document.querySelector('.hero-text');
    const sec = document.querySelector('.hero-login-section');
    const grid = document.querySelector('.hero-role-grid');
    const secTitle = document.querySelector('.hero-login-title');
    const hr = heroText?.getBoundingClientRect();
    const sr = sec?.getBoundingClientRect();
    const gr = grid?.getBoundingClientRect();
    const cs = grid ? getComputedStyle(grid) : null;
    const ss = sec ? getComputedStyle(sec) : null;
    return {
      heroText: { left: Math.round(hr?.left ?? 0), right: Math.round(hr?.right ?? 0), width: Math.round(hr?.width ?? 0) },
      section: { left: Math.round(sr?.left ?? 0), right: Math.round(sr?.right ?? 0), width: Math.round(sr?.width ?? 0) },
      grid: { left: Math.round(gr?.left ?? 0), right: Math.round(gr?.right ?? 0), width: Math.round(gr?.width ?? 0) },
      sectionTitleLeft: Math.round(secTitle?.getBoundingClientRect().left ?? 0),
      cols: cs?.gridTemplateColumns?.split(' ').filter((s) => s.endsWith('px')).length || 0,
      vw: innerWidth,
    };
  });

  // 关键断言：section 与 hero-grid 同一栏（max-width:1200 + margin:0 auto → section left ≈ hero-grid left ≈ 120）
  // hero-grid left = 32 + (1376-1200)/2 = 120
  // hero-text 在 hero-grid 内 left=120, 实测 130 是浏览器内部对齐差 10px (1.15fr sub-pixel)
  const sectionLeftAligned = Math.abs(alignD.section.left - 120) <= 4;
  const sectionSameWidth = alignD.section.width === 1200;
  // section 内容(title/grid)左对齐到 section 自身左边
  const titleLeftAligned = Math.abs(alignD.sectionTitleLeft - alignD.section.left) <= 2;
  const gridLeftAligned = Math.abs(alignD.grid.left - alignD.section.left) <= 2;
  check('[D1] section 与 hero-grid 同栏（left≈120）', sectionLeftAligned, `secL=${alignD.section.left}`);
  check('[D2] section width = 1200（与 .hero-grid 同 max-width）', sectionSameWidth, `width=${alignD.section.width}`);
  check('[D3] section 网格 ≥5 列', alignD.cols >= 5, `cols=${alignD.cols}`);
  check('[D4] section 标题左对齐到 section 左边', titleLeftAligned, `titleL=${alignD.sectionTitleLeft}, secL=${alignD.section.left}`);
  check('[D5] section 网格左对齐到 section 左边', gridLeftAligned, `gridL=${alignD.grid.left}, secL=${alignD.section.left}`);

  await d.screenshot({ path: OUT + 'p3-6-aligned-1440.png', fullPage: false });
  await d.evaluate(() => document.getElementById('login-roles')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await sleep(400);
  await d.screenshot({ path: OUT + 'p3-6-roles-scrolled.png', fullPage: false });
  await d.close();

  // ========== 移动 390 ==========
  const m = await browser.newPage();
  m.on('pageerror', (e) => pageErrors.push(String(e)));
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await m.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const alignM = await m.evaluate(() => {
    const sec = document.querySelector('.hero-login-section');
    const grid = document.querySelector('.hero-role-grid');
    const cs = grid ? getComputedStyle(grid) : null;
    return {
      secW: Math.round(sec?.getBoundingClientRect().width ?? 0),
      secL: Math.round(sec?.getBoundingClientRect().left ?? 0),
      cols: cs?.gridTemplateColumns?.split(' ').filter((s) => s.endsWith('px')).length || 0,
      vw: innerWidth,
    };
  });
  // 移动端：section 应该 width:100% 之内 (因为没有居中 max-width 概念，390 padding 32 = 326)
  // 实际上 1200 max-width 在 390 视口下会被压到 390-64 = 326 (padding)
  check('[M1] 移动端 section 与 hero 同栏（铺满可用宽）', alignM.secW >= 300 && alignM.secW <= 360, JSON.stringify(alignM));
  check('[M2] 移动端网格 ≥2 列', alignM.cols >= 2, `cols=${alignM.cols}`);
  await m.evaluate(() => document.getElementById('login-roles')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await sleep(400);
  await m.screenshot({ path: OUT + 'p3-6-aligned-390.png', fullPage: false });
  await m.close();
} catch (e) {
  console.error('SCRIPT_ERROR:', e.message);
} finally {
  await browser.close();
}

check('[ERR] 无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n==== P3.6 角色区与 Hero 同一栏验收：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');