// 备份加密（KB-010）。
//
// ── 为什么必须是 AEAD ──
//
// 用 AES-CBC 加密而不加认证，攻击者可以在不知道密钥的情况下翻转密文比特，
// 让解密结果产生可预测的改变 —— 而解密方**看不出被动过**。
// 对备份尤其致命：备份的全部价值在于「需要它时它是对的」。
// 因此用 AES-256-GCM：篡改任何一个字节都会导致认证失败。
//
// ── 为什么口令不落盘 ──
//
// 加密备份的意义在于「文件泄露了也没关系」。若把口令与密文放在一起、
// 或写进日志与 argv，这个意义就没有了。
// 口令只能由调用方在运行时提供（环境变量或交互输入）。
//
// 密钥派生用 scrypt：它有意的内存硬化，比 PBKDF2 更能抵抗 GPU 暴力破解。

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const MAGIC = Buffer.from('FREESBK1'); // 8 字节，便于将来识别格式
export const FORMAT_VERSION = 1;

// scrypt 参数。N 越大越难暴力破解，也越慢。
// N=2^15 在普通笔记本上约 100ms —— 对「偶尔做一次备份」完全可接受，
// 对暴力破解则是 32768 倍的成本。
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32 };

/**
 * scrypt 的内存上限参数。
 *
 * Node 默认 maxmem 是 32MB，而 scrypt 需要 128 × N × r 字节 ——
 * N=32768, r=8 恰好就是 32MB，正好越界，报
 * 「memory limit exceeded」。必须显式给足。
 *
 * 按参数算出所需内存再留一倍余量：解密时也要用同一套算法，
 * 否则将来调参后的旧备份会解不开。
 */
function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

function scryptMaxmem({ N, r }) {
  return 128 * N * r * 2;
}

const SALT_BYTES = 16;
const IV_BYTES = 12; // GCM 推荐 96 位
const TAG_BYTES = 16;

/**
 * 口令强度下限。
 *
 * 加密备份的安全性最终取决于口令。这里拒绝明显过短的口令 ——
 * 一个 4 位口令的备份，加密与否区别不大，但会给人「已经加密了」的错觉，
 * 而错误的安心比没有加密更危险。
 */
export const MIN_PASSPHRASE_LENGTH = 12;

export function assertPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('备份口令不能为空');
  }
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `备份口令至少 ${MIN_PASSPHRASE_LENGTH} 个字符（当前 ${passphrase.length}）。` +
        '加密备份的安全性最终取决于口令。',
    );
  }
}

/**
 * 加密。
 *
 * 每次调用都生成新的盐与 IV —— 同一份明文两次加密必须得到不同密文，
 * 否则「这两次备份内容相同」本身就成了泄露的信息。
 */
export function encrypt(plaintext, passphrase) {
  assertPassphrase(passphrase);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(passphrase, salt, SCRYPT.keylen, {
    ...SCRYPT,
    maxmem: scryptMaxmem(SCRYPT),
  });

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // 头部记录 KDF 参数：将来调参或换算法时，旧备份仍能被正确解开
  const header = Buffer.alloc(
    MAGIC.length + 1 + 4 + 4 + 4 + SALT_BYTES + IV_BYTES,
  );
  let o = 0;
  MAGIC.copy(header, o);
  o += MAGIC.length;
  header.writeUInt8(FORMAT_VERSION, o);
  o += 1;
  header.writeUInt32BE(SCRYPT.N, o);
  o += 4;
  header.writeUInt32BE(SCRYPT.r, o);
  o += 4;
  header.writeUInt32BE(SCRYPT.p, o);
  o += 4;
  salt.copy(header, o);
  o += SALT_BYTES;
  iv.copy(header, o);

  return Buffer.concat([header, tag, body]);
}

/**
 * 解密。口令错误或密文被篡改都会抛出 —— 而不是返回一段乱码。
 *
 * 「静默返回垃圾」是加密实现里最危险的失败模式：
 * 调用方无从判断解出来的是什么，可能把它当真数据用下去。
 */
export function decrypt(packed, passphrase) {
  assertPassphrase(passphrase);
  const buf = Buffer.isBuffer(packed) ? packed : Buffer.from(packed);

  const headerLen = MAGIC.length + 1 + 12 + SALT_BYTES + IV_BYTES;
  if (buf.length < headerLen + TAG_BYTES) {
    throw new Error('备份文件过短，不是有效的加密备份');
  }
  if (!timingSafeEqual(buf.subarray(0, MAGIC.length), MAGIC)) {
    throw new Error('不是本程序的加密备份（文件头不匹配）');
  }

  const version = buf.readUInt8(MAGIC.length);
  if (version > FORMAT_VERSION) {
    throw new Error(
      `备份格式版本 ${version} 高于本程序支持的 ${FORMAT_VERSION}`,
    );
  }

  let o = MAGIC.length + 1;
  const params = {
    N: buf.readUInt32BE(o),
    r: buf.readUInt32BE(o + 4),
    p: buf.readUInt32BE(o + 8),
  };
  o += 12;
  const salt = buf.subarray(o, o + SALT_BYTES);
  o += SALT_BYTES;
  const iv = buf.subarray(o, o + IV_BYTES);
  o += IV_BYTES;
  const tag = buf.subarray(o, o + TAG_BYTES);
  o += TAG_BYTES;

  // 头部参数来自文件，而文件可能被篡改或损坏。
  // 不校验直接交给 scrypt，会抛出 Node 的原始错误（如
  // 「Invalid scrypt params」），调用方无从判断这是「口令错」还是「文件坏了」。
  // 实测踩过：篡改 N 字段后抛的就是这个。
  if (
    !isPowerOfTwo(params.N) ||
    params.N < 1024 ||
    params.r < 1 ||
    params.p < 1
  ) {
    throw new Error('解密失败：备份文件的密钥派生参数不合法（文件可能已损坏）');
  }
  let key;
  try {
    key = scryptSync(passphrase, salt, SCRYPT.keylen, {
      ...params,
      maxmem: scryptMaxmem(params),
    });
  } catch {
    throw new Error('解密失败：无法从备份文件派生密钥（文件可能已损坏）');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(buf.subarray(o)), decipher.final()]);
  } catch {
    // GCM 认证失败只有两种可能：口令错，或密文被动过。
    // 不区分这两者 —— 对攻击者而言，能区分就是有用的信息。
    throw new Error('解密失败：口令不正确，或备份文件已损坏');
  }
}
