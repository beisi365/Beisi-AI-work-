import { createRequire } from 'node:module';
const require = createRequire('/Users/beisi-peter/.workbuddy/binaries/node/workspace/package.json');
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:4173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

// 阶段A：空态（本地 seed 排班均为历史日期，未来视角应显示空态）
await page.goto(`${BASE}/s/schedule?demo=student`, { waitUntil: 'networkidle0' });
await sleep(1200);
let body = await page.evaluate(() => document.body.innerText);
check('学员端课表页渲染「我的课表」标题', body.includes('我的课表'));
check('聚合链路正确：显示归属老师（s01→cl1→t1→王老师）', body.includes('王老师'));
check('无未来排班时显示空态文案', body.includes('暂无即将开始的排课'));

// 阶段B：模拟老师已排未来课——注入一条 t1 未来排班到本地库，验证学员可见
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('aiwb_db_v1') || '{}');
  const arr = db.teacher_schedules || (db.teacher_schedules = []);
  const now = Date.now();
  arr.push({
    id: 'ts_verify_1',
    teacher_id: 't1',
    schedule_date: '2026-09-05',
    start_time: '09:00',
    end_time: '10:00',
    title: '验收测试课',
    location: '线上会议室',
    note: '注入验证',
    created_at: now,
    updated_at: now,
    created_by: 'verify',
  });
  localStorage.setItem('aiwb_db_v1', JSON.stringify(db));
});
await page.reload({ waitUntil: 'networkidle0' });
await sleep(1200);
body = await page.evaluate(() => document.body.innerText);
check('注入未来排班后学员可见（标题出现）', body.includes('验收测试课'));
check('展示排班日期 2026-09-05', body.includes('2026-09-05'));
check('展示起止时间区间', body.includes('09:00') && body.includes('10:00'));

// 切换「仅本周」应可点且不报错
const toggled = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '仅本周');
  if (b) {
    b.click();
    return true;
  }
  return false;
});
await sleep(400);
check('「仅本周」按钮可点击', toggled);

// 移动端 390px 不溢出
await page.setViewport({ width: 390, height: 844 });
await sleep(400);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth + 2,
);
check('390px 视口无横向溢出', overflow);

check('无 pageerror / console.error', errors.length === 0);
if (errors.length) console.log('ERRORS:', errors.slice(0, 5));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
process.exit(failed.length ? 1 : 0);
