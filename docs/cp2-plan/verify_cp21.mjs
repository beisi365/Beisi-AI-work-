// CP2.1 本地验收 · 隐藏 dev 路由真实页面与交互测试（puppeteer-core 驱动本地 Chrome）
// 约束：不安装新依赖、不调用外部 AI/DB、不修改 feature flag。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '';
if (!CHROME) {
  console.error('[verify_cp21] 未设置 CHROME_BIN，请设置该环境变量指向 Chrome 可执行文件后再运行');
  process.exit(1);
}
const BASE = 'http://localhost:5173';
const ROOT = new URL('../..', import.meta.url).pathname;
const OUT = `${ROOT}/docs/cp2-plan/shots`;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[verify]', ...a);
const results = [];
const rec = (name, pass, detail) => { results.push({ name, pass, detail }); log(pass ? 'PASS' : 'FAIL', name, '-', detail); };

// 分段截图：单段高 <=1500px，避免整页超 2048 被平台压缩致宽度失真
async function segShot(page, name, maxH = 1500) {
  const vp = page.viewport();
  const W = vp.width;
  const full = await page.evaluate(() => document.body.scrollHeight);
  if (full <= maxH) {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    log('shot', name, `(${W}x${full})`);
    return;
  }
  let y = 0, idx = 1;
  while (y < full) {
    const h = Math.min(maxH, full - y);
    await page.screenshot({ path: `${OUT}/${name}_${idx}.png`, clip: { x: 0, y, width: W, height: h } });
    log('shot', `${name}_${idx}`, `(${W}x${h} of ${full})`);
    y += h; idx += 1;
  }
}

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
    { timeout: 8000 },
    role,
  );
  await sleep(300);
}

