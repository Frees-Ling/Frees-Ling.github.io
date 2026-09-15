export const site = {
  name: 'Frees Blog',
  owner: 'Frees Ling',
  alias: '凛风',
  description: '在代码、智能与生活之间，记录仍在生长的想法。',
  url: 'https://frees-ling.dev',
  email: 'freesling496@gmail.com',
  qq: '3805999686',
  repo: 'Frees-Ling/Frees-Ling.github.io',
};

export const nav = [
  { href: '/', label: '首页' },
  { href: '/blog/', label: '文章' },
  { href: '/projects/', label: '项目' },
  { href: '/research/', label: '研究' },
  { href: '/music/', label: '音乐' },
  { href: '/notes/', label: '随笔' },
  { href: '/about/', label: '关于' },
];

export const socials = [
  { label: 'GitHub', href: 'https://github.com/Frees-Ling' },
  { label: 'X / Twitter', href: 'https://x.com/LingFrees23428' },
  { label: 'Telegram', href: 'https://t.me/Frees_Ling_bot' },
  { label: 'Bilibili', href: 'https://space.bilibili.com/1066292128' },
];

export const projects = [
  {
    name: 'Mahjong AI',
    type: '研究工程',
    status: '持续研究',
    year: '2026',
    description: '围绕日麻决策、RankEV 与统计证据构建可复查的研究流程。',
    tags: ['AI', 'Decision Making', 'Mahjong'],
    accent: 'cyan',
  },
  {
    name: 'Frees Blog',
    type: '个人网站',
    status: '正在生长',
    year: '2026',
    description: '一座收纳技术文章、项目、音乐和生活片段的私人数字花园。',
    tags: ['Astro', 'Design', 'Writing'],
    accent: 'coral',
  },
  {
    name: 'Computer Vision Notes',
    type: '知识档案',
    status: '公开记录',
    year: '2025—2026',
    description: '从 YOLO 训练、数据标注到反馈图表分析的一组实践笔记。',
    tags: ['YOLO', 'Python', 'Vision'],
    accent: 'violet',
  },
  {
    name: 'Robotics Playground',
    type: '机器人实验',
    status: '探索中',
    year: '2026',
    description: '关于 Unitree Go2、控制系统与真实设备交互的实验记录。',
    tags: ['Robotics', 'Linux', 'Control'],
    accent: 'lime',
  },
];

export const researchTracks = [
  {
    index: '01',
    title: '麻将 AI 与决策系统',
    state: 'Researching',
    text: '关注策略质量、统计可信度和可复现实验，而不只看单一准确率。',
  },
  {
    index: '02',
    title: '机器学习的几何直觉',
    state: 'Writing',
    text: '从线性代数、注意力机制和 Transformer 的结构重新理解模型。',
  },
  {
    index: '03',
    title: '机器人与视觉',
    state: 'Building',
    text: '把目标检测、数据工程与真实硬件控制连接成可以运行的系统。',
  },
];

export const nowItems = [
  { label: '正在研究', value: '麻将 AI 的评估方法与证据链' },
  { label: '正在构建', value: 'Frees Blog 的下一阶段内容体系' },
  { label: '正在学习', value: '更可靠的模型推理与工程实践' },
  { label: '正在创作', value: '音乐、角色印象曲与声音实验' },
];
