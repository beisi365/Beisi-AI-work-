// CP2.1 正式入口回归验收（flag=true）。
// 自包含长期回归脚本：
//  - 项目根从本脚本位置向上解析，不写死本机绝对路径；
//  - 自动检测空闲端口并自起 dev server（vite），在 finally 中关闭；
//  - 仅 localhost，不访问外部网络或付费服务；
//  - 截图仅写入已被 .gitignore 忽略的 docs/cp2-plan/accept/formal/；
//  - 断言失败或运行时错误均返回非 0 退出码；
//  - 不执行 git add/commit/merge/tag。
// 运行：node docs/cp2-plan/verify_formal.mjs（建议从项目根目录执行）。
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME_PATH || '';
if (!CHROME) {
  console.error('[verify_formal] 未设置 CHROME_PATH，请设置该环境变量指向 Chrome 可执行文件后再运行');
  process.exit(1);
}
const OUT = path.join(PROJECT_ROOT, 'docs/cp2-plan/accept/formal');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
const rec = (g, n, p, d) => { results.push({ g, n, p, d }); console.log(`[${g}] ${p ? 'PASS' : 'FAIL'} | ${n} - ${d}`); };

function isFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function pickPort(base) {
  let p = base;
  while (!(await isFree(p))) {
    p += 1;
    if (p > base + 50) throw new Error(`无法在 ${base}~${base + 50} 找到空闲端口`);
  }
  return p;
}
function waitForPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`端口 ${port} 在 ${timeoutMs}ms 内未就绪`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}
function startServer(mode, port) {
  const bin = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'vite');
  const args = mode === 'preview'
    ? ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
    : ['--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  return spawn(bin, args, { cwd: PROJECT_ROOT, stdio: 'ignore' });
}

