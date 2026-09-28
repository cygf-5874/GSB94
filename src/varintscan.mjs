/**
 * varintscan —— 流式无符号 LEB128 varint 解码器。
 *
 * 用法：
 *   const s = new VarintScanner();
 *   s.feed(chunk);            // chunk 是 Uint8Array，可切成任意多段喂入
 *   for (;;) {
 *     const { value, done } = s.next();
 *     if (done) break;
 *     // value 是一个解出的数值
 *   }
 *   s.end();                  // 数据喂完时收尾
 *
 * 编码格式：小端 base-128。每个字节低 7 位是载荷，最高位为 1 表示后面还有字节，
 * 为 0 表示这是本值的最后一字节。完整规则见 README。
 */
import { VarintError } from './errors.mjs';

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_VARINT_BYTES = 10;

export class VarintScanner {
  constructor() {
    this._buf = new Uint8Array(0);
    this._pos = 0;
    this._ended = false;
  }

  /**
   * 喂入一段字节。残片会与未消费的尾部合并累积，可按任意切法喂入。
   * @param {Uint8Array} chunk
   */
  feed(chunk) {
    if (this._ended) {
      throw new VarintError('feed() after end()');
    }
    if (!(chunk instanceof Uint8Array)) {
      throw new VarintError('chunk must be a Uint8Array');
    }
    const remaining = this._buf.length - this._pos;
    if (remaining === 0 && chunk.length === 0) {
      return;
    }
    const merged = new Uint8Array(remaining + chunk.length);
    merged.set(this._buf.subarray(this._pos));
    merged.set(chunk, remaining);
    this._buf = merged;
    this._pos = 0;
  }

  /**
   * 取下一个解出的数值。当前缓冲没有完整值时返回 done 且不消费任何字节。
   * @returns {{ value: number|bigint|undefined, done: boolean }}
   */
  next() {
    const buf = this._buf;
    const start = this._pos;
    let end = start;

    for (;;) {
      if (end >= buf.length) {
        return { value: undefined, done: true };
      }
      const byteIndex = end - start;
      if (byteIndex >= MAX_VARINT_BYTES) {
        throw new VarintError('varint too long: a single varint must be at most 10 bytes');
      }
      const byte = buf[end];
      end += 1;
      if ((byte & 0x80) !== 0) {
        continue;
      }

      const length = byteIndex + 1;
      if (length >= 2 && byte === 0x00) {
        throw new VarintError('non-canonical varint: trailing zero byte in a multi-byte value');
      }
      if (length === MAX_VARINT_BYTES && (byte & 0x7f) > 0x01) {
        throw new VarintError('varint overflow: value exceeds 64 bits');
      }

      let value = 0n;
      for (let offset = 0; offset < length; offset += 1) {
        value |= BigInt(buf[start + offset] & 0x7f) << BigInt(offset * 7);
      }

      this._pos = end;
      if (this._pos === this._buf.length) {
        this._buf = new Uint8Array(0);
        this._pos = 0;
      }

      const result = value <= MAX_SAFE_INTEGER_BIGINT ? Number(value) : value;
      return { value: result, done: false };
    }
  }

  /**
   * 声明数据流已结束。缓冲区里若残留未完成的 varint 则抛 VarintError。
   */
  end() {
    this._ended = true;
    if (this._pos < this._buf.length) {
      throw new VarintError('end() with an incomplete varint left in the buffer');
    }
  }
}

export { VarintError };
