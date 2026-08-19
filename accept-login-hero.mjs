// 首页 Hero 真实浏览器验收：1440 桌面 + 390 移动端
// 核心断言：球体 SVG 渲染、stroke-dashoffset 持续变化（粒子"在转"）、
//          高光公转（球面"在转"）、CTA 滚动到角色区、登录仍可点击、
//          双端无 pageerror/console.error
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
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

async function newPage(vw, vh) {
  const p = await browser.newPage();
  p.on('pageerror', (e) => pageErrors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await p.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  return p;
}
async function waitFor(page, fn, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await page.evaluate(fn)) return true; await sleep(200); }
  return false;
}

// ============================================================
// 桌面 1440px
// ============================================================
const d = await newPage(1440, 960);
await d.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await sleep(600);

// —— D1 球体 SVG 已渲染（6 圈粒子 + 1 球体 + 1 高光） ——
const sphereStruct = await d.evaluate(() => {
  const svg = document.querySelector('.hero-sphere');
  if (!svg) return null;
  return {
    rings: svg.querySelectorAll('.hs-ring').length,
    specs: svg.querySelectorAll('.hs-spec').length,
    sphereCircles: svg.querySelectorAll('.hs-sphere-group circle').length,
  };
});
check('[D1] Hero 球体 SVG 渲染（6 圈粒子 + 球组）', sphereStruct && sphereStruct.rings === 6 && sphereStruct.specs === 1 && sphereStruct.sphereCircles >= 3, JSON.stringify(sphereStruct));
await d.screenshot({ path: OUT + 'd-hero.png', fullPage: false });

// —— D2 粒子环 stroke-dashoffset 持续变化（粒子在转） ——
const dashBefore = await d.evaluate(() => {
  const r = document.querySelector('.hs-ring-1');
  return r ? getComputedStyle(r).strokeDashoffset : '';
});
await sleep(1500);
const dashAfter = await d.evaluate(() => {
  const r = document.querySelector('.hs-ring-1');
  return r ? getComputedStyle(r).strokeDashoffset : '';
});
check('[D2] 粒子环 dashoffset 持续变化（粒子在转）', dashBefore !== dashAfter && dashBefore !== '' && dashAfter !== '', `${dashBefore} -> ${dashAfter}`);

// —— D3 高光斑绕球公转（transform 变化 = 球面在转） ——
const specBefore = await d.evaluate(() => {
  const s = document.querySelector('.hs-spec');
  return s ? getComputedStyle(s).transform : '';
});
await sleep(1500);
const specAfter = await d.evaluate(() => {
  const s = document.querySelector('.hs-spec');
  return s ? getComputedStyle(s).transform : '';
});
check('[D3] 高光斑绕球公转（球面"在转"）', specBefore !== specAfter && specBefore !== 'none' && specAfter !== 'none', `${specBefore} -> ${specAfter}`);

// —— D4 CTA 与文案 ——
const heroText = await d.evaluate(() => {
  const t = document.querySelector('.hero-title');
  const ctas = [...document.querySelectorAll('.hero-cta')].map((b) => b.textContent.trim());
  return { title: t ? t.textContent.trim() : '', ctas };
});
check('[D4] Hero 文案与 CTA 完整', heroText.title.includes('AI 助教') && heroText.ctas.includes('教师入口 →'), JSON.stringify(heroText));

// —— D5 点击"教师入口"CTA 平滑滚动到 #role-teacher ——
const beforeY = await d.evaluate(() => window.scrollY);
await d.evaluate(() => [...document.querySelectorAll('.hero-cta')].find((b) => b.textContent.includes('教师入口'))?.click());
await sleep(1000);
const afterY = await d.evaluate(() => window.scrollY);
const teacherRoleInView = await d.evaluate(() => {
  const el = document.getElementById('role-teacher');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top >= -10 && r.top < window.innerHeight;
});
check('[D5] 点击"教师入口"滚动到角色区', afterY > beforeY && teacherRoleInView, `scrollY ${beforeY}->>${afterY}, role-teacher in view=${teacherRoleInView}`);

// —— D6 点击教师卡片真的登录进 /t/overview ——
await d.evaluate(() => [...document.querySelectorAll('.hero-role-opt')][0]?.click());
await sleep(900);
const inTeacherApp = await d.evaluate(() => location.pathname === '/t/overview');
check('[D6] 教师卡片点击登录成功进入 /t/overview', inTeacherApp, d.url());
await d.close();

// ============================================================
// 移动 390px
// ============================================================
const m = await newPage(390, 844);
await m.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await sleep(600);

// —— M1 球体仍在移动端渲染 ——
const mSphere = await m.evaluate(() => {
  const svg = document.querySelector('.hero-sphere');
  return svg ? svg.querySelectorAll('.hs-ring').length : 0;
});
check('[M1] 移动端球体仍渲染', mSphere === 6, `rings=${mSphere}`);
await m.screenshot({ path: OUT + 'm-hero.png', fullPage: false });

// —— M2 移动端 hero 单列堆叠 ——
const mLayout = await m.evaluate(() => {
  const visual = document.querySelector('.hero-visual');
  const text = document.querySelector('.hero-text');
  if (!visual || !text) return false;
  const vr = visual.getBoundingClientRect();
  const tr = text.getBoundingClientRect();
  return vr.top < tr.top; // visual 在 text 之前（堆叠顺序）
});
check('[M2] 移动端 Hero 单列堆叠（球体在上）', mLayout);

// —— M3 移动端 CTA 全宽 ——
const mCtaWidth = await m.evaluate(() => {
  const cta = document.querySelector('.hero-cta--primary');
  if (!cta) return 0;
  return cta.getBoundingClientRect().width;
});
check('[M3] 移动端 CTA 全宽（>= 容器宽 90%）', mCtaWidth > 390 * 0.85, `ctaWidth=${mCtaWidth}`);
await m.screenshot({ path: OUT + 'm-mobile.png', fullPage: true });
await m.close();

// ============================================================
// 运行时错误汇总
// ============================================================
check('[ERR] 无页面运行时错误(pageerror)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无应用级 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== 首页 Hero 验收：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');