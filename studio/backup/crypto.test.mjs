// 备份加密测试（KB-010）。
//
// 加密是「错了就等于没做」的那类代码：功能测试全绿也可能毫无保护。
// 因此这里的用例偏向**攻击视角** —— 篡改、重放、错口令、弱口令。

import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

import {
  encrypt,
  decrypt,
  assertPassphrase,
  MAGIC,
  MIN_PASSPHRASE_LENGTH,
} from './crypto.mjs';

const GOOD = 'correct horse battery staple';

test('往返：加密后能解回原文', () => {
  const plain = Buffer.from('三层模型：档案 / 记忆 / 知识库', 'utf8');
  const back = decrypt(encrypt(plain, GOOD), GOOD);
  assert.deepEqual(back, plain);
});

test('能处理任意二进制内容（空、含 0 字节、较大）', () => {
  for (const size of [0, 1, 1024, 200_000]) {
    const plain = randomBytes(size);
    assert.deepEqual(
      decrypt(encrypt(plain, GOOD), GOOD),
      plain,
      `size=${size}`,
    );
  }
});

test('同一份明文两次加密得到不同密文', () => {
  // 否则「这两次备份内容相同」本身就成了泄露的信息
  const plain = Buffer.from('一样的内容');
  const a = encrypt(plain, GOOD);
  const b = encrypt(plain, GOOD);
  assert.notDeepEqual(a, b);
  assert.deepEqual(decrypt(a, GOOD), decrypt(b, GOOD));
});

test('口令错误时明确失败，而不是解出乱码', () => {
  const packed = encrypt(Buffer.from('秘密'), GOOD);
  assert.throws(() => decrypt(packed, 'wrong passphrase here'), /解密失败/);
});

test('密文被篡改一个字节即失败', () => {
  const packed = encrypt(Buffer.from('秘密内容'), GOOD);
  for (const pos of [10, 40, packed.length - 5, packed.length - 1]) {
    const tampered = Buffer.from(packed);
    tampered[pos] ^= 0x01;
    assert.throws(
      () => decrypt(tampered, GOOD),
      /解密失败|不是有效的|文件头/,
      `位置 ${pos}`,
    );
  }
});

test('文件头被改也失败（不会误判格式）', () => {
  const packed = encrypt(Buffer.from('x'), GOOD);
  const bad = Buffer.from(packed);
  MAGIC.copy(bad, 0);
  bad[0] ^= 0xff;
  assert.throws(() => decrypt(bad, GOOD), /不是本程序的加密备份/);
});

test('截断的文件被拒绝而不是解出半截内容', () => {
  const packed = encrypt(Buffer.from('一'.repeat(100)), GOOD);
  assert.throws(() => decrypt(packed.subarray(0, 20), GOOD), /过短/);
  assert.throws(
    () => decrypt(packed.subarray(0, packed.length - 10), GOOD),
    /解密失败/,
  );
});

test('拒绝过短口令并说明原因', () => {
  assert.throws(() => assertPassphrase('1234567'), /至少 12 个字符/);
  assert.throws(() => assertPassphrase(''), /不能为空/);
  assert.throws(() => assertPassphrase(undefined), /不能为空/);
  assert.equal(MIN_PASSPHRASE_LENGTH, 12);
});

test('加密与解密都强制校验口令强度', () => {
  assert.throws(() => encrypt(Buffer.from('x'), 'short'), /至少 12 个字符/);
  const packed = encrypt(Buffer.from('x'), GOOD);
  assert.throws(() => decrypt(packed, 'short'), /至少 12 个字符/);
});

test('文件头含版本与 KDF 参数，便于将来识别旧格式', () => {
  const packed = encrypt(Buffer.from('x'), GOOD);
  assert.deepEqual(packed.subarray(0, 8), MAGIC);
  assert.equal(packed.readUInt8(8), 1, '格式版本');
  assert.equal(packed.readUInt32BE(9), 32768, 'scrypt N 应写入头部');
});

test('头部参数被篡改会导致派生出的密钥不同，从而认证失败', () => {
  // 这验证的是「参数确实参与了密钥派生」，而不是被忽略
  const packed = encrypt(Buffer.from('内容'), GOOD);
  const bad = Buffer.from(packed);
  bad.writeUInt32BE(1024, 9); // 改小 N
  assert.throws(() => decrypt(bad, GOOD), /解密失败/);
});
