// CP2.1 开关回退验证（featureFlags.assessments=false）：导航隐藏 + 正式路由不可用（重定向）。
// 自包含长期回归脚本：
//  - 项目根从本脚本位置向上解析，不写死本机绝对路径；
//  - 自动检测空闲端口并自起 dev server，在 finally 中关闭；
//  - 修改开关为 false 后运行断言；无论成功或失败，finally 中均恢复 featureFlags 原值（当前为 true）；
//  - 仅 localhost，不访问外部网络或付费服务；
//  - 截图仅写入已被 .gitignore 忽略的 docs/cp2-plan/accept/formal/；
//  - 断言失败返回非 0 退出码；
//  - 不执行 git add/commit/merge/tag。
// 运行：node docs/cp2-plan/verify_false.mjs（建议从项目根目录执行）。
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
  console.error('[verify_false] 未设置 CHROME_PATH，请设置该环境变量指向 Chrome 可执行文件后再运行');
  process.exit(1);
}
const OUT = path.join(PROJECT_ROOT, 'docs/cp2-plan/accept/formal');
const FF_PATH = path.join(PROJECT_ROOT, 'src/lib/featureFlags.ts');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
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
async function shot(page, name) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`  shot ${name} (${page.viewport().width}x${h})`);
}

const origFF = fs.readFileSync(FF_PATH, 'utf8');
function setFlag(val) {
  const next = origFF.replace(/(assessments:\s*)(true|false)(,)/, `$1${val}$3`);
  if (next === origFF) throw new Error('未能在 featureFlags.ts 中定位 assessments 字段');
  fs.writeFileSync(FF_PATH, next);
}

let server = null;
let browser = null;
let failed = false;
try {
  setFlag(false); // 置为 false 后再自起 dev server，使其读到新值
  const port = await pickPort(5173);
  server = startServer('dev', port);
  await waitForPort(port, 20000);
  BASE = `http://localhost:${port}`;
  console.log(`dev server (flag=false) @ ${BASE}`);
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    userDataDir: path.join('/tmp', `formal_false_${Date.now()}`),
  });

  // 教师：导航不应含“能力评估”
  let page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await login(page, 'teacher');
  const nav = await page.evaluate(() => [...document.querySelectorAll('.nav-item, .mtab')].map((n) => n.textContent.trim()));
  rec('开关回退', '教师导航不显示“能力评估”', !nav.some((t) => t.includes('能力评估')), `nav=${JSON.stringify(nav)}`);
  await shot(page, 'F_false_nav_teacher');
  // 教师：直接访问 /t/assessments → 应重定向（路由不可用）
  await page.goto(`${BASE}/t/assessments`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.pathname !== '/t/assessments', { timeout: 8000 }).catch(() => {});
  const tPath = await page.evaluate(() => location.pathname);
  rec('开关回退', '教师直接访问 /t/assessments → 重定向', tPath !== '/t/assessments', tPath);
  await shot(page, 'F_false_route_teacher');
  await page.close();

  // 学员：导航不应含“我的评估”
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await login(page, 'student');
  const sNav = await page.evaluate(() => [...document.querySelectorAll('.nav-item, .mtab')].map((n) => n.textContent.trim()));
  rec('开关回退', '学员导航不显示“我的评估”', !sNav.some((t) => t.includes('我的评估')), `nav=${JSON.stringify(sNav)}`);
  // 学员：直接访问 /s/assessments → 重定向
  await page.goto(`${BASE}/s/assessments`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.pathname !== '/s/assessments', { timeout: 8000 }).catch(() => {});
  const sPath = await page.evaluate(() => location.pathname);
  rec('开关回退', '学员直接访问 /s/assessments → 重定向', sPath !== '/s/assessments', sPath);
  await page.close();

  failed = results.some((r) => !r.p);
  console.log(`\n==== 开关回退 SUMMARY ==== ${results.filter((r) => r.p).length}/${results.length} passed`);
  fs.writeFileSync(path.join(OUT, 'false_results.json'), JSON.stringify({ results }, null, 2));
} catch (e) {
  console.error('FATAL', e);
  failed = true;
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (server) server.kill('SIGTERM'); } catch {}
  // 无论成功或失败，均恢复 featureFlags 原值（当前应为 true）
  try { fs.writeFileSync(FF_PATH, origFF); } catch {}
}
process.exit(failed ? 1 : 0);
