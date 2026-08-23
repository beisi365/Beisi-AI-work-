import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2713', m); } else { fail++; console.log('  \u2717', m); } };

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

// 普通访问（dev 模式学员段开放）→ 渲染登录页
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

// 1) 切换标签：应为 5 个，且含「老师 · 班级名」+ 角标 25
const tabs = await page.$$eval('.login-class-tab', (els) =>
  els.map((e) => ({
    label: e.querySelector('.login-class-tab-label')?.textContent?.trim() || '',
    count: e.querySelector('.login-class-tab-count')?.textContent?.trim() || '',
  })),
);
ok(tabs.length === 5, `切换标签数 = 5（实际 ${tabs.length}）`);
ok(tabs.every((t) => t.count === '25'), `每个标签角标 = 25（${tabs.map((t) => t.count).join(',')}）`);
console.log('    标签：', tabs.map((t) => t.label).join(' | '));

// 2) 默认只显示一个班的 25 张卡（不再一次性列 125）
const readGroup = async () => {
  const g = await page.$$eval('.class-group', (els) =>
    els.map((e) => ({
      name: e.querySelector('.class-group-name')?.textContent?.trim() || '',
      countText: e.querySelector('.class-group-count')?.textContent?.trim() || '',
      cards: Array.from(e.querySelectorAll('.hero-role-opt .hero-role-name')).map((n) => n.textContent.trim()),
    })),
  );
  return g;
};
let g = await readGroup();
ok(g.length === 1, `默认只显示 1 个班（实际 ${g.length} 个班）`);
ok(g.length === 1 && g[0].cards.length === 25, `默认该班恰好 25 张学员卡（实际 ${g[0]?.cards.length}）`);
ok(g.length === 1 && g[0].countText.includes('25'), `默认班级角标含 25（${g[0]?.countText}）`);

// 3) 默认班应为 cl1（王老师 · AI写作/提示词，学员1-25）
const expectedNames = ['AI写作/提示词', 'AI图像/视频', 'AI办公/PPT', 'AI智能体/工作流', '课程统筹/学员成长'];
ok(g.length === 1 && g[0].name === expectedNames[0], `默认班级 = ${expectedNames[0]}（实际 ${g[0]?.name}）`);
const want1_25 = Array.from({ length: 25 }, (_, k) => `学员${1 + k}`);
ok(g.length === 1 && JSON.stringify(g[0].cards) === JSON.stringify(want1_25), `默认班学员号段 = 学员1-25`);

// 4) 点击第 3 个标签（cl3 陈老师 · AI办公/PPT）→ 显示该班 25 人（学员51-75）
const tabEls = await page.$$('.login-class-tab');
await tabEls[2].click();
await new Promise((r) => setTimeout(r, 500));
g = await readGroup();
ok(g.length === 1 && g[0].name === expectedNames[2], `点击第3标签后班级 = ${expectedNames[2]}（实际 ${g[0]?.name}）`);
const want51_75 = Array.from({ length: 25 }, (_, k) => `学员${51 + k}`);
ok(g.length === 1 && JSON.stringify(g[0].cards) === JSON.stringify(want51_75), `第3班学员号段 = 学员51-75`);

// 5) 点击第 5 个标签（cl5 林老师 · 课程统筹/学员成长）→ 学员101-125
await (await page.$$('.login-class-tab'))[4].click();
await new Promise((r) => setTimeout(r, 500));
g = await readGroup();
const want101_125 = Array.from({ length: 25 }, (_, k) => `学员${101 + k}`);
ok(g.length === 1 && g[0].name === expectedNames[4], `点击第5标签后班级 = ${expectedNames[4]}（实际 ${g[0]?.name}）`);
ok(g.length === 1 && JSON.stringify(g[0].cards) === JSON.stringify(want101_125), `第5班学员号段 = 学员101-125`);

// 6) 零 JS 错误
ok(errors.length === 0, `全程无 JS 错误（共 ${errors.length} 条）`);
if (errors.length) console.log(errors.join('\n'));

// 7) 截图（默认态 = 单班 25 张 + 切换标签）
await (await page.$$('.login-class-tab'))[0].click();
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/5173-login-single-class.png', fullPage: true });
console.log('截图已存 /tmp/5173-login-single-class.png');

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
