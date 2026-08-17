// P0 真实浏览器权限验证（自包含版）：
// 自行启动 vite preview 并在 finally 关闭服务与浏览器；
// 学员端 /s/works 无教师评定按钮、仅「新增作品版本」入口；
// 教师端 /t/works 可退回/完成/评优，且操作日志角色与 ID 正确。
//
// 自检约束（提交前核对）：
// - 无本机绝对路径（脚本经 import.meta.url 相对定位仓库根；Chrome 走 CHROME_BIN 环境变量，缺省仅本机回退）；
// - 自行启动并在 finally 关闭服务和浏览器；
// - 不修改 feature flag、不修改 seed 源文件、不执行 git 操作；
// - 使用临时浏览器 profile，不污染正式演示数据；
// - 失败返回非 0；截图输出至已忽略目录 screenshots-p0/。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..'); // docs/cp2-plan -> 仓库根
const CHROME = process.env.CHROME_BIN || '';
if (!CHROME) {
  console.error('[verify_p0] 未设置 CHROME_BIN，请设置该环境变量指向 Chrome 可执行文件后再运行');
  process.exit(1);
}
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(projectRoot, 'screenshots-p0') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_H = 1600;

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} 不是 PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
function assertPng(file, expW) {
  const [w, h] = pngSize(OUT + file);
  if (w !== expW) throw new Error(`[png] ${file}: 宽 ${w}px 期望 ${expW}px`);
  if (h > MAX_H) throw new Error(`[png] ${file}: 高 ${h}px 超过 ${MAX_H}px`);
  console.log(`saved ${file} (${w}x${h})`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('  ✗ ASSERT FAIL: ' + msg);
    failures++;
  } else {
    console.log('  ✓ ' + msg);
  }
}

async function go(page, url) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await page.waitForSelector('.main', { timeout: 8000 }).catch(() => {});
  await sleep(550);
}

async function loginAs(name) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  [PAGEERR]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('  [CON-ERR]', m.text());
  });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.role-opt');
  await page.evaluate((n) => {
    const btns = [...document.querySelectorAll('.role-opt')];
    const b = btns.find((x) => x.textContent.includes(n));
    if (b) b.click();
  }, name);
  await page.waitForSelector('.sidebar', { timeout: 5000 });
  return page;
}

