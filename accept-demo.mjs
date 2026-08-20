import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:4173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

// 1) 自动登录重定向 + 只读横幅
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));
const url1 = page.url();
ok(url1.includes('/t/overview'), `?demo=1 自动进入工作台 (url=${url1})`);
const banner = await page.evaluate(() => document.querySelector('.demo-banner')?.textContent?.trim() ?? '');
ok(banner.includes('只读'), `只读横幅可见 ("${banner}")`);

// 2) 总览页：快捷操作（新增学员等写按钮）已隐藏
const overviewBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()),
);
ok(!overviewBtns.some((t) => t.includes('新增学员')), '总览：无「新增学员」按钮');
ok(!overviewBtns.some((t) => t.includes('添加教师观察')), '总览：无「添加教师观察」按钮');

// 3) 学员档案页：新增/导入/编辑/调班/归档 全部隐藏
await page.goto(`${BASE}/t/students?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const studBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()),
);
ok(!studBtns.some((t) => t.includes('新增学员') || t.includes('批量导入') || t.includes('编辑') || t.includes('调班') || t.includes('归档')), '学员档案：所有写按钮隐藏');

// 4) 预警页：确认/解决/转为待办/刷新 隐藏
await page.goto(`${BASE}/t/alerts?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const alertBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()),
);
ok(!alertBtns.some((t) => t === '确认' || t === '解决' || t === '转为待办' || t.includes('刷新预警')), '预警：处置按钮隐藏');

// 5) 待办页：新建/完成 隐藏
await page.goto(`${BASE}/t/todos?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const todoBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()),
);
ok(!todoBtns.some((t) => t.includes('新建待办') || t === '完成'), '待办：新建/完成隐藏');

// 6) 考核页：新建评估组表单 + 组操作隐藏
await page.goto(`${BASE}/t/assessments?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const asmBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()),
);
ok(!asmBtns.some((t) => t.includes('保存草稿') || t === '确认' || t === '发布' || t === '作废' || t.includes('修正')), '考核：写按钮隐藏');

// 7) 移动端：390 宽仍可渲染 + 横幅可见 + 无报错
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/t/overview?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const mb = await page.evaluate(() => document.querySelector('.demo-banner')?.textContent?.trim() ?? '');
ok(mb.includes('只读'), '移动端：只读横幅可见');
const mbErr = errors.length;
ok(mbErr === 0, '移动端：无 pageerror/console.error');

// 8) Service Worker 注册（生产构建）
await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 0;
  const regs = await navigator.serviceWorker.getRegistrations();
  return regs.length;
});
ok(sw >= 1, `Service Worker 已注册 (count=${sw})`);

ok(errors.length === 0, `全程无 JS 错误（共 ${errors.length} 条）`);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
