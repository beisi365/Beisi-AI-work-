// CP2.1 生产构建验证（vite preview，DEV=false，flag=true）：
// 正式路由 /t|s/assessments 应可访问；dev 路由 /t|s/dev/assessments 在生产构建不可访问（重定向）。
// 自包含长期回归脚本：
//  - 项目根从本脚本位置向上解析，不写死本机绝对路径；
//  - 自动检测空闲端口并自起 preview（需先 npm run build 生成 dist），在 finally 中关闭；
//  - 仅 localhost，不访问外部网络或付费服务；
//  - 截图仅写入已被 .gitignore 忽略的 docs/cp2-plan/accept/formal/；
//  - 断言失败返回非 0 退出码；
//  - 不执行 git add/commit/merge/tag。
// 运行：node docs/cp2-plan/verify_prod.mjs（建议从项目根目录执行，且已执行 npm run build）。
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(PROJECT_ROOT, 'docs/cp2-plan/accept/formal');
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(path.join(PROJECT_ROOT, 'dist', 'index.html'))) {
  console.error('FATAL: 未找到 dist/index.html，请先执行 npm run build');
  process.exit(1);
}

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
function startPreview(port) {
  const bin = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'vite');
  return spawn(bin, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: PROJECT_ROOT, stdio: 'ignore' });
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
async function push(page, route) {
  await page.evaluate((p) => { history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, route);
  await sleep(700);
}
async function shot(page, name) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`  shot ${name} (${page.viewport().width}x${h})`);
}

let server = null;
let browser = null;
let failed = false;
try {
  const port = await pickPort(4173);
  server = startPreview(port);
  await waitForPort(port, 20000);
  BASE = `http://localhost:${port}`;
  console.log(`preview server @ ${BASE}`);
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    userDataDir: path.join('/tmp', `prod_${Date.now()}`),
  });
  let page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await login(page, 'teacher');

  // 正式路由存在：pushState 后保持在 /t/assessments
  await push(page, '/t/assessments');
  const formalT = await page.evaluate(() => location.pathname);
  rec('生产构建', '正式 /t/assessments 可访问（路由存在）', formalT === '/t/assessments', formalT);
  await shot(page, 'P_formal_teacher');

  // dev 路由不存在：pushState 后被 * 重定向（生产构建 DEV=false）
  await push(page, '/t/dev/assessments');
  const devT = await page.evaluate(() => location.pathname);
  rec('生产构建', '/t/dev/assessments 不可访问（重定向）', devT !== '/t/dev/assessments', devT);
  await shot(page, 'P_dev_teacher_redirect');

  // 学员 dev 路由同样不可访问
  await login(page, 'student');
  await push(page, '/s/dev/assessments');
  const devS = await page.evaluate(() => location.pathname);
  rec('生产构建', '/s/dev/assessments 不可访问（重定向）', devS !== '/s/dev/assessments', devS);
  await shot(page, 'P_dev_student_redirect');

  failed = results.some((r) => !r.p);
  console.log(`\n==== 生产构建 SUMMARY ==== ${results.filter((r) => r.p).length}/${results.length} passed`);
  fs.writeFileSync(path.join(OUT, 'prod_results.json'), JSON.stringify({ results }, null, 2));
} catch (e) {
  console.error('FATAL', e);
  failed = true;
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (server) server.kill('SIGTERM'); } catch {}
}
process.exit(failed ? 1 : 0);
