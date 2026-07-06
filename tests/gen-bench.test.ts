import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/core/levels";
import { generate } from "../src/core/generator";
import { mulberry32 } from "../src/core/rng";

// 生成性能闸门(规格 §2.3):GEN_BENCH=1 时对 21-50 关跑 5 种子,单盘最坏 <500ms。
// vitest 吞 console,结果写 gen-bench.tmp.txt,查看后删除。
const RUN = !!process.env["GEN_BENCH"];

describe.skipIf(!RUN)("生成性能矩阵(21-50)", () => {
  for (const level of LEVELS.filter((l) => l.id >= 21)) {
    it(
      `L${level.id} ${level.width}x${level.height} ${level.mines} 雷:5 种子单盘 <500ms`,
      () => {
        const first =
          Math.floor(level.height / 2) * level.width + Math.floor(level.width / 2);
        let worst = 0;
        for (const seed of [1, 2, 3, 4, 5]) {
          const t0 = performance.now();
          generate(level, first, mulberry32(seed));
          worst = Math.max(worst, performance.now() - t0);
        }
        appendFileSync("gen-bench.tmp.txt", `L${level.id} worst=${worst.toFixed(0)}ms\n`);
        expect(worst).toBeLessThan(500);
      },
      30000,
    );
  }
});