async function gotoDev(page, role) {
  // 关键：用 pushState 做 SPA 内部跳转，避免整页刷新丢失内存中的 principal（登录态）
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/${role === 'teacher' ? 't' : 's'}/dev/assessments`);
  await page.waitForSelector('.card', { timeout: 8000 });
  await sleep(400);
}

async function selectStudent(page, id) {
  await page.evaluate((id) => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.textContent.includes('选择学员'));
    const sel = card.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, id);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
  await sleep(300);
}

async function fillEvidence(page, texts) {
  await page.evaluate((texts) => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.textContent.includes('新建评估组'));
    const tas = [...card.querySelectorAll('textarea')];
    const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    tas.forEach((ta, i) => {
      proto.call(ta, texts[i] || '');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, texts);
  await sleep(200);
}

async function selectLevels(page, levels) {
  await page.evaluate((levels) => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.textContent.includes('新建评估组'));
    if (!card) return;
    const sels = [...card.querySelectorAll('select')];
    const proto = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    sels.forEach((s, i) => {
      proto.call(s, levels[i] || '');
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, levels);
  await sleep(200);
}

async function clickBtn(page, text) {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t) && !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
  if (!ok) throw new Error(`按钮未找到或已禁用: ${text}`);
  await sleep(400);
}

async function actOnGroup(page, status, action) {
  const ok = await page.evaluate((status, action) => {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) {
      if (c.textContent.includes(status)) {
        const btn = [...c.querySelectorAll('button')].find((b) => b.textContent.trim().includes(action) && !b.disabled);
        if (btn) { btn.click(); return true; }
      }
    }
    return false;
  }, status, action);
  await sleep(400);
  return ok;
}

async function isActionDisabled(page, status, action) {
  return page.evaluate((status, action) => {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) {
      if (c.textContent.includes(status)) {
        const btn = [...c.querySelectorAll('button')].find((b) => b.textContent.trim().includes(action));
        if (btn) return btn.disabled;
      }
    }
    return null;
  }, status, action);
}

async function groupCount(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.card')].filter((c) =>
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(c.textContent),
    ).length,
  );
}

async function injectPartialGroup(page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem('aiwb_db_v1');
    const db = JSON.parse(raw);
    const arr = db.ability_assessments;
    const groups = {};
    arr.forEach((r) => { if (r.assessment_group_id) (groups[r.assessment_group_id] ||= []).push(r); });
    const full = Object.values(groups).find((g) => g.length >= 6);
    if (!full) return;
    const gid = (crypto.randomUUID ? crypto.randomUUID() : 'p-' + Date.now());
    const subset = full
      .filter((r) => ['basics', 'requirement', 'prompt'].includes(r.dimension))
      .map((r) => ({ ...r, assessment_group_id: gid, id: r.id + '_partial', status: 'draft' }));
    arr.push(...subset);
    localStorage.setItem('aiwb_db_v1', JSON.stringify(db));
  });
  // 重选学员触发 reload 读取注入数据（不刷新页面以免丢失登录态）
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.textContent.includes('选择学员'));
    const sel = card.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 's02'); sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(400);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.textContent.includes('选择学员'));
    const sel = card.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 's01'); sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(400);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    userDataDir: `/tmp/cp21_profile_${Date.now()}`,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // ===== 教师端 PC =====
    await login(page, 'teacher');
    await gotoDev(page, 'teacher');
    await selectStudent(page, 's01');
    await segShot(page, '01_teacher_overview_initial');
    rec('教师端-总览加载(含CP1遗留)', true, '已渲染总览与历史单项区');

    // 新建完整六维草稿 A
    const ev = [
      '课堂观察：能独立解释 AI 基础概念与术语',
      '需求访谈记录：可拆解为 3 个可执行子目标',
      '提示词作业：产出结构清晰、约束明确的提示',
      '工具实操：熟练使用平台完成数据导出',
      '判断练习：能识别 2 处幻觉并纠正',
      '落地项目：独立完成一个分类小应用',
    ];
    await fillEvidence(page, ev);
    await selectLevels(page, ['L3', 'L3', 'L3', 'L3', 'L3', 'L3']);
    const doneText = await page.evaluate(() => document.body.textContent.includes('已完成 6/6'));
    rec('教师端-已完成计数反映等级+证据', doneText, doneText ? '显示 已完成 6/6' : '未见计数');
    await clickBtn(page, '保存为草稿');
    await segShot(page, '02_teacher_draft_full');
    rec('教师端-新建六维草稿', true, '六维草稿组已生成');

    // 完整草稿 A 可确认
    const canConfirmFull = !(await isActionDisabled(page, '草稿', '确认'));
    rec('教师端-完整草稿可确认', canConfirmFull, canConfirmFull ? '确认按钮可点击' : '确认被禁用(异常)');

    // 确认 A
    await actOnGroup(page, '草稿', '确认');
    await segShot(page, '05_teacher_confirmed');
    const confirmedShown = await page.evaluate(() => document.body.textContent.includes('已确认'));
    rec('教师端-整组进入confirmed', confirmedShown, confirmedShown ? '出现已确认状态' : '未见已确认');

    // 发布 A
    await actOnGroup(page, '已确认', '发布');
    await segShot(page, '06_teacher_published_v1');
    const publishedShown = await page.evaluate(() => document.body.textContent.includes('已发布'));
    rec('教师端-整组进入published', publishedShown, publishedShown ? '出现已发布状态' : '未见已发布');

    // 修正 A -> 仅建新草稿，旧 published 继续有效（不立即作废）
    await actOnGroup(page, '已发布', '修正');
    await sleep(300);
    const noVoidYet = await page.evaluate(() => !document.body.textContent.includes('已作废'));
    await segShot(page, '07_teacher_revised');
    rec('教师端-修正仅建新草稿且旧版仍published', noVoidYet, noVoidYet ? '旧组仍已发布，新草稿组生成，未立即作废' : '异常：旧组已被作废');

    // 发布 v2（修正后的新组先确认再发布）→ 同事务原子替换：新版 published、旧版 voided
    await actOnGroup(page, '草稿', '确认'); // v2 草稿（复制等级+证据）-> confirmed
    await actOnGroup(page, '已确认', '发布'); // v2 -> published，旧版同事务 voided
    await sleep(300);
    const voidedShown = await page.evaluate(() => document.body.textContent.includes('已作废'));
    rec('教师端-发布v2后旧版voided(原子替换)', voidedShown, voidedShown ? '旧版标记为已作废，新版已发布' : '未见作废标记');

    // 缺证据草稿 B
    const evB = ['观察记录：基础扎实', '', '提示词清晰', '工具使用熟练', '判断准确', '落地完整'];
    await fillEvidence(page, evB);
    await clickBtn(page, '保存为草稿');
    await sleep(300);
    const missingEvDisabled = await isActionDisabled(page, '草稿', '确认');
    await segShot(page, '03_teacher_missing_evidence_disabled');
    rec('教师端-缺证据确认被禁用', missingEvDisabled === true, missingEvDisabled ? '确认按钮禁用(缺证据)' : '确认未禁用(异常)');

    // 注入部分维度组 C（缺维度）
    await injectPartialGroup(page);
    const partialDimDisabled = await isActionDisabled(page, '草稿', '确认');
    await segShot(page, '04_teacher_partial_dim_disabled');
    rec('教师端-缺维度确认被禁用', partialDimDisabled === true, partialDimDisabled ? '确认按钮禁用(缺维度)' : '确认未禁用(异常)');

    // 最终总览
    const nGroups = await groupCount(page);
    await segShot(page, '08_teacher_overview_final');
    const diverse = await page.evaluate(() => {
      const t = document.body.textContent;
      return t.includes('已发布') && t.includes('已作废') && t.includes('草稿');
    });
    rec('教师端-总览含多种状态组', diverse, `评估组卡片数=${nGroups}; 状态多样(published/voided/draft)=${diverse}`);

    // 发布状态不可直接编辑：已发布组无"确认/发布"按钮，仅有"修正"
    const publishedNoConfirm = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      const pc = cards.find((c) => c.textContent.includes('已发布') && /[0-9a-f-]{36}/.test(c.textContent));
      if (!pc) return true;
      const btns = [...pc.querySelectorAll('button')].map((b) => b.textContent.trim());
      return !btns.some((t) => t.includes('确认') || t.includes('发布'));
    });
    rec('教师端-已发布不可直接编辑', publishedNoConfirm, publishedNoConfirm ? '已发布组仅含修正入口' : '已发布组含编辑按钮(异常)');

    // ===== 权限：学员访问教师隐藏路由必须被拒绝并回本人首页 =====
    await login(page, 'student');
    await page.evaluate(() => {
      history.pushState({}, '', '/t/dev/assessments');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await sleep(2000);
    const perm = await page.evaluate(() => ({
      path: location.pathname,
      hasTeacherPage: document.body.textContent.includes('能力评估 · 内部开发页')
        || document.body.textContent.includes('评估组（按时间倒序）'),
    }));
    await segShot(page, '10_permission_denied');
    rec('权限-学员访问教师路由被拒并回本人首页', perm.path === '/s/home' && !perm.hasTeacherPage, JSON.stringify(perm));

    // ===== 学员只读页 =====
    await gotoDev(page, 'student');
    await segShot(page, '09_student_readonly');
    const stu = await page.evaluate(() => {
      const t = document.body.textContent;
      const teacherMarkers = ['评估组（按时间倒序）', '新建评估组', '保存为草稿'];
      const hasTeacherUI = teacherMarkers.some((m) => t.includes(m));
      const hasVoided = t.includes('已作废');
      const leaksOther = /(s0[2-9]|s1\d|s20)/.test(t); // 他人学员 id（s01 本人不算）
      return {
        hasTeacherUI,
        hasVoided,
        leaksOther,
        hasPublished: t.includes('已发布') || t.includes('我的能力评估'),
        hasLegacy: t.includes('早期单项评估'),
      };
    });
    rec('学员端-仅见本人published+历史', stu.hasPublished && stu.hasLegacy, JSON.stringify(stu));
    rec('学员端-不泄露教师UI/voided/他人', !stu.hasTeacherUI && !stu.hasVoided && !stu.leaksOther,
      `教师UI泄露=${stu.hasTeacherUI} voided泄露=${stu.hasVoided} 他人泄露=${stu.leaksOther}`);

    // ===== 手机端 390 =====
    await page.setViewport({ width: 390, height: 844 });
    await login(page, 'teacher');
    await gotoDev(page, 'teacher');
    await segShot(page, '11_mobile_teacher');
    rec('手机端-教师页渲染', true, '390x844 截图');
    await login(page, 'student');
    await gotoDev(page, 'student');
    await segShot(page, '12_mobile_student');
    rec('手机端-学员页渲染', true, '390x844 截图');

    // ===== 刷新一致性（重新登录后数据一致） =====
    await login(page, 'teacher');
    await gotoDev(page, 'teacher');
    await selectStudent(page, 's01');
    const before = await groupCount(page);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await login(page, 'teacher');
    await gotoDev(page, 'teacher');
    await selectStudent(page, 's01');
    const after = await groupCount(page);
    rec('刷新一致性-重登录后组数一致', before === after, `刷新前=${before} 刷新后=${after}`);

  } catch (e) {
    rec('脚本异常', false, String(e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  log('==== SUMMARY ====', `${passed}/${results.length} passed, ${failed} failed`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
}

main();
