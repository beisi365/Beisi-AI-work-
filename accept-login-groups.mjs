import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2713', m); } else { fail++; console.log('  \u2713\u0338', m); } };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

// 普通访问（不带 demo 参数）→ 渲染登录页
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

// 1) 5 个班级分组
const groups = await page.$$eval('.class-group', (els) =>
  els.map((e) => ({
    name: e.querySelector('.class-group-name')?.textContent?.trim() || '',
    countText: e.querySelector('.class-group-count')?.textContent?.trim() || '',
    cards: Array.from(e.querySelectorAll('.hero-role-opt .hero-role-name')).map((n) => n.textContent.trim()),
  })),
);
ok(groups.length === 5, `登录页班级分组数 = 5（实际 ${groups.length}）`);

const expectedNames = ['AI写作/提示词', 'AI图像/视频', 'AI办公/PPT', 'AI智能体/工作流', '课程统筹/学员成长'];
const actualNames = groups.map((g) => g.name);
let namesOk = actualNames.length === 5 && expectedNames.every((n, i) => actualNames[i] === n);
ok(namesOk, `5 个分组顺序与名称正确（${actualNames.join(' / ')}）`);

// 2) 每个分组 25 张卡片 + 角标
let all25 = true;
for (let i = 0; i < groups.length; i++) {
  if (groups[i].cards.length !== 25) all25 = false;
  if (!groups[i].countText.includes('25')) all25 = false;
}
ok(all25, '每组恰好 25 张学员卡片且角标含 25');

// 3) 分段：cl1=学员1-25, cl2=学员26-50, cl3=学员51-75, cl4=学员76-100, cl5=学员101-125
const expectedRanges = [
  [1, 25],
  [26, 50],
  [51, 75],
  [76, 100],
  [101, 125],
];
let rangeOk = true;
for (let i = 0; i < 5; i++) {
  const [lo, hi] = expectedRanges[i];
  const want = Array.from({ length: 25 }, (_, k) => `学员${lo + k}`);
  const got = groups[i].cards;
  if (want.length !== got.length) { rangeOk = false; break; }
  for (let k = 0; k < 25; k++) {
    if (got[k] !== want[k]) { rangeOk = false; break; }
  }
}
ok(rangeOk, '5 个分组学员号段正确：1-25 / 26-50 / 51-75 / 76-100 / 101-125');

// 4) 零 JS 错误
ok(errors.length === 0, `全程无 JS 错误（共 ${errors.length} 条）`);
if (errors.length) console.log(errors.join('\n'));

// 5) 截图供用户对照
await page.screenshot({ path: '/tmp/5173-login-groups.png', fullPage: true });
console.log('截图已存 /tmp/5173-login-groups.png');

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
