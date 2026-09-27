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

export class VarintScanner {
  constructor() {
    this._buf = new Uint8Array(0);
    this._i = 0;
    this._ended = false;
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
      throw new TypeError('chunk must be a Uint8Array');
    }
    this._buf = chunk;
    this._i = 0;
  }

  /**
   * 取下一个解出的数值。
   * @returns {{ value: number|bigint|undefined, done: boolean }}
   */
  next() {
    const buf = this._buf;
    if (this._i >= buf.length) {
      return { value: undefined, done: true };
    }

    let result = 0;
    let shift = 0;
    for (;;) {
      if (this._i >= buf.length) {
        return { value: result, done: false };
      }
      const byte = buf[this._i];
      this._i += 1;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        return { value: result, done: false };
      }
      shift += 7;
    }
  }

  /**
   * 声明数据流已结束。
   */
  end() {
    this._ended = true;
  }
}

export { VarintError };
