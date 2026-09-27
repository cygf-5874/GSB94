/**
 * 线上抓下来的最小复现。
 *
 * 同一段完整数据，用两种切法喂给解码器，把解出的数值序列打印出来对比。
 * 数据：两个 varint，值分别是 1 和 300。
 */
import { VarintScanner } from './src/varintscan.mjs';

const DATA = Uint8Array.from([0x01, 0xac, 0x02]);

function collect(chunks) {
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

const whole = collect([DATA]);
const sliced = collect([DATA.subarray(0, 2), DATA.subarray(2)]);

console.log(`整段喂入得到 [${whole.join(', ')}]`);
console.log(`按 2 字节切分得到 [${sliced.join(', ')}]`);

const same =
  whole.length === sliced.length && whole.every((v, i) => v === sliced[i]);

if (!same) {
  console.log('两种切法结果不一致');
  process.exit(1);
}
process.exit(0);
