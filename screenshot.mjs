import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:4173';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_H = 1600; // 单张高度上限，避免平台按 2048px 最大高度压缩导致宽度失真

// 读取 PNG 尺寸（IHDR: 宽在偏移16、高在偏移20，均为4字节大端）
function pngSize(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} 不是 PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

// 客户端导航（不整页刷新，保留内存登录态）
async function go(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await page.waitForSelector('.main', { timeout: 8000 }).catch(() => {});
  await sleep(550);
}

async function loginAs(name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt');
  // 强制清空并重新播种：确保每位角色都基于完整种子渲染，
  // 避免历史 localStorage 残留（可能只有少量提交）导致作业页等长列表异常。
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt');
  await page.evaluate((n) => {
    const btns = [...document.querySelectorAll('.role-opt')];
    const b = btns.find((x) => x.textContent.includes(n));
    if (b) b.click();
  }, name);
  await page.waitForSelector('.sidebar', { timeout: 5000 });
  return page;
}

// 原尺寸整页截图（带宽度校验）—— 用于不长、不会被压缩的页面
async function shot(page, url, file, expectedOrOpts = {}) {
  const expected = typeof expectedOrOpts === 'number' ? expectedOrOpts : expectedOrOpts.expected;
  await page.setViewport({ width: expected, height: 960, deviceScaleFactor: 1 });
  await go(page, url);
  const iw = await page.evaluate(() => window.innerWidth);
  if (expected && iw !== expected) throw new Error(`[viewport] ${file}: 期望 ${expected}px，实际 ${iw}px`);
  await page.screenshot({ path: OUT + file, fullPage: true });
  const [w, h] = pngSize(OUT + file);
  if (expected && w !== expected) throw new Error(`[png] ${file}: 期望宽度 ${expected}px，实际 ${w}px`);
  console.log(`saved ${file} (${w}x${h})`);
}

async function shotTab(page, url, tabText, file, expectedOrOpts = {}) {
  const expected = typeof expectedOrOpts === 'number' ? expectedOrOpts : expectedOrOpts.expected;
  await page.setViewport({ width: expected, height: 960, deviceScaleFactor: 1 });
  await go(page, url);
  await page.evaluate((txt) => {
    const btns = [...document.querySelectorAll('.tabs .tab')];
    const b = btns.find((x) => x.textContent && x.textContent.trim().includes(txt));
    if (b) b.click();
  }, tabText);
  await sleep(500);
  const iw = await page.evaluate(() => window.innerWidth);
  if (expected && iw !== expected) throw new Error(`[viewport] ${file}: 期望 ${expected}px，实际 ${iw}px`);
  await page.screenshot({ path: OUT + file, fullPage: true });
  const [w, h] = pngSize(OUT + file);
  if (expected && w !== expected) throw new Error(`[png] ${file}: 期望宽度 ${expected}px，实际 ${w}px`);
  console.log(`saved ${file} (${w}x${h})`);
}

// 分段截图：固定视口，按滚动位置截取视口区域（高度 = 视口高，≤ MAX_H，避免被平台压缩）
async function shotSegment(page, url, file, { vw, vh, scrollY }) {
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  await go(page, url);
  await page.evaluate((y) => {
    const cands = [document.querySelector('.main'), document.querySelector('.content'), document.documentElement, document.body];
    let done = false;
    for (const el of cands) {
      if (el && el.scrollHeight > el.clientHeight + 4) {
        el.scrollTop = y;
        done = true;
        break;
      }
    }
    if (!done) window.scrollTo(0, y);
  }, scrollY);
  await sleep(450);
  const iw = await page.evaluate(() => window.innerWidth);
  if (iw !== vw) throw new Error(`[viewport] ${file}: 期望 ${vw}px，实际 ${iw}px`);
  await page.screenshot({ path: OUT + file }); // 非 fullPage，高度 = 视口高
  const [w, h] = pngSize(OUT + file);
  if (w !== vw) throw new Error(`[png] ${file}: 宽 ${w}px 期望 ${vw}px`);
  if (h > MAX_H) throw new Error(`[png] ${file}: 高 ${h}px 超过 ${MAX_H}px`);
  console.log(`saved ${file} (${w}x${h})`);
}

// 计算 n 段滚动位置（顶部 / 中段 / 底部）—— 基于真实滚动容器
async function segScrolls(page, vh, n) {
  await page.waitForSelector('.stack .card', { timeout: 8000 }).catch(() => {});
  await sleep(1200); // 等待数据/卡片渲染完成
  const info = await page.evaluate((vh) => {
    const cands = [document.querySelector('.main'), document.querySelector('.content'), document.documentElement, document.body];
    let max = 0;
    for (const el of cands) {
      if (el && el.scrollHeight > el.clientHeight + 4) { max = Math.max(0, el.scrollHeight - el.clientHeight); break; }
    }
    if (max === 0) max = Math.max(0, document.documentElement.scrollHeight - vh);
    return { max, cards: document.querySelectorAll('.card').length, full: document.documentElement.scrollHeight };
  }, vh);
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(Math.round((info.max * i) / (n - 1)));
  console.log(`  segScrolls max=${info.max} cards=${info.cards} full=${info.full} -> ${arr.join(', ')}`);
  return arr;
}

