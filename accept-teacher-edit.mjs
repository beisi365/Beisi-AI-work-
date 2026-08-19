// 教师编辑功能真实浏览器验收
//   * 教师数量 = 5（之前 seed 只有 2 个；已扩到 5）
//   * 教师卡片含 title 字段 + 编辑按钮
//   * 点击编辑打开 Modal 显示 4 字段
//   * 编辑保存后卡片实时更新
//   * 登录仍可点击（编辑按钮 stopPropagation 不影响登录）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const OUT = new URL('./screenshots-teacher-edit/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const pageErrors = [];
const consoleErrors = [];

try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => pageErrors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // 关键：先清空 localStorage 让 seed 重新生成（之前 2 个教师的旧数据会影响）
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // 1) 教师数量 = 5
  const teacherCount = await p.evaluate(() => {
    const cards = document.querySelectorAll('#role-teacher .hero-role-card');
    return {
      count: cards.length,
      names: [...cards].map((c) => c.querySelector('.hero-role-name')?.textContent ?? ''),
      titles: [...cards].map((c) => c.querySelector('.hero-role-title')?.textContent ?? ''),
      editBtns: document.querySelectorAll('#role-teacher .hero-role-edit').length,
    };
  });
  check('[D1] 教师卡片数量 = 5', teacherCount.count === 5, JSON.stringify(teacherCount));
  check('[D2] 每张卡片有 title + 编辑按钮', teacherCount.titles.every((t) => t.length > 0) && teacherCount.editBtns === 5, JSON.stringify({ titles: teacherCount.titles, editBtns: teacherCount.editBtns }));

  // 截图：教师列表（默认无 hover）
  await p.evaluate(() => document.getElementById('role-teacher')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await sleep(400);
  await p.screenshot({ path: OUT + '1-teachers-5.png', fullPage: false });

  // 2) hover 第 2 张卡片 → 编辑按钮可见
  const card2 = await p.$('#role-teacher .hero-role-card:nth-child(2)');
  await card2.hover();
  await sleep(300);
  const editOpacity = await p.evaluate(() => {
    const edit = document.querySelector('#role-teacher .hero-role-card:nth-child(2) .hero-role-edit');
    return edit ? getComputedStyle(edit).opacity : 'no-el';
  });
  check('[D3] hover 教师卡片 → 编辑按钮可见（opacity=1）', editOpacity === '1', `opacity=${editOpacity}`);
  await p.screenshot({ path: OUT + '2-hover-shows-edit.png', fullPage: false });

  // 3) 点击编辑 → Modal 打开
  await p.evaluate(() => document.querySelector('#role-teacher .hero-role-card:nth-child(2) .hero-role-edit')?.click());
  await sleep(500);
  const modalInfo = await p.evaluate(() => {
    const modal = document.querySelector('.modal-backdrop, .modal, [class*="modal"]');
    const titleInput = document.querySelector('input[placeholder*="AI 讲师"]');
    const subjectsInput = document.querySelector('input[placeholder*="AI写作"]');
    const allInputs = document.querySelectorAll('.modal input, .modal textarea');
    return {
      hasModal: !!modal,
      inputCount: allInputs.length,
      hasTitleInput: !!titleInput,
      hasSubjectsInput: !!subjectsInput,
      inputs: [...allInputs].map((i) => ({
        placeholder: i.placeholder,
        value: i.value,
        tagName: i.tagName,
      })),
    };
  });
  check('[D4] 点击编辑打开 Modal（4 字段：姓名/身份/教学内容/身份介绍）',
    modalInfo.hasModal && modalInfo.inputCount === 4,
    JSON.stringify({ hasModal: modalInfo.hasModal, inputCount: modalInfo.inputCount }));
  await p.screenshot({ path: OUT + '3-modal-open.png', fullPage: false });

  // 4) 修改 "身份" + "教学内容" + "身份介绍" 然后保存
  // 注意：必须用 native setter 才能触发 React 的 onChange
  const saved = await p.evaluate(async () => {
    const setReactValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const titleInput = document.querySelector('input[placeholder*="AI 讲师"]');
    const subjectsInput = document.querySelector('input[placeholder*="AI写作"]');
    const bioTextarea = document.querySelector('textarea');
    if (!titleInput || !subjectsInput || !bioTextarea) return { ok: false, reason: 'inputs not found' };
    setReactValue(titleInput, '首席视觉专家');
    setReactValue(subjectsInput, 'AI图像/视频/动画');
    setReactValue(bioTextarea, '【已编辑】8 年视觉设计，主导多部品牌短片');
    // 找保存按钮
    const btns = [...document.querySelectorAll('.modal button')];
    const saveBtn = btns.find((b) => /保存/.test(b.textContent ?? ''));
    if (!saveBtn) return { ok: false, reason: 'save btn not found' };
    saveBtn.click();
    return { ok: true };
  });
  await sleep(800);
  check('[D5] 保存操作不报错', saved.ok === true, JSON.stringify(saved));

  // 5) 验证卡片更新（关掉 modal 重新查询）
  await sleep(300);
  const updated = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#role-teacher .hero-role-card')];
    // 第二张卡片（李老师）
    const card2 = cards[1];
    if (!card2) return null;
    return {
      title: card2.querySelector('.hero-role-title')?.textContent ?? '',
      subjects: card2.querySelector('.hero-role-sub')?.textContent ?? '',
    };
  });
  check('[D6] 教师卡片实时更新（身份 + 教学内容）',
    updated && updated.title === '首席视觉专家' && updated.subjects === 'AI图像/视频/动画',
    JSON.stringify(updated));

  await p.screenshot({ path: OUT + '4-after-save.png', fullPage: false });

  // 6) 点击第一张卡片（未编辑的）→ 仍能登录
  await p.evaluate(() => document.querySelector('#role-teacher .hero-role-card:nth-child(1) .hero-role-opt')?.click());
  await sleep(800);
  const inTeacherApp = await p.evaluate(() => location.pathname.startsWith('/t/'));
  check('[D7] 教师卡片仍可登录（编辑按钮 stopPropagation 生效）', inTeacherApp, `path=${p.url()}`);

  // 7) 错误检查
  await p.close();
} catch (e) {
  console.error('SCRIPT_ERROR:', e.message);
} finally {
  await browser.close();
}

check('[ERR] 无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const appConsoleErr = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
check('[ERR] 无 console.error', appConsoleErr.length === 0, appConsoleErr.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n==== 教师编辑验收：${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(`  - ${f.name}  ${f.extra}`));
  process.exit(1);
}
console.log('ALL_ACCEPTANCE_PASS');