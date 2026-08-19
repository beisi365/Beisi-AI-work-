// 首页 Hero（真实浏览器验收 v3：全屏宇宙背景版）
//   * CosmicBackground 全屏 fixed 铺满整页 (180 星 + 5 星云 + 3 远景环 + 30 尘埃)
//   * HeroSphere 右侧焦点（中心球 + 6 主环 + 高光公转 + 14 尘埃）
//   * 左侧暗晕让标题在星海上可读
// 桌面 1440 + 移动 390：覆盖、动画、CTA、登录、错误检查
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

// ============================================================
// 桌面 1440px
// ============================================================
const d = await newPage(1440, 960);
await d.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await sleep(1500);

// —— [D1] CosmicBackground 全屏 fixed 覆盖 ——
const bgCover = await d.evaluate(() => {
  const bg = document.querySelector('.cosmic-bg');
  if (!bg) return null;
  const cs = getComputedStyle(bg);
  const r = bg.getBoundingClientRect();
  return {
    position: cs.position,
    zIndex: cs.zIndex,
    pointerEvents: cs.pointerEvents,
    width: r.width,
    height: r.height,
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
});
check('[D1] CosmicBackground 全屏 fixed 覆盖',
  bgCover && bgCover.position === 'fixed' && bgCover.zIndex === '0' && bgCover.pointerEvents === 'none'
    && bgCover.width >= bgCover.vw - 1 && bgCover.height >= bgCover.vh - 1,
  JSON.stringify(bgCover));

// —— [D2] CosmicBackground 包含 180 星 + 5 星云 + 3 远景环 + 30 尘埃 ——
const bgLayers = await d.evaluate(() => {
  const stars = document.querySelectorAll('.cb-stars circle').length;
  const twinkles = document.querySelectorAll('.cb-stars .cb-twinkle').length;
  const nebulas = document.querySelectorAll('.cb-nebulas ellipse').length;
  const farRings = document.querySelectorAll('.cb-far-rings ellipse').length;
  const dust = document.querySelectorAll('.cb-dust circle').length;
  return { stars, twinkles, nebulas, farRings, dust };
});
check('[D2] CosmicBackground 元素数 ≥ 星150/云4/远环2/尘20',
  bgLayers.stars >= 150 && bgLayers.nebulas >= 4 && bgLayers.farRings >= 2 && bgLayers.dust >= 20 && bgLayers.twinkles >= 30,
  JSON.stringify(bgLayers));

// —— [D3] HeroSphere 焦点：6 主环 + 高光 + 中心球 ——
const sphere = await d.evaluate(() => {
  const svg = document.querySelector('.hero-sphere');
  if (!svg) return null;
  return {
    mainRings: svg.querySelectorAll('.hs-rings .hs-ring').length,
    specs: svg.querySelectorAll('.hs-spec').length,
    dust: svg.querySelectorAll('.hs-dust circle').length,
  };
});
check('[D3] HeroSphere 右侧焦点（≥6 主环 + 高光 + 14 尘埃）',
  sphere && sphere.mainRings === 6 && sphere.specs === 1 && sphere.dust >= 14,
  JSON.stringify(sphere));

// —— [D4] 闪烁星动画在跑（Web Animations API,避免 headless 触帧时序问题） ——
const cbAnim = await d.evaluate(() => {
  const tw = document.querySelector('.cb-stars .cb-twinkle');
  if (!tw) return null;
  const anims = tw.getAnimations();
  return {
    count: anims.length,
    playState: anims[0]?.playState,
    name: anims[0]?.animationName,
    duration: anims[0]?.effect?.getTiming()?.duration,
  };
});
check('[D4] 闪烁星 CSS 动画定义 + 正在播放',
  cbAnim && cbAnim.count >= 1 && cbAnim.playState === 'running' && /^cb-twinkle|hero-twinkle|hs-star-tw/.test(cbAnim.name || 'cb-twinkle'),
  JSON.stringify(cbAnim));

// 顺便抓两条 transform 验证在不同时间确有差异（即使第一帧触不到）
const t0 = await d.evaluate(() => {
  const tw = document.querySelectorAll('.cb-stars .cb-twinkle')[3];
  return tw ? getComputedStyle(tw).transform : 'none';
});
await sleep(2500);
const t1 = await d.evaluate(() => {
  const tw = document.querySelectorAll('.cb-stars .cb-twinkle')[3];
  return tw ? getComputedStyle(tw).transform : 'none';
});
check('[D4b] 闪烁星 2.5s 内 transform 变化', t0 !== t1, `${t0.slice(0, 30)} -> ${t1.slice(0, 30)}`);

// —— [D5] 远景尘埃公转 ——
const cbDustBefore = await d.evaluate(() => {
  const d = document.querySelector('.cb-dust circle');
  return d ? getComputedStyle(d).transform : 'none';
});
await sleep(1500);
const cbDustAfter = await d.evaluate(() => {
  const d = document.querySelector('.cb-dust circle');
  return d ? getComputedStyle(d).transform : 'none';
});
check('[D5] CosmicBackground 远景尘埃公转', cbDustBefore !== cbDustAfter && cbDustBefore !== 'none', `${cbDustBefore.slice(0, 50)} -> ${cbDustAfter.slice(0, 50)}`);

// —— [D6] 主粒子环 dashoffset 变化 ——
const dashBefore = await d.evaluate(() => {
  const r = document.querySelector('.hs-ring-1');
  return r ? getComputedStyle(r).strokeDashoffset : '';
});
await sleep(1500);
const dashAfter = await d.evaluate(() => {
  const r = document.querySelector('.hs-ring-1');
  return r ? getComputedStyle(r).strokeDashoffset : '';
});
check('[D6] 主粒子环 dashoffset 持续变化', dashBefore !== dashAfter && dashBefore !== '', `${dashBefore} -> ${dashAfter}`);

// —— [D7] 高光斑绕球公转（球面在转） ——
const specBefore = await d.evaluate(() => {
  const s = document.querySelector('.hs-spec');
  return s ? getComputedStyle(s).transform : 'none';
});
await sleep(1500);
const specAfter = await d.evaluate(() => {
  const s = document.querySelector('.hs-spec');
  return s ? getComputedStyle(s).transform : 'none';
});
check('[D7] 高光斑绕球公转（球面在转）', specBefore !== specAfter && specBefore !== 'none', `${specBefore.slice(0, 50)} -> ${specAfter.slice(0, 50)}`);

// —— [D8] 左侧暗晕存在（保护标题可读）+ 文案完整 ——
const heroText = await d.evaluate(() => {
  const v = document.querySelector('.hero-vignette');
  const t = document.querySelector('.hero-title');
  const ctas = [...document.querySelectorAll('.hero-cta')].map((b) => b.textContent.trim());
  return {
    hasVignette: !!v,
    title: t ? t.textContent.trim() : '',
    ctas,
  };
});
check('[D8] 左上暗晕 + 文案与 CTA 完整',
  heroText.hasVignette && heroText.title.includes('AI 助教') && heroText.ctas.includes('教师入口 →'),
  JSON.stringify({ title: heroText.title.slice(0, 40), ctas: heroText.ctas }));

// —— [D9] 内容层在宇宙背景之上 (z-index) ——
const layers = await d.evaluate(() => {
  const bg = document.querySelector('.cosmic-bg');
  const wrap = document.querySelector('.login-page-wrap');
  const sphere = document.querySelector('.hero-sphere');
  return {
    bgZ: bg ? +getComputedStyle(bg).zIndex : null,
    wrapZ: wrap ? +getComputedStyle(wrap).zIndex : null,
    spherePos: sphere ? getComputedStyle(sphere.closest('.hero-visual') || sphere.parentElement).position : null,
  };
});
check('[D9] 内容层 z-index > 宇宙背景 z-index', layers.bgZ === 0 && layers.wrapZ >= 1, JSON.stringify(layers));

await d.screenshot({ path: OUT + 'd-hero.png', fullPage: false });

// —— [D10] CTA → 滚动到角色区 ——
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
check('[D10] "教师入口"→CTA 滚动到角色区', afterY > beforeY && teacherRoleInView, `scrollY ${beforeY}->${afterY}, inView=${teacherRoleInView}`);

// —— [D11] 教师卡片登录 ——
await d.evaluate(() => [...document.querySelectorAll('.hero-role-opt')][0]?.click());
await sleep(900);
const inTeacherApp = await d.evaluate(() => location.pathname === '/t/overview');
check('[D11] 教师卡片登录 → /t/overview', inTeacherApp, d.url());
await d.close();

// ============================================================
// 移动 390px
// ============================================================
const m = await newPage(390, 844);
await m.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await sleep(1500);

// —— [M1] 移动端 CosmicBackground 仍铺满整屏 ——
const mBg = await m.evaluate(() => {
  const bg = document.querySelector('.cosmic-bg');
  const r = bg ? bg.getBoundingClientRect() : null;
  return r ? { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight } : null;
});
check('[M1] 移动端 CosmicBackground 铺满整屏',
  mBg && mBg.w >= mBg.vw - 1 && mBg.h >= mBg.vh - 1,
  JSON.stringify(mBg));

// —— [M2] 移动端宇宙元素齐全 ——
const mLayers = await m.evaluate(() => ({
  stars: document.querySelectorAll('.cb-stars circle').length,
  twinkles: document.querySelectorAll('.cb-stars .cb-twinkle').length,
  nebulas: document.querySelectorAll('.cb-nebulas ellipse').length,
  farRings: document.querySelectorAll('.cb-far-rings ellipse').length,
  dust: document.querySelectorAll('.cb-dust circle').length,
  sphereRings: document.querySelectorAll('.hs-rings .hs-ring').length,
}));
check('[M2] 移动端宇宙元素齐全（>全量低线）',
  mLayers.stars >= 150 && mLayers.nebulas >= 4 && mLayers.farRings >= 2 && mLayers.dust >= 20 && mLayers.sphereRings === 6,
  JSON.stringify(mLayers));
await m.screenshot({ path: OUT + 'm-hero.png', fullPage: false });

// —— [M3] 移动端单列堆叠 + CTA 全宽 —— （视觉在上 ⇒ visual.top < text.top）
const mLayout = await m.evaluate(() => {
  const visual = document.querySelector('.hero-visual');
  const text = document.querySelector('.hero-text');
  const ctaW = document.querySelector('.hero-cta--primary')?.getBoundingClientRect().width ?? 0;
  return {
    visualTop: visual?.getBoundingClientRect().top ?? 0,
    textTop: text?.getBoundingClientRect().top ?? 0,
    ctaWidth: ctaW,
    vw: innerWidth,
  };
});
const verticalStack = mLayout.visualTop < mLayout.textTop + 5 && Math.abs(mLayout.visualTop - mLayout.textTop) > 20;
check('[M3] 移动端单列堆叠（视觉在上） + CTA 全宽',
  verticalStack && mLayout.ctaWidth > mLayout.vw * 0.85,
  JSON.stringify(mLayout));
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
console.log(`\n==== 首页 Hero（全屏宇宙）验收：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');
