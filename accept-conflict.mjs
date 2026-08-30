import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire('/Users/beisi-peter/.workbuddy/binaries/node/workspace/node_modules/');
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:4173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}
async function bodyText(page) { return page.evaluate(() => document.body.innerText); }
async function clickText(page, sel, txt) {
  const ok = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((x) => x.textContent.trim() === t || x.textContent.includes(t));
    if (el) { el.click(); return true; }
    return false;
  }, sel, txt);
  await sleep(500);
  return ok;
}
async function setInput(page, type, index, value) {
  await page.evaluate((t, i, v) => {
    const inp = document.querySelectorAll(`input[type=${t}]`)[i];
    if (!inp) throw new Error(`no input[type=${t}] #${i}`);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, type, index, value);
  await sleep(150);
}

const today = new Date().toISOString().slice(0, 10);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 1) 本地教师登录（点王老师卡片进入 /t/overview）
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('王老师'));
  if (b) b.click();
});
await page.waitForSelector('body', { timeout: 8000 });
await sleep(800);
check('教师登录进入应用', (await page.url()).includes('/t/overview'));
await page.goto(`${BASE}/t/schedule/t1`, { waitUntil: 'networkidle0' });
await sleep(800);
check('进入 t1 排班详情页', (await bodyText(page)).includes('排班'));

// 新增排班 #1：今天 19:00-21:00
await clickText(page, 'button', '+ 新增排班');
await sleep(500);
await setInput(page, 'date', 0, today);
await setInput(page, 'time', 0, '19:00');
await setInput(page, 'time', 1, '21:00');
await page.evaluate(() => {
  const inp = document.querySelector('input.input:not([type])');
  if (inp) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(inp,'验收课A'); inp.dispatchEvent(new Event('input',{bubbles:true})); }
});
await sleep(150);
await clickText(page, 'button', '保存');
await sleep(700);
check('新增第1条排班成功（toast 已保存）', (await bodyText(page)).includes('已保存'));

// 新增排班 #2：今天 20:00-22:00（与 #1 重叠）
await clickText(page, 'button', '+ 新增排班');
await sleep(500);
await setInput(page, 'date', 0, today);
await setInput(page, 'time', 0, '20:00');
await setInput(page, 'time', 1, '22:00');
await page.evaluate(() => {
  const inp = document.querySelector('input.input:not([type])');
  if (inp) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(inp,'验收课B'); inp.dispatchEvent(new Event('input',{bubbles:true})); }
});
await sleep(150);
await clickText(page, 'button', '保存');
await sleep(600);
check('重叠保存时弹出时间冲突提醒', (await bodyText(page)).includes('时间冲突提醒'));
check('冲突提醒提供「仍要保存」按钮', (await bodyText(page)).includes('仍要保存'));

// 点「仍要保存」强制保存
await clickText(page, 'button', '仍要保存');
// 轮询等待 toast（强制保存路径下渲染窗口略长）
let toastOk = false;
for (let i = 0; i < 12; i++) {
  if ((await bodyText(page)).includes('已保存')) { toastOk = true; break; }
  await sleep(200);
}
check('强制保存后出现「已保存」提示', toastOk);
const bt2 = await bodyText(page);
check('强制保存后写入第二条排班（含「验收课B」）', bt2.includes('验收课B'));
check('强制保存后弹窗已关闭（冲突提醒消失）', !bt2.includes('时间冲突提醒'));
check('详情页出现「⚠ 时间冲突」角标', bt2.includes('⚠ 时间冲突'));

console.log(`\n冲突验收结果：通过 ${pass} / 失败 ${fail}`);
if (errors.length) console.log('console.error:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
