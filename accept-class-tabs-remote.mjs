import puppeteer from 'puppeteer-core';

const BASE = 'https://b3130d50d9af4c448d26f49191e4837f.app.workbuddy.link';
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
await page.goto(`${BASE}/t/students?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

const expectedNames = ['AI写作/提示词', 'AI图像/视频', 'AI办公/PPT', 'AI智能体/工作流', '课程统筹/学员成长'];
const tabs = await page.$$eval('.class-tab', (els) =>
  els.map((e) => ({ text: e.textContent.replace(/\d+$/, '').trim(), count: e.querySelector('.tab-count')?.textContent?.trim() })),
);
ok(tabs.length === 5, `远端班级 Tab 数量 = 5（实际 ${tabs.length}）`);
const tabNames = tabs.map((t) => t.text);
let namesOk = true;
for (const n of expectedNames) if (!tabNames.includes(n)) namesOk = false;
ok(namesOk, `远端 5 个 Tab 名为老师专长类别（${tabNames.join(' / ')}）`);

const countRows = async () => page.$$eval('.stable tbody tr', (r) => r.length);
const defaultRows = await countRows();
ok(defaultRows === 25, `远端默认只显示单班 25 名学员（实际 ${defaultRows} 行）`);

ok(errors.length === 0, `远端全程无 JS 错误（共 ${errors.length} 条）`);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
console.log(`\n远端结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
