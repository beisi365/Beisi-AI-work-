#!/usr/bin/env node
/**
 * gen-cl2-cl5-examples.mjs（一次性工具）
 * -------------------------------------
 * 生成 cl2-cl5 共 100 名「示例占位」学员（中文名 + 基础画像），写入
 * src/data/studentOverrides.cl2-cl5.json，由 seed.ts 的 applyStudentOverrides 在
 * 种子生成时按学号覆盖 students 表基础字段。
 *
 * 用途：在资料库尚未填写 cl2-cl5 真实学员前，先用结构化示例数据填满，
 * 消除「学员26 / 学员27」这类占位名，让演示/试用时五个班都显得真实。
 * 待用户在资料库填写真实数据后，扩展 sync-library-students.mjs 支持多班，
 * 即可覆盖本示例文件（格式兼容，字段一致）。
 *
 * 注意：仅覆盖基础档案（nickname/age_range/occupation/self_intro/class_id），
 * 不生成学习记录/出勤/作品（那些由 seed 按类别自动产出，属演示数据）。
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/studentOverrides.cl2-cl5.json');

// 与 src/data/seed.ts 的 inferCat 逐字同步：前 17 位分段不变，n>=18 走周期
function inferCat(id) {
  const n = Number(id.replace(/\D/g, ''));
  if (n <= 8) return 'normal';
  if (n <= 13) return 'behind';
  if (n <= 17) return 'progress';
  const cycle = ['strong', 'strong', 'strong', 'normal', 'normal', 'normal', 'behind', 'progress'];
  return cycle[(n - 18) % cycle.length];
}

// 常用中文姓氏（确定性选字，避免每次运行不一致）
const SURNAMES = [
  '王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗',
  '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹',
  '彭', '曾', '萧', '田', '董', '袁', '潘', '于', '蒋', '蔡',
  '余', '杜', '叶', '程', '苏', '魏', '吕', '丁', '任', '沈',
  '姚', '卢', '傅', '钟', '姜', '崔', '谭', '廖', '范', '汪',
  '陆', '金', '石', '戴', '贾', '韦', '夏', '邱', '方', '侯',
  '邹', '熊', '孟', '秦', '白', '江', '阎', '薛', '尹', '段',
];

// 名字用字（单字 + 双字后缀），组合产生多样姓名
const G1 = [
  '伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋',
  '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚',
  '文', '辉', '俊', '婷', '雪', '倩', '璐', '晨', '宇', '浩',
  '欣', '悦', '梓', '涵', '睿', '萱', '诺', '航', '轩', '瑞',
  '嘉', '宁', '然', '熙', '泽', '宸', '乐', '可', '予', '知',
];
const G2 = [
  '琪', '瑶', '琳', '瑶', '彤', '怡', '菲', '蕾', '蕊', '萌',
  '露', '颖', '彤', '雯', '婷', '璇', '珊', '琳', '琼', '瑾',
];

// 班级 → 职业池（贴合各班专长方向）
const OCC = {
  cl2: ['摄影师', '视频剪辑师', '平面设计师', '短视频创作者', '自媒体博主', '插画师', '电商美工', '影视后期', '动画设计师', '视觉设计师'],
  cl3: ['行政主管', '办公室文员', '企业培训师', '项目经理', '销售经理', 'HR 专员', '财务专员', '市场专员', '总裁助理', '运营助理'],
  cl4: ['运营经理', '产品经理', '连续创业者', '独立开发者', '数据分析师', '自动化工程师', '电商运营', '内容运营', '流程优化师', 'IT 支持'],
  cl5: ['教研员', '职业规划师', '教育咨询师', '学员家长', '课程设计师', '学习教练', '社区运营', '公益组织者', '心理咨询师', '生涯顾问'],
};

// 班级 → 自我介绍模板
const INTRO = {
  cl2: '日常做{occ}，想用 AI 提升图像与视频创作效率，{goal}。',
  cl3: '日常工作大量使用 Office，想用 AI 提速 PPT 与数据处理，{goal}。',
  cl4: '对智能体与自动化工作流感兴趣，想用 AI 搭建自动化流程提效，{goal}。',
  cl5: '关注学习路径与成长规划，想用 AI 辅助教研与学员陪伴，{goal}。',
};

const students = [];
for (let i = 26; i <= 125; i++) {
  const sid = `s${i.toString().padStart(2, '0')}`;
  const cls = ['cl1', 'cl2', 'cl3', 'cl4', 'cl5'][Math.floor((i - 1) / 25)];
  const cat = inferCat(sid);
  const sur = SURNAMES[i % SURNAMES.length];
  const g1 = G1[(i * 7) % G1.length];
  const g2 = i % 3 === 0 ? G2[(i * 13) % G2.length] : '';
  const nickname = sur + g1 + g2;
  const age_range = cat === 'strong' ? '25-34' : cat === 'behind' ? '45-54' : '35-44';
  const occ = OCC[cls][i % OCC[cls].length];
  const goal =
    cat === 'strong' ? '并希望向团队推广' : cat === 'behind' ? '先掌握基础操作' : '真正用起来提效';
  const self_intro = INTRO[cls].replace('{occ}', occ).replace('{goal}', goal);
  students.push({
    student_id: sid,
    nickname,
    age_range,
    occupation: occ,
    self_intro,
    class_id: cls,
  });
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _comment:
        '【示例占位数据】由 scripts/gen-cl2-cl5-examples.mjs 生成，非真实学员。待资料库填写 cl2-cl5 真实学员后，扩展 sync-library-students.mjs 支持多班即可覆盖本文件（字段兼容）。',
      students,
    },
    null,
    2,
  ) + '\n',
  'utf-8',
);
console.log(`[gen] 已生成 ${students.length} 名示例学员 → ${OUT}`);
