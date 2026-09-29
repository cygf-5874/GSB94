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

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_VARINT_BYTES = 10;

export class VarintScanner {
  constructor() {
    this._chunks = [];
    this._offset = 0;
    this._ended = false;
    // 当前正在累积的 varint 状态（跨 feed / next 调用保留）。
    this._value = 0n;
    this._shift = 0n;
    this._byteCount = 0;
  }

  /**
   * 喂入一段字节。
   * @param {Uint8Array} chunk
   */
  feed(chunk) {
    if (this._ended) {
      throw new VarintError('feed() after end()');
    }
    if (!(chunk instanceof Uint8Array)) {
      throw new VarintError('chunk must be a Uint8Array');
    }
    if (chunk.length > 0) {
      this._chunks.push(chunk);
    }
  }

  /**
   * 取下一个解出的数值。
   * @returns {{ value: number|bigint|undefined, done: boolean }}
   */
  next() {
    for (;;) {
      const chunk = this._chunks[0];
      if (chunk === undefined) {
        return { value: undefined, done: true };
      }
      if (this._offset >= chunk.length) {
        this._chunks.shift();
        this._offset = 0;
        continue;
      }
      const byte = chunk[this._offset];
      this._offset += 1;
      this._byteCount += 1;
      if (this._byteCount > MAX_VARINT_BYTES) {
        throw new VarintError('varint exceeds 10 bytes');
      }
      this._value |= BigInt(byte & 0x7f) << this._shift;
      if ((byte & 0x80) !== 0) {
        this._shift += 7n;
        continue;
      }
      if (this._byteCount > 1 && byte === 0x00) {
        throw new VarintError('non-canonical varint encoding');
      }
      const value = this._value;
      this._value = 0n;
      this._shift = 0n;
      this._byteCount = 0;
      return {
        value: value <= MAX_SAFE_BIGINT ? Number(value) : value,
        done: false,
      };
    }
  }

  /**
   * 声明数据流已结束。
   */
  end() {
    if (this._ended) {
      return;
    }
    this._ended = true;
    // 排空残余字节，确认缓冲里没有被切断的 varint。
    for (;;) {
      if (this.next().done) break;
    }
    if (this._byteCount > 0) {
      throw new VarintError('end() with incomplete varint in buffer');
    }
  }
}

export { VarintError };
