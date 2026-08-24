import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓', m); } else { fail++; console.log('✗', m); } };

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2000));

// 点「重置演示数据」让中控用含桥接覆盖的新种子重生
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => x.textContent?.includes('重置演示数据'));
  if (b) { b.click(); return true; }
  return false;
});
ok(clicked, '登录页存在「重置演示数据」按钮并点击');
await new Promise((r) => setTimeout(r, 1500));

// 直接读 localStorage 里的 s01
const s01 = await page.evaluate(() => {
  const raw = localStorage.getItem('aiwb_db_v1');
  if (!raw) return null;
  const db = JSON.parse(raw);
  return (db.students || []).find((s) => s.id === 's01') || null;
});
ok(!!s01, 'localStorage 中存在 s01 学员');
ok(s01 && s01.nickname === '学员1-改测试', `s01.nickname 已被资料库覆盖 = "${s01?.nickname}"（期望 学员1-改测试）`);

// 验证 s25 仍是默认（未被错误覆盖）
const s25 = await page.evaluate(() => {
  const raw = localStorage.getItem('aiwb_db_v1');
  const db = JSON.parse(raw);
  return (db.students || []).find((s) => s.id === 's25') || null;
});
ok(s25 && s25.nickname === '学员25', `s25.nickname 保持默认 = "${s25?.nickname}"`);

ok(errors.length === 0, `无 JS 错误（实际 ${errors.length}）`);
if (errors.length) console.log(errors.slice(0, 5));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
