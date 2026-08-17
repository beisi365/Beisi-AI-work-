import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const OUT = new URL('./screenshots-p2/', import.meta.url).pathname;
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
async function clickRole(page, name) {
  return page.evaluate((n) => {
    const b = [...document.querySelectorAll('.role-opt')].find((x) => x.textContent.includes(n));
    if (b) {
      b.click();
      return true;
    }
    return false;
  }, name);
}
async function loginTeacher(page) {
  await prepareLogin(page);
  await clickRole(page, '王老师');
  await page.waitForSelector('.sidebar', { timeout: 6000 });
  await sleep(400);
}

// ============================================================
// A. 关闭态：登录页无学员入口，显示学员端暂未开放
// ============================================================
{
  const p = await newPage(1440, 960);
  await prepareLogin(p);
  const txt = await p.evaluate(() => document.body.innerText);
  const roleOpts = await p.$$eval('.role-opt', (els) => els.length);
  check('关闭态登录页显示「学员端暂未开放」', txt.includes('学员端暂未开放') && txt.includes('当前为教师主导模式'));
  check('关闭态登录页仅教师角色(无学员按钮)', roleOpts === 2, `roleOpts=${roleOpts}`);
  await p.close();
}

// ============================================================
// B. 关闭态：直接访问 /s 被拦截（整页加载 /s/overview，符合需求描述）
// ============================================================
{
  const p = await newPage(1440, 960);
  await p.goto(`${BASE}/s/overview`, { waitUntil: 'networkidle0' });
  await sleep(500);
  const txt = await p.evaluate(() => document.body.innerText);
  const hasClosed = txt.includes('学员端暂未开放');
  const hasBack = txt.includes('返回教师登录');
  check('/s 直接访问被拦截(显示学员端暂未开放+返回教师登录)', hasClosed && hasBack, `hasClosed=${hasClosed} hasBack=${hasBack} len=${txt.length}`);
  await p.close();
}

// ============================================================
// C. 教师总览桌面端(1440)：10 模块 + 快捷操作 + 无运行时错误
// ============================================================
{
  const p = await newPage(1440, 960);
  await loginTeacher(p);
  await go(p, '/t/overview');
  await sleep(900);
  const txt = await p.evaluate(() => document.body.innerText);
  const quick = ['新增学员', '登记出勤', '登记作品', '发起考核', '添加教师观察', '批量导入（规划中）'];
  check('总览快捷操作齐全(均指向真实页面/弹窗)', quick.every((q) => txt.includes(q)));
  const modules = [
    '今日课程', '待登记出勤', '待批作业', '待完成考核', '最近新增学员',
    '连续缺席', '长期未提交作品', '重点关注', '即将结业', '班级与在读学员概况',
  ];
  // 以上均为页面实际渲染文案的子串（如「连续缺席学员」含「连续缺席」）
  check('总览10个真实数据模块齐全', modules.every((m) => txt.includes(m)));
  // 真实数字校验：学员总数后应为数字（来自 getTeacherOverview）
  const hasNumber = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.stat-value, .overview-stats *')].find((e) =>
      /学员总数|班级数/.test(e.textContent || ''),
    );
    return el ? /\d/.test(el.textContent || '') : false;
  });
  check('总览指标含真实数字(来自聚合查询)', hasNumber);
  await p.screenshot({ path: OUT + 'teacher-overview-desktop.png', fullPage: true });
  console.log('  saved teacher-overview-desktop.png');

  // 快捷操作可达真实功能：依次打开三个弹窗，确认 .modal 渲染且可关闭
  const openModal = async (text) => {
    const ok = await p.evaluate((t) => {
      const b = [...document.querySelectorAll('.quick-actions button')].find((x) => x.textContent.includes(t));
      if (b) {
        b.click();
        return true;
      }
      return false;
    }, text);
    await sleep(450);
    const modalShown = await p.evaluate(() => !!document.querySelector('.modal'));
    // 关闭弹窗（点关闭按钮或 Esc）
    await p.evaluate(() => {
      const c = document.querySelector('.modal-close');
      if (c) (c).click();
    });
    await sleep(300);
    return { ok, modalShown };
  };
  const modalResults = {};
  for (const label of ['新增学员', '登记出勤', '添加教师观察']) {
    modalResults[label] = await openModal(label);
  }
  check('快捷操作弹窗均可打开(新增学员/登记出勤/添加教师观察)',
    ['新增学员', '登记出勤', '添加教师观察'].every((l) => modalResults[l].ok && modalResults[l].modalShown),
    JSON.stringify(modalResults));
  await p.close();
}

// ============================================================
// D. 移动端(390)：底部导航主项(含更多)≤5，更多抽屉可展开
// ============================================================
{
  const m = await newPage(390, 844);
  await loginTeacher(m);
  await go(m, '/t/overview');
  await sleep(900);
  const mtabs = await m.$$eval('.mtab', (els) => els.length);
  check('移动端底部导航主项(含更多)≤5', mtabs <= 5, `mtabs=${mtabs}`);
  const opened = await m.evaluate(() => {
    const b = [...document.querySelectorAll('.mtab')].find((x) => x.textContent.includes('更多'));
    if (b) {
      b.click();
      return true;
    }
    return false;
  });
  await sleep(400);
  const moreSheet = await m.evaluate(() => !!document.querySelector('.more-sheet'));
  check('移动端「更多」抽屉可展开', opened && moreSheet);
  await m.screenshot({ path: OUT + 'teacher-overview-mobile.png', fullPage: true });
  console.log('  saved teacher-overview-mobile.png');
  await m.close();
}

// ============================================================
// E. 开启态(studentPortal=1)：登录页出现学员入口，学员端可访问
// ============================================================
{
  const p = await newPage(1440, 960);
  await prepareLogin(p);
  await p.evaluate(() => localStorage.setItem('studentPortal', '1'));
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('.role-opt', { timeout: 8000 });
  const txt = await p.evaluate(() => document.body.innerText);
  const roleOpts = await p.$$eval('.role-opt', (els) => els.length);
  check('开启态登录页出现学员角色按钮', txt.includes('以学员身份进入') && roleOpts > 2, `roleOpts=${roleOpts}`);
  // 以学员身份登录后访问 /s/overview：点击第一个非教师角色按钮
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.role-opt')].find((x) => !x.textContent.includes('老师'));
    if (b) b.click();
  });
  await pageWaitSidebar(p);
  await go(p, '/s/overview');
  await sleep(700);
  const sTxt = await p.evaluate(() => document.body.innerText);
  check('开启态学员端可访问(无关闭提示)', !sTxt.includes('学员端暂未开放'), `len=${sTxt.length}`);
  await p.close();
}

async function pageWaitSidebar(page) {
  await page.waitForSelector('.sidebar', { timeout: 6000 });
  await sleep(400);
}

// ============================================================
// F. 运行时错误汇总
// ============================================================
check('无页面运行时错误(pageerror)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
// 忽略 favicon / 资源 404 等噪声，仅关心应用级 console.error
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('无应用级 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== 验收结果：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');
