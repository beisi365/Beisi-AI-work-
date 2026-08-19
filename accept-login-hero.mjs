// 首页 Hero 真实浏览器验收：1440 桌面 + 390 移动端（星空增强版）
// 核心断言：球体 SVG 渲染、粒子环 stroke-dashoffset 流动、高光公转、
//          星空 ≥100 颗、星云 ≥2 处、闪烁星 + 尘埃粒子动画、
//          CTA 滚动到角色区、登录仍可点击、双端无 pageerror/console.error
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
await sleep(800);

// —— D1 球体 SVG 整体结构（6 主环 + 2 远景环 + 球组） ——
const sphereStruct = await d.evaluate(() => {
  const svg = document.querySelector('.hero-sphere');
  if (!svg) return null;
  return {
    mainRings: svg.querySelectorAll('.hs-rings .hs-ring').length,
    distantRings: svg.querySelectorAll('.hs-rings-distant .hs-ring').length,
    specs: svg.querySelectorAll('.hs-spec').length,
    sphereCircles: svg.querySelectorAll('.hs-sphere-group circle, .hs-sphere-group ellipse').length,
  };
});
check('[D1] Hero 球体 SVG 结构（≥6 主环 + 2 远景环 + 球组）',
  sphereStruct && sphereStruct.mainRings === 6 && sphereStruct.distantRings === 2 && sphereStruct.specs === 1 && sphereStruct.sphereCircles >= 4,
  JSON.stringify(sphereStruct));
await d.screenshot({ path: OUT + 'd-hero.png', fullPage: false });

// —— D2 星空 ≥100 颗星 ——
const starCount = await d.evaluate(() => document.querySelectorAll('.hs-stars circle').length);
check('[D2] 星空 ≥100 颗星点', starCount >= 100, `stars=${starCount}`);

// —— D3 星云 ≥2 处 + 包含 3 种暖色（warm/deep/glow） ——
const nebulaCount = await d.evaluate(() => document.querySelectorAll('.hs-nebula circle').length);
check('[D3] 深空星云 ≥2 处', nebulaCount >= 2, `nebulae=${nebulaCount}`);

// —— D4 闪烁星（部分星有 hs-star-tw 类） ——
const twinkleCount = await d.evaluate(() => document.querySelectorAll('.hs-stars circle.hs-star-tw').length);
check('[D4] 闪烁星动画启用（至少 20 颗）', twinkleCount >= 20, `twinklers=${twinkleCount}`);

// —— D5 闪烁星的 transform 持续变化（缩放） ——
const twBefore = await d.evaluate(() => {
  const tw = document.querySelector('.hs-stars circle.hs-star-tw');
  return tw ? getComputedStyle(tw).transform : '';
});
await sleep(1500);
const twAfter = await d.evaluate(() => {
  const tw = document.querySelector('.hs-stars circle.hs-star-tw');
  return tw ? getComputedStyle(tw).transform : '';
});
check('[D5] 闪烁星 transform 变化（星空在闪烁）', twBefore !== twAfter && twBefore !== 'none', `${twBefore} -> ${twAfter}`);

// —— D6 尘埃粒子 ≥10 颗且持续公转 ——
const dustCount = await d.evaluate(() => document.querySelectorAll('.hs-dust circle').length);
check('[D6] 尘埃粒子 ≥10 颗', dustCount >= 10, `dust=${dustCount}`);
const dustBefore = await d.evaluate(() => {
  const p = document.querySelector('.hs-dust circle');
  return p ? getComputedStyle(p).transform : '';
});
await sleep(1500);
const dustAfter = await d.evaluate(() => {
  const p = document.querySelector('.hs-dust circle');
  return p ? getComputedStyle(p).transform : '';
});
check('[D6b] 尘埃粒子持续公转', dustBefore !== dustAfter && dustBefore !== 'none', `${dustBefore} -> ${dustAfter}`);