let server = null;
try {
  // 自行启动 preview 服务（dist 须已构建）
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: projectRoot,
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not ready */
    }
    await sleep(500);
  }
  if (!ready) throw new Error('vite preview 未在预期时间内就绪');
  console.log(`preview ready at ${BASE}`);

  // ============ 学员端 /s/works ============
  console.log('—— 学员端 /s/works ——');
  const s = await loginAs('学员1');
  await go(s, '/s/works');
  await sleep(700);

  const hasGradeUnfolded = await s.evaluate(
    () =>
      [...document.querySelectorAll('button')].some((b) =>
        ['退回修改', '标记完成', '设为优秀'].includes((b.textContent || '').trim()),
      ) || !!document.querySelector('.grade-actions'),
  );
  assert(!hasGradeUnfolded, '未展开时页面无教师评定按钮（退回 / 完成 / 评优）');

  const expanded = await s.evaluate(() => {
    const btn = [...document.querySelectorAll('.works-table tbody > tr:not(.expand-row) button')]
      .find((b) => (b.textContent || '').trim() === '查看');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  assert(expanded, '点击作业行的「查看」展开');
  await sleep(550);
  const detail = await s.evaluate(() => {
    const er = document.querySelector('.expand-row');
    if (!er) return null;
    const text = er.textContent || '';
    return {
      hasAdd: text.includes('新增作品版本'),
      hasGrade:
        ['退回修改', '标记完成', '设为优秀'].some((t) => text.includes(t)) ||
        !!er.querySelector('.grade-actions'),
    };
  });
  assert(detail != null, '存在展开行（.expand-row）');
  assert(detail && detail.hasAdd, '学员展开行存在「新增作品版本」提交入口');
  assert(detail && !detail.hasGrade, '学员展开行仍无教师评定按钮（无越权控件）');

  await s.screenshot({ path: OUT + 'student-works-expanded.png' });
  assertPng('student-works-expanded.png', 1440);
  await s.close();

  // ============ 教师端 /t/works 批改回归 ============
  console.log('—— 教师端 /t/works ——');
  const t = await loginAs('王老师');
  await go(t, '/t/works');
  await sleep(700);

  const expandedT = await t.evaluate(() => {
    const rows = [...document.querySelectorAll('.works-table tbody > tr:not(.expand-row)')];
    for (const r of rows) {
      if (r.textContent.includes('待批改')) {
        const btn = [...r.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '查看');
        if (btn) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  });
  assert(expandedT, '找到并展开一条「待批改」提交');
  await sleep(600);

  const gradeBtns = await t.evaluate(() => {
    const er = document.querySelector('.expand-row');
    if (!er) return null;
    const btns = [...er.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
    return {
      hasReturn: btns.includes('退回修改'),
      hasComplete: btns.includes('标记完成'),
      hasExcellent: btns.includes('设为优秀'),
    };
  });
  assert(gradeBtns && gradeBtns.hasReturn, '教师展开行存在「退回修改」评定按钮');
  assert(gradeBtns && gradeBtns.hasComplete, '教师展开行存在「标记完成」评定按钮');
  assert(gradeBtns && gradeBtns.hasExcellent, '教师展开行存在「设为优秀」评定按钮');

  const clicked = await t.evaluate(() => {
    const er = document.querySelector('.expand-row');
    if (!er) return false;
    const btn = [...er.querySelectorAll('button')].find((b) => b.textContent.includes('标记完成'));
    if (btn) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  });
  assert(clicked, '点击「标记完成」');
  await sleep(1500);
  const dbCheck = await t.evaluate(() => {
    const raw = localStorage.getItem('aiwb_db_v1');
    if (!raw) return { dist: null, lastLog: null, targetSub: null };
    const d = JSON.parse(raw);
    const dist = {};
    (d.submissions || []).forEach((x) => {
      dist[x.status] = (dist[x.status] || 0) + 1;
    });
    const logs = d.operation_logs || [];
    const lastLog = logs[logs.length - 1];
    let targetSub = null;
    if (lastLog && lastLog.target && lastLog.target.startsWith('submissions:')) {
      const sid = lastLog.target.split(':')[1];
      targetSub = (d.submissions || []).find((x) => x.id === sid) || null;
    }
    return { dist, lastLog, targetSub };
  });
  console.log('  → DB 分布:', JSON.stringify(dbCheck.dist));
  console.log('  → 最近一条操作日志:', JSON.stringify(dbCheck.lastLog));
  console.log('  → 目标 submission 当前状态:', dbCheck.targetSub ? dbCheck.targetSub.status : 'null');
  assert(
    dbCheck.lastLog &&
      dbCheck.lastLog.action === 'update' &&
      String(dbCheck.lastLog.target).startsWith('submissions:') &&
      dbCheck.lastLog.user_id === 't1',
    '操作日志记录到教师 t1 的 submissions:update（回归通过）',
  );
  assert(
    dbCheck.targetSub && dbCheck.targetSub.status === 'completed',
    `目标 submission (${dbCheck.lastLog?.target}) 持久化状态为 completed`,
  );

  await t.screenshot({ path: OUT + 'teacher-works-graded.png' });
  assertPng('teacher-works-graded.png', 1440);
  await t.close();

  console.log(failures === 0 ? 'P0_VERIFY_OK' : `P0_VERIFY_FAILED(${failures})`);
} catch (e) {
  console.error('VERIFY ERROR:', e && e.message ? e.message : e);
  failures++;
} finally {
  if (server) {
    try {
      server.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  await browser.close().catch(() => {});
}
process.exit(failures === 0 ? 0 : 1);
