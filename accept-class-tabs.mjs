import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:4173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2713', m); } else { fail++; console.log('  \u2717', m); } };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

await page.setViewport({ width: 1280, height: 900 });
// 进入教师视角学员档案页（演示态只读）
await page.goto(`${BASE}/t/students?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));

// 1) 应有 5 个班级 Tab，且名字为老师专长类别
const expectedNames = ['AI写作/提示词', 'AI图像/视频', 'AI办公/PPT', 'AI智能体/工作流', '课程统筹/学员成长'];
const tabs = await page.$$eval('.class-tab', (els) =>
  els.map((e) => ({ text: e.textContent.replace(/\d+$/, '').trim(), count: e.querySelector('.tab-count')?.textContent?.trim() })),
);
ok(tabs.length === 5, `班级 Tab 数量 = 5（实际 ${tabs.length}）`);
const tabNames = tabs.map((t) => t.text);
let namesOk = true;
for (const n of expectedNames) if (!tabNames.includes(n)) namesOk = false;
ok(namesOk, `5 个 Tab 名为老师专长类别（${tabNames.join(' / ')}）`);

// 2) 每个 Tab 角标 = 25
let countsOk = true;
for (const t of tabs) if (t.count !== '25') countsOk = false;
ok(countsOk, '每个班级 Tab 人数角标 = 25');

// 3) 默认选中第一个 Tab，且表格只显示该班 25 行（不再一次性列出 125）
const activeName = await page.$eval('.class-tab--active', (e) => e.textContent.replace(/\d+$/, '').trim()).catch(() => '');
ok(activeName === expectedNames[0], `默认选中第一个班（${activeName}）`);
const countRows = async () => page.$$eval('.stable tbody tr', (r) => r.length);
const defaultRows = await countRows();
ok(defaultRows === 25, `默认只显示单班 25 名学员（实际 ${defaultRows} 行）`);

// 4) 逐个点击 Tab，确认每班都恰好 25 行，且卡片标题含班级名
for (let i = 0; i < 5; i++) {
  const tabEls = await page.$$('.class-tab');
  await tabEls[i].click();
  await new Promise((r) => setTimeout(r, 350));
  const rows = await countRows();
  const title = await page.$eval('.card > .card-head, .card h3, .card-title', (e) => e.textContent || '').catch(() => '');
  const activeNow = await page.$eval('.class-tab--active', (e) => e.textContent.replace(/\d+$/, '').trim()).catch(() => '');
  ok(rows === 25, `点击「${activeNow}」后表格行数 = 25（实际 ${rows}）`);
  ok(title.includes(activeNow), `卡片标题含当前班级名「${activeNow}」`);
}

// 5) 零 JS 错误
ok(errors.length === 0, `全程无 JS 错误（共 ${errors.length} 条）`);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