let BASE = '';
async function login(page, role) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.role-opt');
  await page.evaluate((role) => {
    const blocks = [...document.querySelectorAll('.role-block')];
    const block = role === 'teacher' ? blocks[0] : blocks[1];
    block.querySelector('.role-opt').click();
  }, role);
  await page.waitForFunction(
    (role) => location.pathname === (role === 'teacher' ? '/t/overview' : '/s/home'),
    { timeout: 8000 }, role,
  );
  await sleep(300);
}
async function gotoRoute(page, route) {
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
  await sleep(700);
}
async function waitCard(page) {
  try { await page.waitForSelector('.card', { timeout: 8000 }); return true; }
  catch {
    const info = await page.evaluate(() => ({ path: location.pathname, body: document.body.textContent.slice(0, 120) }));
    console.log(`  !! .card 超时 @ ${info.path} | ${info.body}`);
    return false;
  }
}
async function shot(page, name) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`  shot ${name} (${page.viewport().width}x${h})`);
}
async function clickByText(page, text) {
  return page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t) && !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
}
async function publishForS01(page) {
  await page.setViewport({ width: 1440, height: 900 });
  await login(page, 'teacher');
  await gotoRoute(page, '/t/assessments');
  await waitCard(page);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.textContent.includes('选择学员'));
    const sel = card.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 's01'); sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(400);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.textContent.includes('新建评估组'));
    const sels = [...card.querySelectorAll('select')];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    sels.forEach((s) => { setter.call(s, 'L3'); s.dispatchEvent(new Event('change', { bubbles: true })); });
    const tas = [...card.querySelectorAll('textarea')];
    const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    tas.forEach((ta) => { proto.call(ta, '证据说明'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  await sleep(300);
  await clickByText(page, '保存为草稿'); await sleep(900);
  await clickByText(page, '确认'); await sleep(900);
  await clickByText(page, '发布'); await sleep(1200);
}

let server = null;
let browser = null;
let failed = false;
try {
  const port = await pickPort(5173);
  server = startServer('dev', port);
  await waitForPort(port, 20000);
  BASE = `http://localhost:${port}`;
  console.log(`dev server @ ${BASE}`);
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    userDataDir: path.join('/tmp', `formal_${Date.now()}`),
  });
  const onErr = (page) => {
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  };

  // 教师：发布 + 正式入口渲染
  let page = await browser.newPage();
  onErr(page);
  await publishForS01(page);
  const tOk = await waitCard(page);
  if (tOk) {
    const t = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      return {
        hasTitle: document.body.textContent.includes('能力评估'),
        dimCards: cards.filter((c) => /基础认知|需求拆解|提示词工程|工具操作|判断甄别|应用落地/.test(c.textContent)).length,
        hasSelectStudent: cards.some((c) => c.textContent.includes('选择学员')),
        navHas: document.body.textContent.includes('能力评估'),
        devHint: document.body.textContent.includes('内部开发页'),
        published: document.body.textContent.includes('已发布'),
      };
    });
    rec('教师正式', '标题/六维/选择学员', t.hasTitle && t.dimCards >= 6 && t.hasSelectStudent, `title=${t.hasTitle} dim=${t.dimCards} sel=${t.hasSelectStudent}`);
    rec('教师正式', '正式入口不含“内部开发页”字样', !t.devHint, `devHint=${t.devHint}`);
    rec('教师正式', '导航显示“能力评估”', t.navHas, `navHas=${t.navHas}`);
    rec('教师正式', '发布后状态显示“已发布”', t.published, `published=${t.published}`);
  } else {
    rec('教师正式', '标题/六维/选择学员', false, 'waitCard 超时');
  }
  await shot(page, 'F_teacher_1440');
  await page.setViewport({ width: 390, height: 844 });
  await sleep(400);
  await shot(page, 'F_teacher_390');
  // 刷新行为：AuthContext 刻意不持久化 → 回登录页（架构既定已知限制）
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(800);
  const afterReload = await page.evaluate(() => location.pathname);
  rec('刷新行为', '刷新后回登录页（AuthContext 内存登录已知限制，全局既定）', afterReload === '/login', afterReload);
  await page.close();

  // 学员正式入口（应可见 s01 已发布六卡）
  page = await browser.newPage();
  onErr(page);
  await page.setViewport({ width: 1440, height: 900 });
  await login(page, 'student');
  await gotoRoute(page, '/s/assessments');
  const sOk = await waitCard(page);
  if (sOk) {
    const s = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      return {
        hasTitle: document.body.textContent.includes('我的能力评估'),
        dimCards: cards.filter((c) => /基础认知|需求拆解|提示词工程|工具操作|判断甄别|应用落地/.test(c.textContent)).length,
        hasEvidence: cards.some((c) => c.textContent.includes('证据')),
        navHas: document.body.textContent.includes('我的评估'),
      };
    });
    rec('学员正式', '标题/六卡/证据', s.hasTitle && s.dimCards >= 6 && s.hasEvidence, `title=${s.hasTitle} cards=${s.dimCards} ev=${s.hasEvidence}`);
    rec('学员正式', '导航显示“我的评估”', s.navHas, `navHas=${s.navHas}`);
  } else {
    rec('学员正式', '标题/六卡/证据', false, 'waitCard 超时');
  }
  await shot(page, 'F_student_1440');
  await page.setViewport({ width: 390, height: 844 });
  await sleep(400);
  await shot(page, 'F_student_390');
  await page.close();

  // 越权拦截
  page = await browser.newPage();
  onErr(page);
  await login(page, 'student');
  await gotoRoute(page, '/t/assessments');
  await sleep(800);
  const perm = await page.evaluate(() => location.pathname);
  rec('越权拦截', '学员访问 /t/assessments → 重定向 /s/home', perm === '/s/home', perm);
  await shot(page, 'F_perm_denied');
  await page.close();

  failed = results.some((r) => !r.p) || errors.length > 0;
  console.log(`\n==== 正式入口验收 SUMMARY ==== ${results.filter((r) => r.p).length}/${results.length} passed, errors=${errors.length}`);
  errors.forEach((e) => console.log('  ' + e));
  fs.writeFileSync(path.join(OUT, 'formal_results.json'), JSON.stringify({ results, errors }, null, 2));
} catch (e) {
  console.error('FATAL', e);
  failed = true;
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (server) server.kill('SIGTERM'); } catch {}
}
process.exit(failed ? 1 : 0);
