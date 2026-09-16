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

/**
 * 一级导航。标签用拉丁大写是有意的编辑/技术语域选择 ——
 * 它把站点的「档案 / 索引」气质直接写进框架，且与 FIELD LOG 的命名一致。
 * 中文标题放在 title 上，兼顾可理解性。
 *
 * URL 一律保持现有路径（见 docs/information-architecture.md）：
 * WORK 指向 /projects/、NOTES 指向 /blog/，不新增 /work/ 或 /notes/ 路由 ——
 * GitHub Pages 不支持服务端重定向，新增路由会产生 404 或重定向页。
 */
export const nav = [
  { href: '/', label: '首页', title: '首页' },
  { href: '/projects/', label: '项目', title: '项目' },
  { href: '/blog/', label: '文章', title: '文章' },
  { href: '/archive/', label: '归档', title: '归档' },
  { href: '/about/', label: '关于', title: '关于' },
];

/** 页脚承载的低频页面 —— 与一级导航互补，两者合计覆盖全站，不留孤岛。 */
export const secondaryNav = [
  // research 与 notes 在五区导航里并入 WORK / NOTES 标签之下，
  // 但作为独立页面仍然存在，必须在页脚可到达 —— 否则成为孤儿页。
  { href: '/topics/', label: '主题', latin: 'TOPICS' },
  { href: '/research/', label: '研究', latin: 'RESEARCH' },
  { href: '/notes/', label: '随笔', latin: 'NOTES' },
  { href: '/friends/', label: '朋友们', latin: 'FRIENDS' },
  { href: '/now/', label: '此刻', latin: 'NOW' },
  { href: '/music/', label: '声音', latin: 'MUSIC' },
  { href: '/gallery/', label: '相册', latin: 'GALLERY' },
  { href: '/guestbook/', label: '留言板', latin: 'GUESTBOOK' },
  { href: '/history/', label: '历史', latin: 'HISTORY' },
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
  },
  {
    name: 'Frees Blog',
    type: '个人网站',
    status: '正在生长',
    year: '2026',
    description: '一座收纳技术文章、项目、音乐和生活片段的私人数字花园。',
    tags: ['Astro', 'Design', 'Writing'],
  },
  {
    name: 'Computer Vision Notes',
    type: '知识档案',
    status: '公开记录',
    year: '2025—2026',
    description: '从 YOLO 训练、数据标注到反馈图表分析的一组实践笔记。',
    tags: ['YOLO', 'Python', 'Vision'],
  },
  {
    name: 'Robotics Playground',
    type: '机器人实验',
    status: '探索中',
    year: '2026',
    description: '关于 Unitree Go2、控制系统与真实设备交互的实验记录。',
    tags: ['Robotics', 'Linux', 'Control'],
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