// —— D7 粒子环 dashoffset 变化 ——
const dashBefore = await d.evaluate(() => {
  const r = document.querySelector('.hs-ring-1');
  return r ? getComputedStyle(r).strokeDashoffset : '';
});
await sleep(1500);
const dashAfter = await d.evaluate(() => {
  const r = document.querySelector('.hs-ring-1');
  return r ? getComputedStyle(r).strokeDashoffset : '';
});
check('[D7] 粒子环 dashoffset 持续变化', dashBefore !== dashAfter && dashBefore !== '', `${dashBefore} -> ${dashAfter}`);

// —— D8 高光斑绕球公转（球面在转） ——
const specBefore = await d.evaluate(() => {
  const s = document.querySelector('.hs-spec');
  return s ? getComputedStyle(s).transform : '';
});
await sleep(1500);
const specAfter = await d.evaluate(() => {
  const s = document.querySelector('.hs-spec');
  return s ? getComputedStyle(s).transform : '';
});
check('[D8] 高光斑绕球公转（球面"在转"）', specBefore !== specAfter && specBefore !== 'none', `${specBefore} -> ${specAfter}`);

// —— D9 Hero 文案与 CTA ——
const heroText = await d.evaluate(() => {
  const t = document.querySelector('.hero-title');
  const ctas = [...document.querySelectorAll('.hero-cta')].map((b) => b.textContent.trim());
  return { title: t ? t.textContent.trim() : '', ctas };
});
check('[D9] Hero 文案与 CTA 完整', heroText.title.includes('AI 助教') && heroText.ctas.includes('教师入口 →'), JSON.stringify(heroText));

// —— D10 CTA 滚动 ——
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
check('[D10] 点击"教师入口"滚动到角色区', afterY > beforeY && teacherRoleInView, `scrollY ${beforeY}->${afterY}, inView=${teacherRoleInView}`);

// —— D11 教师卡片登录 ——
await d.evaluate(() => [...document.querySelectorAll('.hero-role-opt')][0]?.click());
await sleep(900);
const inTeacherApp = await d.evaluate(() => location.pathname === '/t/overview');
check('[D11] 教师卡片登录成功 → /t/overview', inTeacherApp, d.url());
await d.close();

// ============================================================
// 移动 390px
// ============================================================
const m = await newPage(390, 844);
await m.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await sleep(800);

// —— M1 移动端球体仍渲染（保留星空） ——
const mStruct = await m.evaluate(() => {
  const svg = document.querySelector('.hero-sphere');
  if (!svg) return null;
  return {
    rings: svg.querySelectorAll('.hs-ring').length,
    stars: svg.querySelectorAll('.hs-stars circle').length,
    nebulae: svg.querySelectorAll('.hs-nebula circle').length,
    dust: svg.querySelectorAll('.hs-dust circle').length,
  };
});
check('[M1] 移动端 Hero 完整渲染（星空+星云+尘埃）', mStruct && mStruct.rings >= 6 && mStruct.stars >= 100 && mStruct.nebulae >= 2 && mStruct.dust >= 10, JSON.stringify(mStruct));
await m.screenshot({ path: OUT + 'm-hero.png', fullPage: false });

// —— M2 移动端单列堆叠 ——
const mLayout = await m.evaluate(() => {
  const visual = document.querySelector('.hero-visual');
  const text = document.querySelector('.hero-text');
  if (!visual || !text) return false;
  return visual.getBoundingClientRect().top < text.getBoundingClientRect().top;
});
check('[M2] 移动端 Hero 单列堆叠', mLayout);

// —— M3 CTA 全宽 ——
const mCtaWidth = await m.evaluate(() => document.querySelector('.hero-cta--primary')?.getBoundingClientRect().width ?? 0);
check('[M3] 移动端 CTA 全宽（≥ 容器宽 85%）', mCtaWidth > 390 * 0.85, `ctaWidth=${mCtaWidth}`);
await m.screenshot({ path: OUT + 'm-mobile.png', fullPage: true });
await m.close();

// ============================================================
// 错误检查
// ============================================================
check('[ERR] 无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== 首页 Hero（星空增强）验收：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');