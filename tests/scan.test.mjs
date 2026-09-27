import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { VarintScanner } from '../src/varintscan.mjs';

/** 把一组整数按小端 base-128 编成字节序列（仅用于构造测试输入）。 */
function enc(...values) {
  const out = [];
  for (const v of values) {
    let x = BigInt(v);
    for (;;) {
      const b = Number(x & 0x7fn);
      x >>= 7n;
      if (x === 0n) {
        out.push(b);
        break;
      }
      out.push(b | 0x80);
    }
  }
  return Uint8Array.from(out);
}

/** 按给定分段喂入，收集所有解出的数值。 */
function scan(chunks) {
  const s = new VarintScanner();
  const out = [];
  for (const c of chunks) {
    s.feed(c);
    for (;;) {
      const r = s.next();
      if (r.done) break;
      out.push(r.value);
    }
  }
  return out;
}

test('单字节 0x00 -> 0', () => {
  assert.deepEqual(scan([enc(0)]), [0]);
});

test('单字节 0x7f -> 127', () => {
  assert.deepEqual(scan([enc(127)]), [127]);
});

test('两字节 128 -> 128', () => {
  assert.deepEqual(scan([enc(128)]), [128]);
});

test('两字节 300 -> 300', () => {
  assert.deepEqual(scan([enc(300)]), [300]);
});

test('三字节 16384 -> 16384', () => {
  assert.deepEqual(scan([enc(16384)]), [16384]);
});

test('四字节 2097152 -> 2097152', () => {
  assert.deepEqual(scan([enc(2097152)]), [2097152]);
});

test('五字节 268435456 -> 268435456', () => {
  assert.deepEqual(scan([enc(268435456)]), [268435456]);
});

test('八字节 Number.MAX_SAFE_INTEGER -> 9007199254740991', () => {
  assert.deepEqual(scan([enc(9007199254740991)]), [9007199254740991]);
});

test('一段数据中的多个值顺次解出', () => {
  const data = enc(0, 1, 127, 128, 300, 16384, 4294967295);
  assert.deepEqual(scan([data]), [0, 1, 127, 128, 300, 16384, 4294967295]);
});

test('空数据 next 返回 done', () => {
  const s = new VarintScanner();
  assert.deepEqual(s.next(), { value: undefined, done: true });
});

test('先喂空 chunk 再喂数据', () => {
  const s = new VarintScanner();
  s.feed(new Uint8Array(0));
  s.feed(enc(300));
  assert.equal(s.next().value, 300);
  assert.equal(s.next().done, true);
});

test('切点落在值边界上的分块喂入', () => {
  const a = enc(0, 300);
  const b = enc(16384);
  assert.deepEqual(scan([a, b]), [0, 300, 16384]);
});

test('两轮 feed，中间把上一轮解完', () => {
  const s = new VarintScanner();
  s.feed(enc(1, 2, 3));
  assert.deepEqual(
    [s.next().value, s.next().value, s.next().value],
    [1, 2, 3],
  );
  assert.equal(s.next().done, true);
  s.feed(enc(4, 5));
  assert.deepEqual([s.next().value, s.next().value], [4, 5]);
});

test('Buffer 入参', () => {
  assert.deepEqual(scan([Buffer.from(enc(300, 16384))]), [300, 16384]);
});

test('解出的值都是 number，且缓冲区排空后 end() 正常', () => {
  const s = new VarintScanner();
  s.feed(enc(0, 1, 127, 128, 300, 16384));
  const seen = [];
  for (;;) {
    const r = s.next();
    if (r.done) break;
    assert.equal(typeof r.value, 'number');
    seen.push(r.value);
  }
  assert.deepEqual(seen, [0, 1, 127, 128, 300, 16384]);
  s.end();
});
