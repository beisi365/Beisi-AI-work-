import puppeteer from 'puppeteer-core';

const BASE = 'https://b3130d50d9af4c448d26f49191e4837f.app.workbuddy.link';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2713', m); } else { fail++; console.log('  \u2717', m); } };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
const db = await page.evaluate(() => { const raw = localStorage.getItem('aiwb_db_v1'); return raw ? JSON.parse(raw) : null; });
ok(db !== null, '远端：localStorage 整库可读');
ok(db && (db.students || []).length === 125, `远端：学员总数 = 125（实际 ${db ? (db.students||[]).length : 'null'}）`);
ok(db && (db.classes || []).length === 5, `远端：班级数 = 5（实际 ${db ? (db.classes||[]).length : 'null'}）`);

// 学员视角远端
await page.goto(`${BASE}/?demo=student`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
const sHome = await page.evaluate(() => document.body.innerText);
ok(sHome.length > 100, '远端：学员视角首页正常渲染');

ok(errors.length === 0, `远端：全程无 JS 错误（共 ${errors.length} 条）`);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
console.log(`\n远端结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
