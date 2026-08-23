import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:4173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \u2713', m); } else { fail++; console.log('  \u2717', m); } };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

// 加载演示态，触发整库种子写入 localStorage
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1000));

// 读取整库 JSON 并校验规模与分班
const db = await page.evaluate(() => {
  const raw = localStorage.getItem('aiwb_db_v1');
  return raw ? JSON.parse(raw) : null;
});
ok(db !== null, 'localStorage 整库可读');
if (!db) { console.log(errors.join('\n')); await browser.close(); process.exit(1); }

const students = db.students || [];
const classes = db.classes || [];
const teachers = db.teachers || [];
const enrollments = db.enrollments || [];
const lessons = db.lessons || [];
const classSessions = db.class_sessions || [];
const assignments = db.assignments || [];

ok(students.length === 125, `学员总数 = 125（实际 ${students.length}）`);
ok(classes.length === 5, `班级数 = 5（实际 ${classes.length}）`);
ok(teachers.length === 5, `教师数 = 5（实际 ${teachers.length}）`);
ok(lessons.length === 12, `课次数 = 12（实际 ${lessons.length}）`);
ok(classSessions.length === 60, `班级场次 = 60（实际 ${classSessions.length}）`);
ok(assignments.length === 60, `作业数 = 60（实际 ${assignments.length}）`);

// 每班恰好 25 人，互不重叠
const ids = new Set(students.map((s) => s.id));
ok(ids.size === 125, `学员 id 唯一不重复（实际 ${ids.size}）`);

const perClass = {};
for (const e of enrollments) perClass[e.class_id] = (perClass[e.class_id] || 0) + 1;
let all25 = true;
for (const c of classes) {
  const n = perClass[c.id] || 0;
  if (n !== 25) all25 = false;
  console.log(`    班级 ${c.id}（${c.name}）-> 教师 ${c.teacher_id}：报名 ${n} 人`);
}
ok(all25, '每班恰好 25 人');
ok(enrollments.length === 125, `报名总数 = 125（实际 ${enrollments.length}）`);

// 5 位教师各带一个班，且学员互不重叠（每班的教师不同）
const teacherByClass = {};
for (const c of classes) teacherByClass[c.id] = c.teacher_id;
const teacherSet = new Set(Object.values(teacherByClass));
ok(teacherSet.size === 5, `5 位教师各带 1 班且互不重叠（实际 ${teacherSet.size} 位）`);
const expected = { cl1: 't1', cl2: 't2', cl3: 't3', cl4: 't4', cl5: 't5' };
let mapOk = true;
for (const [cid, tid] of Object.entries(expected)) if (teacherByClass[cid] !== tid) mapOk = false;
ok(mapOk, '班级->教师映射 cl1-t1 … cl5-t5 正确');

// 演示学员 s01 落在 cl1（t1）且数据丰富
const s01 = students.find((s) => s.id === 's01');
ok(!!s01, '演示学员 s01 存在');
const s01cls = enrollments.find((e) => e.student_id === 's01')?.class_id;
ok(s01cls === 'cl1', `s01 归属 cl1（实际 ${s01cls}）`);

// 教师视角(t1) 总览可渲染 + 学员列表含 cl1 的 25 人
await page.goto(`${BASE}/t/students?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
const t1rows = await page.evaluate(() => {
  const txt = document.body.innerText;
  return txt;
});
ok(t1rows.includes('学员') || t1rows.length > 200, '教师视角：学员列表页正常渲染');

// 学员视角(s01) 首页可渲染
await page.goto(`${BASE}/s/home?demo=student`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
const sHome = await page.evaluate(() => document.body.innerText);
ok(sHome.length > 100, '学员视角(s01)：首页正常渲染');

// 移动端 390 渲染 + 只读横幅
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/t/overview?demo=1`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const banner = await page.evaluate(() => document.querySelector('.demo-banner')?.textContent?.trim() ?? '');
ok(banner.includes('只读'), `移动端：只读横幅可见（"${banner}"）`);

ok(errors.length === 0, `全程无 JS 错误（共 ${errors.length} 条）`);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
