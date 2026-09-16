// 配置项的声明表。
//
// 单独一个文件、纯数据、无副作用：界面要渲染它、服务端要校验它、
// 测试要遍历它。放在 settings.mjs 里会和读写逻辑缠在一起，
// 而这张表最需要的是「一眼看全」—— 加配置项时得能立刻判断
// 它该是普通项还是敏感项。

/**
 * kind:
 *   'plain'  —— 直接存值
 *   'secret' —— **只存引用**，值放到环境变量或钥匙串里
 *
 * env: 环境变量名。它同时是「未在界面里设置过时的默认来源」，
 *      也是敏感项默认引用的目标。
 */
export const SETTINGS_SCHEMA = [
  {
    key: 'model.url',
    kind: 'plain',
    env: 'FREES_STUDIO_MODEL_URL',
    default: 'http://127.0.0.1:1234/v1',
    label: '对话模型端点',
    hint: '默认只允许本机地址；指向别处需要显式开启 allowRemote',
  },
  {
    key: 'model.name',
    kind: 'plain',
    env: 'FREES_STUDIO_MODEL',
    default: 'local-model',
    label: '对话模型名',
    hint: '要填 LM Studio 里实际加载的模型标识',
  },
  {
    key: 'embed.url',
    kind: 'plain',
    env: 'FREES_STUDIO_EMBED_URL',
    default: 'http://127.0.0.1:1234/v1',
    label: '嵌入端点',
    hint: '不可用时检索会降级为关键词，不会整个不可用',
  },
  {
    key: 'embed.model',
    kind: 'plain',
    env: 'FREES_STUDIO_EMBED_MODEL',
    default: 'nomic-embed-text-v1.5',
    label: '嵌入模型',
    hint: '换模型后旧向量作废，需要重算',
  },
  {
    key: 'webdav.url',
    kind: 'plain',
    env: 'FREES_WEBDAV_URL',
    default: '',
    label: 'WebDAV 地址',
    hint: '备份的目标服务地址',
  },
  {
    key: 'webdav.user',
    kind: 'plain',
    env: 'FREES_WEBDAV_USER',
    default: '',
    label: 'WebDAV 用户名',
  },
  {
    key: 'webdav.dir',
    kind: 'plain',
    env: 'FREES_WEBDAV_BACKUP_DIR',
    default: '/backups',
    label: '备份目录',
    hint: '目录要在服务端先建好；程序不会自动创建',
  },

  // ── 以下只存引用 ──
  {
    key: 'webdav.password',
    kind: 'secret',
    env: 'FREES_WEBDAV_PASSWORD',
    label: 'WebDAV 密码',
    hint: '只保存「去哪里取」，不保存密码本身',
  },
  {
    key: 'backup.passphrase',
    kind: 'secret',
    env: 'FREES_BACKUP_PASSPHRASE',
    label: '备份口令',
    hint: '备份加密的口令。丢了它，备份就解不开了',
  },
];

export const SETTING_BY_KEY = new Map(
  SETTINGS_SCHEMA.map((def) => [def.key, def]),
);