// 将某个分区标题滚动到视口顶部（容器无关，最稳妥）
async function scrollToHeading(page, text) {
  await page.evaluate((t) => {
    const hs = [...document.querySelectorAll('h2.section-title, h1, h2')];
    const h = hs.find((e) => e.textContent && e.textContent.includes(t));
    if (h) h.scrollIntoView({ block: 'start' });
  }, text);
  await sleep(400);
}

// 按分区标题定位截图（用于移动端总览的班级区/课程区），同样做宽度与高度校验
async function shotAtHeading(page, url, file, { vw, vh, heading }) {
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  await go(page, url);
  await scrollToHeading(page, heading);
  const iw = await page.evaluate(() => window.innerWidth);
  if (iw !== vw) throw new Error(`[viewport] ${file}: 期望 ${vw}px，实际 ${iw}px`);
  await page.screenshot({ path: OUT + file });
  const [w, h] = pngSize(OUT + file);
  if (w !== vw) throw new Error(`[png] ${file}: 宽 ${w}px 期望 ${vw}px`);
  if (h > MAX_H) throw new Error(`[png] ${file}: 高 ${h}px 超过 ${MAX_H}px`);
  console.log(`saved ${file} (${w}x${h})`);
}

// 点击某个容器内文本匹配的按钮（React onClick 通过原生 click 触发）
async function clickByText(page, selector, text) {
  return page.evaluate(
    ({ selector, text }) => {
      const btn = [...document.querySelectorAll(selector)].find(
        (b) => b.textContent && b.textContent.includes(text),
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    },
    { selector, text },
  );
}

function assertPng(file, expW) {
  const [w, h] = pngSize(OUT + file);
  if (w !== expW) throw new Error(`[png] ${file}: 宽 ${w}px 期望 ${expW}px`);
  if (h > MAX_H) throw new Error(`[png] ${file}: 高 ${h}px 超过 ${MAX_H}px`);
  console.log(`saved ${file} (${w}x${h})`);
}

const EXPECT_DESKTOP = 1440;
const EXPECT_MOBILE = 390;

// —— 教师端（王老师） ——
// 演示数据重置已内联到 loginAs（清空 + 重载重新播种），保证基于完整种子渲染。
const t = await loginAs('王老师');

// 教师作业页：紧凑管理列表（1440×900 视口，非整页超长截图）
// 1) 首屏：滚到分页器，露出「共 N 条｜第 X/Y 页」与首页/上一页/页码/下一页/末页
await t.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await go(t, '/t/works');
const rowCount = await t.evaluate(
  () => document.querySelectorAll('.works-table tbody > tr:not(.expand-row)').length,
);
console.log(`  teacher-works 首页主行数 = ${rowCount}`);
await t.evaluate(() => document.querySelector('.pager')?.scrollIntoView({ block: 'end' }));
await sleep(450);
await t.screenshot({ path: OUT + 'teacher-works-top.png' });
assertPng('teacher-works-top.png', 1440);

// 2) 翻页后：点击「下一页」到第二页，并滚到分页器确认「第 2/8 页」
await clickByText(t, '.pager button', '下一页');
await sleep(650);
await t.evaluate(() => document.querySelector('.pager')?.scrollIntoView({ block: 'end' }));
await sleep(450);
await t.screenshot({ path: OUT + 'teacher-works-p2.png' });
assertPng('teacher-works-p2.png', 1440);

// 回到第一页并展开首行详情（版本历史 + 教师评定操作）
await clickByText(t, '.pager button', '上一页');
await sleep(500);
await clickByText(t, '.works-table tbody button', '查看');
await sleep(650);
await t.evaluate(() => document.querySelector('.expand-row')?.scrollIntoView({ block: 'start' }));
await sleep(450);
await t.screenshot({ path: OUT + 'teacher-works-detail.png' });
assertPng('teacher-works-detail.png', 1440);
await t.close();

// —— 教师总览手机端：顶部指标区（390×844）—— 仅截顶部，验证「平均完成率」卡片不再跨两列 ——
const m = await loginAs('王老师');
await shotSegment(m, '/t/overview', 'teacher-overview-mobile-top.png', { vw: 390, vh: 844, scrollY: 0 });
await m.close();

await browser.close();

// 最终兜底校验：交付图必须宽度合规且高度不超限
const deliverables = [
  ['teacher-works-top.png', EXPECT_DESKTOP],
  ['teacher-works-p2.png', EXPECT_DESKTOP],
  ['teacher-works-detail.png', EXPECT_DESKTOP],
  ['teacher-overview-mobile-top.png', EXPECT_MOBILE],
];
let bad = 0;
for (const [f, exp] of deliverables) {
  const [w, h] = pngSize(OUT + f);
  const okW = w === exp;
  const okH = h <= MAX_H;
  if (!okW || !okH) bad++;
  console.log(`${okW && okH ? 'OK ' : 'BAD'} ${f}: ${w}x${h} (期望宽 ${exp}, 高≤${MAX_H})`);
}
if (bad > 0) {
  console.error(`存在 ${bad} 张尺寸不符的截图，禁止提交。`);
  process.exit(1);
}
console.log('ALL_DONE');
