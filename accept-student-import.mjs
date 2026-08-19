// 学员批量导入 · 真实浏览器端到端验收
// 复用 accept-p2-5.mjs 的登录/导航脚手架。
// 流程：教师登录 → 学员档案 → 批量导入 → 上传样例CSV(2合法+1错误班级) → 确认导入
//      → 断言 students 数 +2、导入结果成功2/失败1、预览正确拦截错误行、无运行时错误。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = new URL('./screenshots-import/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`);
};
const urls = {};
const markUrl = (page, key) => { urls[key] = page.url(); };

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
async function go(page, url) {
  await page.evaluate((u) => { window.history.pushState({}, '', u); window.dispatchEvent(new PopStateEvent('popstate')); }, url);
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('.role-opt')].find((x) => x.textContent.includes('老师')); if (b) b.click(); });
  await page.waitForSelector('.sidebar', { timeout: 6000 });
  await sleep(400);
}
async function clickText(page, selector, text) {
  return page.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t)); if (el) { el.click(); return true; } return false; }, selector, text);
}
async function dbTable(page, table) {
  return page.evaluate((t) => { const raw = JSON.parse(localStorage.getItem('aiwb_db_v1') || '{}'); return raw[t] || []; }, table);
}
async function waitFor(page, fn, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await page.evaluate(fn)) return true; await sleep(200); }
  return false;
}

const page = await newPage(1440, 960);
await loginTeacher(page);
markUrl(page, 'login');

// 进入学员档案
await go(page, '/t/students');
await sleep(800);
markUrl(page, 'students');
const studentsBefore = (await dbTable(page, 'students')).length;

// 取一个真实班级名（用于构造合法行）
const classes = await dbTable(page, 'classes');
const className = classes[0]?.name || 'AI应用基础班';
console.log(`  种子班级[0]=${className}；导入前 students=${studentsBefore}`);

// 构造样例 CSV：2 条合法 + 1 条错误班级
const HEADERS = ['登录账号','登录姓名','展示姓名','班级','年龄段','职业','联系方式','学习目标','每周学习小时','设备','系统','办公软件','常用AI工具','自我介绍','自助能力','使用付费AI'];
const rows = [
  ['imp01','导入测试甲','甲同学',className,'25-35','设计师','13800000001','学会AI绘画','8','Mac','macOS','Figma','豆包','设计背景','是','否'],
  ['imp02','导入测试乙','乙同学',className,'35-45','教师','13800000002','教学提效','6','Win','Windows','Office','文心','教育行业','否','否'],
  ['imp03','导入测试丙','丙同学','不存在的班级X','—','—','—','—','0','—','—','—','—','—','否','否'],
];
const toCsv = (h, rs) => [h.join(','), ...rs.map((r) => r.join(','))].join('\n');
const csvPath = '/tmp/import_sample.csv';
fs.writeFileSync(csvPath, toCsv(HEADERS, rows), 'utf8');

// 打开批量导入弹窗
const openedModal = await clickText(page, 'button', '批量导入');
await sleep(700);
const modalOpen = await page.evaluate(() => !!document.querySelector('.modal'));
check('[I1] 点击「批量导入」打开导入弹窗', openedModal && modalOpen);
await page.screenshot({ path: OUT + 'i-modal.png', fullPage: true });

// 上传 CSV
const fileInput = await page.$('input[type="file"]');
check('[I2] 文件选择框存在', !!fileInput);
await fileInput.uploadFile(csvPath);
await sleep(900);

// 预览：应显示 可导入 2 条 / 待修正 1 条
const previewOk = await waitFor(page, () => document.body.innerText.includes('可导入 2 条') && document.body.innerText.includes('待修正 1 条'), 6000);
check('[I3] 上传后预览正确（可导入2/待修正1）', previewOk);
await page.screenshot({ path: OUT + 'i-preview.png', fullPage: true });

// 确认导入
const clickedConfirm = await clickText(page, 'button', '确认导入');
await sleep(1200);
const doneText = await page.evaluate(() => document.body.innerText);
const successMatch = doneText.match(/成功导入\s*(\d+)\s*条/);
const failMatch = doneText.match(/失败\s*(\d+)\s*条/);
const created = successMatch ? Number(successMatch[1]) : -1;
const failed = failMatch ? Number(failMatch[1]) : -1;
check('[I4] 确认导入后结果：成功2/失败1', clickedConfirm && created === 2 && failed === 1, `created=${created} failed=${failed}`);
await page.screenshot({ path: OUT + 'i-done.png', fullPage: true });

// 关闭弹窗，校验数据真实落库
await clickText(page, '.modal button', '关闭');
await sleep(600);
await go(page, '/t/students');
await sleep(800);
const studentsAfter = (await dbTable(page, 'students')).length;
check('[I5] 学员数真实 +2（数据库落库）', studentsAfter === studentsBefore + 2, `${studentsBefore}->${studentsAfter}`);

// 校验导入的两条确实写入 users（account 唯一校验通过）
const users = await dbTable(page, 'users');
const importedAccounts = users.filter((u) => ['imp01', 'imp02'].includes(u.account)).length;
check('[I6] 导入账号写入 users 表（imp01/imp02）', importedAccounts === 2, `matched=${importedAccounts}`);

// 错误行不应落库：不应出现 imp03
const importedBad = users.filter((u) => u.account === 'imp03').length;
check('[I7] 错误班级行被拦截未落库（无 imp03）', importedBad === 0);

// 列表中可见导入的学员
const listHasImported = await page.evaluate(() => document.body.innerText.includes('甲同学') && document.body.innerText.includes('乙同学'));
check('[I8] 学员列表可见导入的甲/乙同学', listHasImported);

check('[ERR] 无页面运行时错误(pageerror)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无应用级 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

await page.close();
await browser.close();

console.log('\n=== URL 记录 ===');
for (const [k, v] of Object.entries(urls)) console.log(`  ${k}: ${v}`);

const failed2 = results.filter((r) => !r.ok);
console.log(`\n==== 学员批量导入验收：${results.length - failed2.length}/${results.length} 通过 ====`);
if (failed2.length) {
  console.log('FAILED:');
  failed2.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');
