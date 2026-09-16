// 备份编排（KB-011）：快照 → 加密 → 上传 → **回读校验** → 保留策略。

import { encrypt, decrypt, assertPassphrase } from './crypto.mjs';
import { exportAll, countEntities } from '../db/portable.mjs';

/** 备份文件名：按时间排序即按时间先后，便于保留策略按名删除。 */
export function backupName(now = new Date()) {
  const iso = now.toISOString().replace(/[:.]/g, '-').replace('Z', '');
  return `frees-studio-${iso}.freesbk`;
}

/**
 * 做一次备份。
 *
 * **上传后必须回读校验**：重新下载 → 解密 → 与源数据逐项比对。
 * 只上传不校验的备份等于没有备份 —— 而人往往在需要它时才发现在上传时就已经坏了
 * （网络截断、服务端配额、编码问题都可能让文件悄悄损坏）。
 */
export async function runBackup({
  db,
  webdav,
  dir,
  passphrase,
  now = new Date(),
}) {
  assertPassphrase(passphrase);

  const snapshot = exportAll(db);
  const plaintext = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const packed = encrypt(plaintext, passphrase);
  const name = backupName(now);
  const path = `${dir.replace(/\/+$/, '')}/${name}`;

  await webdav.put(path, packed);

  // ── 回读校验 ──
  const back = await webdav.get(path);
  if (!back) {
    throw new Error(`上传后回读失败：远端没有 ${name}。备份未通过校验。`);
  }
  if (!back.equals(packed)) {
    throw new Error(`上传后回读的字节与本地不一致：${name}。备份未通过校验。`);
  }

  const restored = JSON.parse(decrypt(back, passphrase).toString('utf8'));
  const a = countEntities(snapshot);
  const b = countEntities(restored);
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) {
      throw new Error(
        `回读校验失败：${key} 数量不一致（本地 ${a[key]}，回读 ${b[key]}）`,
      );
    }
  }

  return { name, path, bytes: packed.length, verified: true, counts: a };
}

/**
 * 保留策略。**默认 dry-run**。
 *
 * 删除是不可逆的，而「保留最近 N 份」这个策略本身可能有 bug。
 * 让人先看到将要删什么，再决定是否执行。
 *
 * **永不删除最后一份**：即使策略算出来该全删（例如 N=0 或所有文件都超期），
 * 也必须至少留一份 —— 一个没有备份的系统比一个备份太多的系统危险得多。
 */
export function applyRetention({
  names,
  keep,
  dryRun = true,
  prefix = 'frees-studio-',
}) {
  const candidates = names.filter((n) => n.startsWith(prefix)).sort();
  const excess =
    candidates.length > keep
      ? candidates.slice(0, candidates.length - keep)
      : [];

  // 最后一份永不删
  const toDelete =
    candidates.length - excess.length >= 1 ? excess : excess.slice(0, -1);

  return {
    dryRun,
    total: candidates.length,
    keep,
    delete: toDelete,
    kept: candidates.filter((n) => !toDelete.includes(n)),
  };
}

export async function runRetention({
  webdav,
  dir,
  keep,
  dryRun = true,
  prefix,
}) {
  const names = await webdav.list(dir);
  const plan = applyRetention({ names, keep, dryRun, prefix });

  if (!dryRun) {
    for (const name of plan.delete) {
      await webdav.del(`${dir.replace(/\/+$/, '')}/${name}`);
    }
  }
  return plan;
}
