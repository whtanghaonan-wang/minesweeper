# 扫雷 v2.1 实施计划(点击修复 / 50 关 / 音效 / 首界面)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 PC 左键吞点击;关卡扩至 50 关十档;五种木质柔和音效;藤蔓延伸式游戏首界面;发布 v2.1.0。

**Architecture:** 命中判定从 DOM 目标改为几何吸附纯函数(viewport.ts);音效为 Web Audio 实时合成模块(ui/audio.ts,零素材);首页是新屏 ui/home.ts,main.ts 路由变为 home ↔ menu ↔ game;关卡表纯数据扩展并用不变式测试 + 生成性能闸门锁定。

**Tech Stack:** TypeScript strict + Vite + vitest(jsdom)+ Tauri 2。无新依赖。

**规格:** `docs/superpowers/specs/2026-07-05-v2.1-design.md`(执行前先读)

## Global Constraints

- 分支:在 main(基线 73cc6b0)上建 `v2.1-update`,所有任务在该分支提交。
- 每个提交都以 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 结尾(空行后)。
- 1-20 关参数逐字节不动(generator.test.ts SPEC_TABLE 已锁,不许改这 20 行)。
- 棋盘几何常量必须保持 px:BASE_CELL_PX=40、CELL_GAP=3、BOARD_PAD=10;禁止 rem 化。
- `TOUCH_SLOP_PX = 10` 不许改(长按判定依赖)。
- 音效合成参数照 §Task 4 逐字实现——用户已试听拍板,禁止"优化"数值。
- TDD:先写失败测试再实现;每任务结束 `npm test` 全绿 + `npx tsc --noEmit` 干净。
- 新 shell 跑 cargo/tauri 前先刷新 PATH(见 Task 9);构建后 `src-tauri/Cargo.toml` 出现 M 是 EOL 噪音,`git restore` 即可,勿提交。
- vitest 会吞 console.log;基准数据一律写临时文件(见 GEN_BENCH)。

---

### Task 1: 关卡表 21-50 + 全仓 20→50 涟漪 + 生成性能闸门

**Files:**
- Modify: `src/core/levels.ts`(Tier/TIER_NAMES/LEVELS 扩展)
- Modify: `src/ui/style.css`(:root 新五色 + .tier-* 五类)
- Modify: `src/ui/menu.ts:23`(文案)
- Modify: `tests/levels.test.ts`(整文件重写)
- Modify: `tests/generator.test.ts`(长度 50、TIER_NAMES 十档、SEEDS 新档)
- Modify: `tests/vine.test.ts`(50 节点、10 段)
- Modify: `tests/storage.test.ts`(解锁上限 50)
- Modify: `tests/ui.test.ts`(50 节点、文案、色带数)
- Create: `tests/gen-bench.test.ts`(GEN_BENCH 门控性能矩阵)
- Modify: `.gitignore`(追加两行临时文件)

**Interfaces:**
- Produces: `Tier` 联合新增 `"inferno" | "umbra" | "void" | "chaos" | "finale"`;`LEVELS.length === 50`;`TIER_NAMES` 十项。后续任务(首页 x/50、存档 MAX_LEVEL=50)全部依赖。

- [ ] **Step 1: 重写 tests/levels.test.ts(失败测试)**

整文件替换为:

```ts
import { describe, expect, it } from "vitest";
import { LEVELS, TIER_NAMES, type Tier } from "../src/core/levels";

const OLD_TIERS: Tier[] = ["easy", "challenge", "hard", "expert", "abyss"];
const NEW_TIERS: Tier[] = ["inferno", "umbra", "void", "chaos", "finale"];
const cells = (i: number): number => LEVELS[i]!.width * LEVELS[i]!.height;
const density = (i: number): number => (LEVELS[i]!.mines / cells(i)) * 100;

describe("v2 关卡设计律(1-20,规格 §1.2 不变)", () => {
  it("前 20 关结构不变:每档 4 关、档序连续、编号连续", () => {
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
    for (const t of OLD_TIERS) expect(LEVELS.filter((l) => l.tier === t)).toHaveLength(4);
    expect(LEVELS.slice(0, 20).map((l) => l.tier)).toEqual(OLD_TIERS.flatMap((t) => [t, t, t, t]));
  });

  it("1-20 档内密度严格递增、档间跳变 ≥0.9pp、限时不减", () => {
    for (let i = 1; i < 20; i++) {
      if (LEVELS[i]!.tier === LEVELS[i - 1]!.tier) {
        expect(density(i)).toBeGreaterThan(density(i - 1));
      } else {
        expect(density(i) - density(i - 1)).toBeGreaterThanOrEqual(0.9);
      }
      expect(LEVELS[i]!.timeLimitSec).toBeGreaterThanOrEqual(LEVELS[i - 1]!.timeLimitSec);
    }
  });
});

describe("v2.1 关卡设计律(21-50,规格 §2.2)", () => {
  it("共 50 关,新五档各 6 关、档序连续", () => {
    expect(LEVELS).toHaveLength(50);
    for (const t of NEW_TIERS) expect(LEVELS.filter((l) => l.tier === t)).toHaveLength(6);
    expect(LEVELS.slice(20).map((l) => l.tier)).toEqual(
      NEW_TIERS.flatMap((t) => [t, t, t, t, t, t]),
    );
  });

  it("盘面格数与雷数严格递增(含与第 20 关衔接),竖版 h≥w", () => {
    for (let i = 20; i < 50; i++) {
      expect(cells(i)).toBeGreaterThan(cells(i - 1));
      expect(LEVELS[i]!.mines).toBeGreaterThan(LEVELS[i - 1]!.mines);
      expect(LEVELS[i]!.height).toBeGreaterThanOrEqual(LEVELS[i]!.width);
    }
  });

  it("密度带 [22.1, 23.2]、全部高于第 20 关、档均值严格递增", () => {
    for (let i = 20; i < 50; i++) {
      expect(density(i)).toBeGreaterThan(density(19));
      expect(density(i)).toBeGreaterThanOrEqual(22.1);
      expect(density(i)).toBeLessThanOrEqual(23.2);
    }
    const mean = (t: Tier): number => {
      const idx = LEVELS.map((l, i) => (l.tier === t ? i : -1)).filter((i) => i >= 0);
      return idx.reduce((s, i) => s + density(i), 0) / idx.length;
    };
    const means = NEW_TIERS.map(mean);
    expect(means[0]!).toBeGreaterThan(mean("abyss"));
    for (let k = 1; k < means.length; k++) expect(means[k]!).toBeGreaterThan(means[k - 1]!);
  });

  it("限时 21-50 严格递增,末关 1800s", () => {
    for (let i = 20; i < 50; i++) {
      expect(LEVELS[i]!.timeLimitSec).toBeGreaterThan(LEVELS[i - 1]!.timeLimitSec);
    }
    expect(LEVELS[49]!.timeLimitSec).toBe(1800);
  });

  it("十档名称齐全", () => {
    expect(TIER_NAMES).toEqual({
      easy: "简单",
      challenge: "挑战",
      hard: "困难",
      expert: "专家",
      abyss: "深渊",
      inferno: "炼狱",
      umbra: "幽冥",
      void: "虚空",
      chaos: "混沌",
      finale: "终焉",
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/levels.test.ts`
Expected: FAIL(长度 50、新档名等断言不满足)

- [ ] **Step 3: 扩展 levels.ts**

`src/core/levels.ts` 第 1 行 Tier 类型替换为:

```ts
export type Tier =
  | "easy"
  | "challenge"
  | "hard"
  | "expert"
  | "abyss"
  | "inferno"
  | "umbra"
  | "void"
  | "chaos"
  | "finale";
```

`TIER_NAMES` 替换为:

```ts
export const TIER_NAMES: Record<Tier, string> = {
  easy: "简单",
  challenge: "挑战",
  hard: "困难",
  expert: "专家",
  abyss: "深渊",
  inferno: "炼狱",
  umbra: "幽冥",
  void: "虚空",
  chaos: "混沌",
  finale: "终焉",
};
```

`LEVELS` 数组:1-20 行一字不动,第 20 关行后追加(注释也抄):

```ts
  // ===== v2.1 新五档(规格 §2.2):格数/雷数严格递增,密度 22.1%→23.2% 带内缓升,
  // 限时 930s 起每关 +30s 至 1800s;任何调整必须通过 levels.test 不变式与 GEN_BENCH 闸门 =====
  { id: 21, tier: "inferno", width: 21, height: 34, mines: 158, timeLimitSec: 930 },
  { id: 22, tier: "inferno", width: 21, height: 35, mines: 163, timeLimitSec: 960 },
  { id: 23, tier: "inferno", width: 21, height: 36, mines: 168, timeLimitSec: 990 },
  { id: 24, tier: "inferno", width: 22, height: 35, mines: 171, timeLimitSec: 1020 },
  { id: 25, tier: "inferno", width: 22, height: 36, mines: 176, timeLimitSec: 1050 },
  { id: 26, tier: "inferno", width: 22, height: 37, mines: 182, timeLimitSec: 1080 },
  { id: 27, tier: "umbra", width: 23, height: 36, mines: 185, timeLimitSec: 1110 },
  { id: 28, tier: "umbra", width: 23, height: 37, mines: 190, timeLimitSec: 1140 },
  { id: 29, tier: "umbra", width: 23, height: 38, mines: 196, timeLimitSec: 1170 },
  { id: 30, tier: "umbra", width: 24, height: 37, mines: 199, timeLimitSec: 1200 },
  { id: 31, tier: "umbra", width: 23, height: 39, mines: 202, timeLimitSec: 1230 },
  { id: 32, tier: "umbra", width: 24, height: 38, mines: 205, timeLimitSec: 1260 },
  { id: 33, tier: "void", width: 24, height: 39, mines: 211, timeLimitSec: 1290 },
  { id: 34, tier: "void", width: 25, height: 38, mines: 215, timeLimitSec: 1320 },
  { id: 35, tier: "void", width: 26, height: 37, mines: 218, timeLimitSec: 1350 },
  { id: 36, tier: "void", width: 25, height: 39, mines: 221, timeLimitSec: 1380 },
  { id: 37, tier: "void", width: 26, height: 38, mines: 224, timeLimitSec: 1410 },
  { id: 38, tier: "void", width: 25, height: 40, mines: 227, timeLimitSec: 1440 },
  { id: 39, tier: "chaos", width: 26, height: 39, mines: 231, timeLimitSec: 1470 },
  { id: 40, tier: "chaos", width: 26, height: 40, mines: 237, timeLimitSec: 1500 },
  { id: 41, tier: "chaos", width: 27, height: 39, mines: 241, timeLimitSec: 1530 },
  { id: 42, tier: "chaos", width: 26, height: 41, mines: 244, timeLimitSec: 1560 },
  { id: 43, tier: "chaos", width: 27, height: 40, mines: 248, timeLimitSec: 1590 },
  { id: 44, tier: "chaos", width: 27, height: 41, mines: 254, timeLimitSec: 1620 },
  { id: 45, tier: "finale", width: 28, height: 40, mines: 258, timeLimitSec: 1650 },
  { id: 46, tier: "finale", width: 27, height: 42, mines: 261, timeLimitSec: 1680 },
  { id: 47, tier: "finale", width: 28, height: 41, mines: 265, timeLimitSec: 1710 },
  { id: 48, tier: "finale", width: 28, height: 42, mines: 272, timeLimitSec: 1740 },
  { id: 49, tier: "finale", width: 28, height: 43, mines: 279, timeLimitSec: 1770 },
  { id: 50, tier: "finale", width: 28, height: 44, mines: 285, timeLimitSec: 1800 },
```

- [ ] **Step 4: 跑 levels 测试**

Run: `npx vitest run tests/levels.test.ts`
Expected: PASS(6 用例全绿)

- [ ] **Step 5: 涟漪修复——其余测试与源码中的"20/五档"假设**

`tests/generator.test.ts`:
- `expect(LEVELS).toHaveLength(20)` → `toHaveLength(50)`;该用例名 `"20 关配置与设计文档一致"` → `"前 20 关配置与 v2 设计文档一致(逐字节锁定)"`(SPEC_TABLE 本体与 forEach 断言不动)。
- `"五档名称齐全"` 用例的期望对象替换为与 Step 1 十档版本完全相同的对象,用例名改 `"十档名称齐全"`。
- `SEEDS` 定义补全新档(控制测试时长,新档种子少):

```ts
  const SEEDS: Record<Tier, number[]> = {
    easy: [1, 2, 3, 4, 5],
    challenge: [1, 2, 3, 4, 5],
    hard: [1, 2, 3],
    expert: [1, 2],
    abyss: [1, 2],
    inferno: [1, 2],
    umbra: [1, 2],
    void: [1],
    chaos: [1],
    finale: [1],
  };
```

`tests/vine.test.ts`:
- `expect(L.nodes).toHaveLength(20)` → `toHaveLength(50)`。
- 段序断言替换为:

```ts
    expect(L.segments.map((s) => s.tier)).toEqual([
      "easy", "challenge", "hard", "expert", "abyss",
      "inferno", "umbra", "void", "chaos", "finale",
    ]);
```

- 段长断言(旧 5/4 两行)替换为:

```ts
    // 每段 = 本档节点 + 下一档首节点(末段除外):旧档 4+1,新档 6+1,末段 6
    expect(L.segments[0]!.points).toHaveLength(5);
    expect(L.segments[4]!.points).toHaveLength(5);
    expect(L.segments[5]!.points).toHaveLength(7);
    expect(L.segments[9]!.points).toHaveLength(6);
```

`tests/storage.test.ts` 用例 `"第 20 关不解锁 21"` 整体替换为:

```ts
  it("第 50 关不解锁 51", () => {
    const s = createStorage(memBackend());
    expect(s.recordWin(1, 60).unlocked).toBe(2);
    expect(s.load().unlockedLevel).toBe(2);
    expect(s.recordWin(1, 50).unlocked).toBe(null);
    for (let l = 2; l <= 49; l++) expect(s.recordWin(l, 60).unlocked).toBe(l + 1);
    expect(s.recordWin(50, 60).unlocked).toBe(null);
    expect(s.load().unlockedLevel).toBe(50);
  });
```

`tests/ui.test.ts` 选关页第一个用例:
- 用例名 `"渲染 20 个藤蔓节点..."` → `"渲染 50 个藤蔓节点,仅第 1 关可玩,其余锁定"`;
- `expect(nodes).toHaveLength(20)` → `toHaveLength(50)`;`for (let i = 1; i < 20; i++)` → `i < 50`;
- `expect(root.querySelector(".menu-sub")!.textContent).toContain("二十关")` → `toContain("五十关")`;
- 色带断言注释与数字:`toBeGreaterThanOrEqual(6); // 底线+5 档色带` → `toBeGreaterThanOrEqual(11); // 底线+10 档色带`。

`src/ui/menu.ts:23` 文案:`无猜 · 二十关 · 五档` → `无猜 · 五十关 · 十档`。

`src/ui/style.css`::root 内(`--abyss: #7a9cc4;` 行后)追加:

```css
  --inferno: #c4766a;
  --umbra: #6ba3a0;
  --void: #7a7fc4;
  --chaos: #b87aa8;
  --finale: #6e6a80;
```

`.tier-abyss { ... }` 块后追加:

```css
.tier-inferno {
  --tier-color: var(--inferno);
}
.tier-umbra {
  --tier-color: var(--umbra);
}
.tier-void {
  --tier-color: var(--void);
}
.tier-chaos {
  --tier-color: var(--chaos);
}
.tier-finale {
  --tier-color: var(--finale);
}
```

- [ ] **Step 6: 新建 tests/gen-bench.test.ts(性能矩阵,GEN_BENCH 门控)**

```ts
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
```

`.gitignore` 追加两行(若无):

```
gen-stats.tmp.txt
gen-bench.tmp.txt
```

- [ ] **Step 7: 全量测试**

Run: `npm test`
Expected: 全绿(gen-bench 无 GEN_BENCH 环境变量时整组 skip)

- [ ] **Step 8: 性能闸门(硬性)**

Run(PowerShell): `$env:GEN_BENCH="1"; npx vitest run tests/gen-bench.test.ts; Remove-Item Env:GEN_BENCH`
Expected: 30 用例全 PASS。看一眼 `gen-bench.tmp.txt` 把最坏三关数值记进任务报告,然后 `Remove-Item gen-bench.tmp.txt`。

**若有关卡 ≥500ms**:该关雷数 -1 至 -3 重试;仍超则把该关 (w,h) 换成表中前一关尺寸、雷数改为 `round(格数 × 前一关密度%)`,并顺延调整后续关保证 levels.test 不变式全绿;重跑 Step 4/7/8 至全绿,把改动理由写入任务报告。

- [ ] **Step 9: tsc + 提交**

Run: `npx tsc --noEmit`(干净)

```bash
git add src/core/levels.ts src/ui/style.css src/ui/menu.ts tests/levels.test.ts tests/generator.test.ts tests/vine.test.ts tests/storage.test.ts tests/ui.test.ts tests/gen-bench.test.ts .gitignore
git commit -m "feat: 关卡扩至 50 关十档(新五档 + 生成性能闸门)"
```

---

### Task 2: viewport.ts 几何吸附 hitCell + 鼠标容差 8px

**Files:**
- Modify: `src/ui/viewport.ts`
- Modify: `tests/viewport.test.ts`

**Interfaces:**
- Produces: `export const BOARD_PAD = 10; export const CELL_GAP = 3;`(从 game.ts 迁来);`export const MOUSE_SLOP_PX = 8;`;`export function hitCell(px: number, py: number, v: ViewState, cols: number, rows: number): number | null` —— 视口坐标 → 视觉格索引(row*cols+col),缝隙/边缘 ≤2px 吸附,界外 null。Task 3 消费。

- [ ] **Step 1: 写失败测试(tests/viewport.test.ts 追加)**

文件顶部 import 增加 `hitCell`(加进现有 import 列表)。文件末尾追加:

```ts
describe("hitCell 几何吸附(v2.1 规格 §1.2)", () => {
  const V = { scale: 1, tx: 0, ty: 0 };
  // 棋盘坐标:内边距 10,格 40,缝 3,栅距 43

  it("格内命中:行列换算正确", () => {
    expect(hitCell(30, 30, V, 8, 8)).toBe(0); // 盘面(20,20) ∈ 格(0,0)
    expect(hitCell(10 + 43 + 20, 10 + 2 * 43 + 20, V, 8, 8)).toBe(17); // 列1行2
    expect(hitCell(10 + 7 * 43 + 39, 10 + 7 * 43 + 39, V, 8, 8)).toBe(63); // 末格右下角
  });

  it("缝隙吸附:距哪格近归哪格(缝宽 3 全覆盖)", () => {
    expect(hitCell(51.5, 30, V, 8, 8)).toBe(0); // 盘面 x=41.5,距格0右缘 1.5
    expect(hitCell(52.6, 30, V, 8, 8)).toBe(1); // 盘面 x=42.6,距格1左缘 0.4
    expect(hitCell(30, 51.5, V, 8, 8)).toBe(0); // 纵向缝隙同理
  });

  it("边距吸附 ≤2px,更深处返回 null", () => {
    expect(hitCell(9, 30, V, 8, 8)).toBe(0); // 盘面 x=-1,吸附首列
    expect(hitCell(7, 30, V, 8, 8)).toBeNull(); // 盘面 x=-3,超容差
    const right = 10 + 7 * 43 + 40; // 末列右缘的视口 x=351
    expect(hitCell(right + 2, 30, V, 8, 8)).toBe(7);
    expect(hitCell(right + 3, 30, V, 8, 8)).toBeNull();
  });

  it("缩放/平移变换下反算正确", () => {
    // 盘面点(30,30)=格0中心,view scale2 tx-40 ty-40 → 视口(20,20)
    expect(hitCell(20, 20, { scale: 2, tx: -40, ty: -40 }, 8, 8)).toBe(0);
    // 同一视口点在未平移 scale2 下 → 盘面坐标 x=20/2-10=0,恰在格0左缘(格内命中)
    expect(hitCell(20, 20, { scale: 2, tx: 0, ty: 0 }, 8, 8)).toBe(0);
  });

  it("完全界外返回 null", () => {
    expect(hitCell(-50, 30, V, 8, 8)).toBeNull();
    expect(hitCell(30, 9999, V, 8, 8)).toBeNull();
  });
});
```

再在手势状态机 describe 内追加一条(阈值改 8 的行为锁定):

```ts
  it("鼠标:7px 位移仍是点按(阈值 8px)", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: false, button: 0 });
    expect(g.handle({ type: "move", id: 1, x: 107, y: 100 })).toEqual([]);
    expect(types(g.handle({ type: "up", id: 1, x: 107, y: 100 }))).toEqual(["tap"]);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/viewport.test.ts`
Expected: FAIL(hitCell 未导出;7px 用例因阈值 4 而 pan)

- [ ] **Step 3: 实现**

`src/ui/viewport.ts`:`export const MOUSE_SLOP_PX = 4;` → `export const MOUSE_SLOP_PX = 8;`

`MAX_CELL_PX` 导出行后追加:

```ts
export const BOARD_PAD = 10;
export const CELL_GAP = 3;
const PITCH = BASE_CELL_PX + CELL_GAP;
const SNAP_PX = 2; // 缝隙/边缘吸附容差(盘面坐标系)

/** 视口坐标 → 视觉格索引:格内直接命中;缝隙与边缘 ≤SNAP_PX 吸附最近格;其余 null(留给平移)。
 *  缝宽 3 < 2×SNAP_PX+1,任何缝隙点必然吸附,命中死区为零(v2.1 设计文档 §1.2) */
export function hitCell(
  px: number,
  py: number,
  v: ViewState,
  cols: number,
  rows: number,
): number | null {
  const col = nearestIndex((px - v.tx) / v.scale - BOARD_PAD, cols);
  const row = nearestIndex((py - v.ty) / v.scale - BOARD_PAD, rows);
  if (col === null || row === null) return null;
  return row * cols + col;
}

function nearestIndex(z: number, count: number): number | null {
  const i = Math.min(count - 1, Math.max(0, Math.floor(z / PITCH)));
  if (z >= i * PITCH - SNAP_PX && z <= i * PITCH + BASE_CELL_PX + SNAP_PX) return i;
  if (i + 1 < count && (i + 1) * PITCH - z <= SNAP_PX) return i + 1;
  return null;
}
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/viewport.test.ts`
Expected: PASS(既有 slop 用例引用 MOUSE_SLOP_PX 符号,自动适配 8)

- [ ] **Step 5: 全量 + tsc + 提交**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿、干净(game.ts 本任务未动,仍用其本地常量)

```bash
git add src/ui/viewport.ts tests/viewport.test.ts
git commit -m "feat: 几何吸附命中 hitCell 与鼠标容差 8px"
```

---

### Task 3: game.ts 换用几何命中(消灭缝隙死区)

**Files:**
- Modify: `src/ui/game.ts`
- Modify: `tests/ui.test.ts`

**Interfaces:**
- Consumes: `hitCell/BOARD_PAD/CELL_GAP`(Task 2)。
- Produces: 挖格命中完全由坐标决定,DOM 目标仅用于测试定位;`press()` 测试助手变为坐标制(后续任务的 ui 测试都用它)。

- [ ] **Step 1: 更新测试助手 + 写失败测试**

`tests/ui.test.ts` 中 `press` 函数整体替换为(命中已按坐标计算,必须从格索引反推坐标;第 1 关竖屏 8×8,栅距 43、内边距 10、格心 +20):

```ts
/** 模拟一次完整点按/拖动:down →(可选 move)→ up。jsdom 无 PointerEvent,用 MouseEvent 冒充。
 *  v2.1 起命中按坐标几何计算,坐标从 data-i 反推(8×8 竖屏,内边距10 栅距43 格心+20) */
const GRID_W = 8;
function cellPoint(el: Element): { x: number; y: number } {
  const i = Number((el as HTMLElement).dataset["i"]);
  return { x: 10 + (i % GRID_W) * 43 + 20, y: 10 + Math.floor(i / GRID_W) * 43 + 20 };
}
function press(
  el: Element,
  opts: { button?: number; dx?: number; dy?: number; touch?: boolean } = {},
): void {
  const { button = 0, dx = 0, dy = 0, touch = false } = opts;
  const p = cellPoint(el);
  const fire = (type: string, x: number, y: number): void => {
    const e = new MouseEvent(type, { bubbles: true, button, clientX: x, clientY: y });
    Object.defineProperty(e, "pointerType", { value: touch ? "touch" : "mouse" });
    el.dispatchEvent(e);
  };
  fire("pointerdown", p.x, p.y);
  if (dx !== 0 || dy !== 0) fire("pointermove", p.x + dx, p.y + dy);
  fire("pointerup", p.x + dx, p.y + dy);
}
```

`"触摸长按 = 反模式"` 用例中两处裸 `clientX: 100, clientY: 100` 都改成第 7 格坐标 `clientX: 331, clientY: 30`(7 号格:10+7×43+20=331,行 0:30)。

游戏页 describe 追加三个新用例:

```ts
  it("点在格间缝隙:吸附最近格照常挖开(死区清零)", () => {
    start();
    const vp = root.querySelector<HTMLElement>(".board-viewport")!;
    // (51.5, 331):x 在 0/1 列缝隙上,y 在第 7 行格心 → 应吸附挖开 56 号格
    const fire = (type: string, x: number, y: number): void => {
      const e = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
      Object.defineProperty(e, "pointerType", { value: "mouse" });
      vp.dispatchEvent(e);
    };
    fire("pointerdown", 51.5, 331);
    fire("pointerup", 51.5, 331);
    expect(root.querySelectorAll(".cell.open").length).toBeGreaterThan(0);
  });

  it("鼠标 7px 抖动仍算点击(阈值 8px)", () => {
    const cells = start();
    press(cells[63]!, { dx: 7 });
    expect(root.querySelectorAll(".cell.open").length).toBeGreaterThan(0);
  });

  it("鼠标移动 8px 转平移,不挖格", () => {
    const cells = start();
    press(cells[63]!, { dx: -8 });
    expect(root.querySelectorAll(".cell.open")).toHaveLength(0);
    expect(root.querySelector<HTMLElement>(".board")!.style.transform).toBe(
      "translate(-8px, 0px) scale(1)",
    );
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL(缝隙用例:cellIndex 按 DOM 目标返回 null 不挖)

- [ ] **Step 3: 改 game.ts**

1. import 行:从 `./viewport` 的导入列表中追加 `BOARD_PAD, CELL_GAP, hitCell`;
2. 删除本地常量两行 `const BOARD_PAD = 10;` 与 `const CELL_GAP = 3;`(第 42-43 行);
3. pointerdown 监听器改为(用坐标几何求 downCellVi):

```ts
  boardVp.addEventListener("pointerdown", (e) => {
    const p = vpPoint(e);
    downCellVi = hitCell(p.x, p.y, view, w, h);
    boardVp.setPointerCapture?.(pid(e));
    run(gestures.handle({ type: "down", id: pid(e), x: p.x, y: p.y, touch: isTouch(e), button: e.button }));
  });
```

4. 删除整个 `cellIndex` 函数(`function cellIndex(target ...)` 到其闭括号);`c.dataset["i"] = String(i);` 保留(测试反推坐标用)。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/ui.test.ts`
Expected: PASS(全部既有 + 3 新用例)

- [ ] **Step 5: 全量 + tsc + 提交**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/ui/game.ts tests/ui.test.ts
git commit -m "fix: 挖格命中改几何吸附,消灭缝隙死区与吞点击"
```

---

### Task 4: ui/audio.ts 木质柔和五音效(Web Audio 合成)

**Files:**
- Create: `src/ui/audio.ts`
- Create: `tests/audio.test.ts`

**Interfaces:**
- Produces: `unlock(): void`(首次手势惰性建 AudioContext)、`setMuted(b: boolean): void`、`isMuted(): boolean`、`playBlank/playNumber/playBoom/playWin/playLose(): void`、`_resetForTest(): void`。Task 6/7/8 消费。合成参数用户已试听拍板,禁改。

- [ ] **Step 1: 写失败测试 tests/audio.test.ts**

```ts
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTest,
  isMuted,
  playBlank,
  playBoom,
  playLose,
  playNumber,
  playWin,
  setMuted,
  unlock,
} from "../src/ui/audio";

/* 最小 AudioContext 桩:计数振荡器/噪声源,不出声 */
const param = () => ({ setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
class FakeCtx {
  static instances: FakeCtx[] = [];
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  state = "running";
  resume = vi.fn();
  oscs: { type: string; started: boolean }[] = [];
  noises = 0;
  constructor() {
    FakeCtx.instances.push(this);
  }
  createOscillator() {
    const rec = { type: "", started: false };
    this.oscs.push(rec);
    return {
      get type() { return rec.type; },
      set type(v: string) { rec.type = v; },
      frequency: param(),
      connect: vi.fn().mockReturnValue({}),
      start: () => { rec.started = true; },
      stop: vi.fn(),
    };
  }
  createGain() { return { gain: param(), connect: vi.fn() }; }
  createBiquadFilter() { return { type: "", frequency: param(), connect: vi.fn() }; }
  createBufferSource() {
    this.noises++;
    return { buffer: null, connect: vi.fn(), start: vi.fn() };
  }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
}

beforeEach(() => {
  FakeCtx.instances = [];
  _resetForTest();
  vi.stubGlobal("AudioContext", FakeCtx as unknown as typeof AudioContext);
});
afterEach(() => vi.unstubAllGlobals());

describe("audio 木质柔和五音效", () => {
  it("unlock 惰性创建且只创建一次;未 unlock 前播放静默无异常", () => {
    playBlank(); // ctx 为 null,不抛
    expect(FakeCtx.instances).toHaveLength(0);
    unlock();
    unlock();
    expect(FakeCtx.instances).toHaveLength(1);
  });

  it("五种音效的振荡器/噪声源数量与波形符合参数表", () => {
    unlock();
    const c = FakeCtx.instances[0]!;
    playBlank(); // sine×2 + 噪声×1
    expect(c.oscs).toHaveLength(2);
    expect(c.oscs.every((o) => o.type === "sine" && o.started)).toBe(true);
    expect(c.noises).toBe(1);
    playNumber(); // sine×2
    expect(c.oscs).toHaveLength(4);
    playBoom(); // 噪声×1 + sine×1(降调)
    expect(c.noises).toBe(2);
    expect(c.oscs).toHaveLength(5);
    playWin(); // triangle 琶音×4
    expect(c.oscs).toHaveLength(9);
    expect(c.oscs.slice(5).every((o) => o.type === "triangle")).toBe(true);
    playLose(); // triangle 下行×3
    expect(c.oscs).toHaveLength(12);
  });

  it("静音时不产生任何节点;取消静音恢复", () => {
    unlock();
    const c = FakeCtx.instances[0]!;
    setMuted(true);
    expect(isMuted()).toBe(true);
    playBlank();
    playBoom();
    playWin();
    expect(c.oscs).toHaveLength(0);
    expect(c.noises).toBe(0);
    setMuted(false);
    playNumber();
    expect(c.oscs).toHaveLength(2);
  });

  it("环境无 AudioContext 时 unlock 安静降级", () => {
    vi.unstubAllGlobals();
    _resetForTest();
    expect(() => {
      unlock();
      playWin();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/audio.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 src/ui/audio.ts**

```ts
// 五种音效的 Web Audio 实时合成(v2.1 设计文档 §3,A·木质柔和)——零素材文件。
// 参数经用户试听拍板,修改前必须重新走试听确认。
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(b: boolean): void {
  muted = b;
}

export function isMuted(): boolean {
  return muted;
}

/** 首次用户手势时调用:创建/恢复 AudioContext(浏览器自动播放策略要求) */
export function unlock(): void {
  if (ctx === null && typeof AudioContext !== "undefined") ctx = new AudioContext();
  if (ctx !== null && ctx.state === "suspended") void ctx.resume();
}

/** 仅测试用:重置模块态 */
export function _resetForTest(): void {
  ctx = null;
  muted = false;
}

function env(g: GainNode, t: number, dur: number, peak: number): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(
  freq: number,
  type: OscillatorType,
  dur: number,
  peak: number,
  when = 0,
  bendTo?: number,
): void {
  if (muted || ctx === null) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (bendTo !== undefined) o.frequency.exponentialRampToValueAtTime(bendTo, t + dur);
  env(g, t, dur, peak);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, peak: number, when: number, lp: number, lpEnd?: number): void {
  if (muted || ctx === null) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(lp, t);
  if (lpEnd !== undefined) f.frequency.exponentialRampToValueAtTime(lpEnd, t + dur);
  const g = ctx.createGain();
  env(g, t, dur, peak);
  src.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  src.start(t);
}

/** 挖到空白格(连锁展开) */
export function playBlank(): void {
  tone(520, "sine", 0.09, 0.22);
  tone(1040, "sine", 0.05, 0.06);
  noise(0.03, 0.06, 0, 1200);
}

/** 挖到数字格 */
export function playNumber(): void {
  tone(760, "sine", 0.08, 0.2);
  tone(1520, "sine", 0.04, 0.05);
}

/** 触雷爆炸 */
export function playBoom(): void {
  noise(0.5, 0.5, 0, 900, 120);
  tone(90, "sine", 0.4, 0.5, 0, 45);
}

/** 通关 */
export function playWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, "triangle", 0.16, 0.18, i * 0.09));
}

/** 失败 */
export function playLose(): void {
  [392, 311, 262].forEach((f, i) => tone(f, "triangle", 0.22, 0.2, i * 0.16));
}
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/audio.test.ts`
Expected: PASS

- [ ] **Step 5: 全量 + tsc + 提交**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/ui/audio.ts tests/audio.test.ts
git commit -m "feat: Web Audio 木质柔和五音效模块"
```

---

### Task 5: 存档记忆音效开关 soundOn

**Files:**
- Modify: `src/core/storage.ts`
- Modify: `tests/storage.test.ts`

**Interfaces:**
- Produces: `SaveData` 增必填 `soundOn: boolean`(缺省 true,version 仍为 2,不迁移);`GameStorage` 增 `setSoundOn(on: boolean): boolean`(返回是否持久化成功)。Task 6/7 消费。

- [ ] **Step 1: 写失败测试(tests/storage.test.ts 追加 + 既有期望补字段)**

既有用例中所有 `toEqual({ version: 2, unlockedLevel: ..., bestTimes: ... })` 形式的完整对象断言,都在对象里补 `soundOn: true`(共三处:空档默认、损坏 JSON 回退、版本 99 回退用例若用 toEqual 也同理;只改期望对象,不改语义)。文件末尾追加:

```ts
describe("soundOn 音效开关持久化(v2.1)", () => {
  it("缺省为 true(老 v2 档无此字段也回 true)", () => {
    expect(createStorage(memBackend()).load().soundOn).toBe(true);
    const old = memBackend({
      [SAVE_KEY]: '{"version":2,"unlockedLevel":3,"bestTimes":{"1":50}}',
    });
    const s = createStorage(old);
    expect(s.load().soundOn).toBe(true);
    expect(s.load().unlockedLevel).toBe(3);
  });

  it("setSoundOn 持久化,新实例读回;非法值回退 true", () => {
    const backend = memBackend();
    const s = createStorage(backend);
    expect(s.setSoundOn(false)).toBe(true);
    expect(s.load().soundOn).toBe(false);
    expect(createStorage(backend).load().soundOn).toBe(false);
    const bad = createStorage(
      memBackend({ [SAVE_KEY]: '{"version":2,"unlockedLevel":1,"bestTimes":{},"soundOn":"yes"}' }),
    );
    expect(bad.load().soundOn).toBe(true);
  });

  it("setSoundOn 不动进度与成绩;recordWin 不动 soundOn", () => {
    const backend = memBackend();
    const s = createStorage(backend);
    s.recordWin(1, 77);
    s.setSoundOn(false);
    expect(s.load().bestTimes[1]).toBe(77);
    expect(s.load().unlockedLevel).toBe(2);
    s.recordWin(2, 88);
    expect(s.load().soundOn).toBe(false);
  });

  it("v1 迁移后 soundOn 为 true", () => {
    const s = createStorage(
      memBackend({ [SAVE_KEY]: '{"version":1,"unlockedLevel":5,"bestTimes":{"1":60}}' }),
    );
    expect(s.load().soundOn).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL(类型无 soundOn / setSoundOn 不存在)

- [ ] **Step 3: 实现**

`src/core/storage.ts`:

1. `SaveData` 接口:`bestTimes` 行后加 `soundOn: boolean;`
2. `GameStorage` 接口:`recordWin` 行后加 `setSoundOn(on: boolean): boolean;`
3. `defaults()`:返回对象补 `soundOn: true`。
4. `readFields()`:`bestTimes` 校验块后追加:

```ts
  if (typeof r["soundOn"] === "boolean") d.soundOn = r["soundOn"];
```

5. `createStorage` 返回对象:`recordWin` 后追加方法:

```ts
    setSoundOn(on) {
      return save({ ...data, bestTimes: { ...data.bestTimes }, soundOn: on });
    },
```

(v1 迁移分支无需改动:`defaults()` 已带 `soundOn: true`。)

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS

- [ ] **Step 5: 全量 + tsc + 提交**

Run: `npm test && npx tsc --noEmit`(ui.test 用 toMatchObject/字段断言,不受新字段影响)

```bash
git add src/core/storage.ts tests/storage.test.ts
git commit -m "feat: 存档记忆音效开关 soundOn(缺省开,免迁移)"
```

---

### Task 6: 游戏首界面 ui/home.ts(B·藤蔓延伸式)

**Files:**
- Create: `src/ui/home.ts`
- Modify: `src/ui/style.css`(文件末尾追加首页段)
- Create: `tests/home.test.ts`

**Interfaces:**
- Consumes: `GameStorage.load()/setSoundOn`(Task 5)、`setMuted`(Task 4)、`vineLayout` 不用(首页藤蔓是独立装饰 SVG)。
- Produces: `export interface HomeDeps { storage: GameStorage; version: string; onContinue(level: LevelSpec): void; onSelect(): void; }`、`export function showHome(root: HTMLElement, deps: HomeDeps): void`。Task 7 消费。

- [ ] **Step 1: 写失败测试 tests/home.test.ts**

```ts
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVELS, type LevelSpec } from "../src/core/levels";
import { createStorage } from "../src/core/storage";
import { showHome } from "../src/ui/home";
import { setMuted } from "../src/ui/audio";

vi.mock("../src/ui/audio", () => ({ setMuted: vi.fn() }));

function memBackend() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function show(storage = createStorage(memBackend()), over: Partial<Parameters<typeof showHome>[1]> = {}) {
  const played: LevelSpec[] = [];
  let selected = 0;
  showHome(root, {
    storage,
    version: "9.9.9-test",
    onContinue: (l) => played.push(l),
    onSelect: () => selected++,
    ...over,
  });
  return { played, get selected() { return selected; }, storage };
}

describe("首页", () => {
  it("新档:开始游戏·第 1 关,进度 0/50,最快 —,版本号显示", () => {
    const t = show();
    expect(root.querySelector("h1")!.textContent).toBe("扫雷");
    expect(root.querySelector(".home-play")!.textContent).toContain("开始游戏 · 第 1 关");
    expect(root.querySelector(".home-stats")!.textContent).toContain("0/50");
    expect(root.querySelector(".home-stats")!.textContent).toContain("—");
    expect(root.querySelector(".home-ver")!.textContent).toBe("v9.9.9-test");
    (root.querySelector(".home-play") as HTMLButtonElement).click();
    expect(t.played.map((l) => l.id)).toEqual([1]);
  });

  it("进行中:继续·第 N 关,进度/最快取最高已通关成绩", () => {
    const storage = createStorage(memBackend());
    storage.recordWin(1, 83);
    storage.recordWin(2, 45);
    const t = show(storage);
    expect(root.querySelector(".home-play")!.textContent).toContain("继续 · 第 3 关");
    expect(root.querySelector(".home-stats")!.textContent).toContain("2/50");
    expect(root.querySelector(".home-stats")!.textContent).toContain("0:45"); // 最高已通关=第2关
    (root.querySelector(".home-play") as HTMLButtonElement).click();
    expect(t.played.map((l) => l.id)).toEqual([3]);
    const fill = root.querySelector<HTMLElement>(".home-bar-fill")!;
    expect(fill.style.width).toBe("4%"); // 2/50
  });

  it("全通:再战·第 50 关", () => {
    const storage = createStorage(memBackend());
    for (const l of LEVELS) storage.recordWin(l.id, 100);
    const t = show(storage);
    expect(root.querySelector(".home-play")!.textContent).toContain("再战 · 第 50 关");
    (root.querySelector(".home-play") as HTMLButtonElement).click();
    expect(t.played.map((l) => l.id)).toEqual([50]);
  });

  it("选关按钮触发 onSelect", () => {
    const t = show();
    (root.querySelector(".home-select") as HTMLButtonElement).click();
    expect(t.selected).toBe(1);
  });

  it("音效钮:图标切换、setMuted 联动、存档持久化", () => {
    const storage = createStorage(memBackend());
    show(storage);
    const btn = root.querySelector<HTMLButtonElement>(".sound-btn")!;
    expect(btn.textContent).toBe("🔊");
    btn.click();
    expect(btn.textContent).toBe("🔇");
    expect(vi.mocked(setMuted)).toHaveBeenCalledWith(true);
    expect(storage.load().soundOn).toBe(false);
    btn.click();
    expect(btn.textContent).toBe("🔊");
    expect(vi.mocked(setMuted)).toHaveBeenLastCalledWith(false);
    expect(storage.load().soundOn).toBe(true);
  });

  it("存档静音时初始即 🔇;装饰藤蔓存在", () => {
    const storage = createStorage(memBackend());
    storage.setSoundOn(false);
    show(storage);
    expect(root.querySelector(".sound-btn")!.textContent).toBe("🔇");
    expect(root.querySelector(".home-vine path")).not.toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/home.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 src/ui/home.ts**

```ts
import { LEVELS, type LevelSpec } from "../core/levels";
import type { GameStorage } from "../core/storage";
import { setMuted } from "./audio";
import { fmtTime } from "./format";

export interface HomeDeps {
  storage: GameStorage;
  version: string;
  onContinue(level: LevelSpec): void;
  onSelect(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX = LEVELS.length;

/** 游戏首界面:藤蔓延伸式(v2.1 设计文档 §4) */
export function showHome(root: HTMLElement, deps: HomeDeps): void {
  const save = deps.storage.load();
  const done = LEVELS.filter(
    (l) => save.bestTimes[l.id] !== undefined || l.id < save.unlockedLevel,
  ).length;
  const bestOwner = [...LEVELS].reverse().find((l) => save.bestTimes[l.id] !== undefined);
  const cleared = save.bestTimes[MAX] !== undefined;
  const fresh = save.unlockedLevel === 1 && save.bestTimes[1] === undefined;
  const target = LEVELS[(cleared ? MAX : save.unlockedLevel) - 1]!;
  const primaryLabel = fresh
    ? "开始游戏 · 第 1 关"
    : cleared
      ? `再战 · 第 ${MAX} 关`
      : `继续 · 第 ${save.unlockedLevel} 关`;

  const home = document.createElement("div");
  home.className = "home";

  const hero = document.createElement("div");
  hero.className = "home-hero";
  hero.appendChild(buildVineDeco());
  const title = document.createElement("h1");
  title.textContent = "扫雷";
  const sub = document.createElement("p");
  sub.className = "home-sub";
  sub.textContent = "沿着藤蔓,一路向上";
  hero.append(title, sub);

  const panel = document.createElement("section");
  panel.className = "home-panel";

  const stats = document.createElement("div");
  stats.className = "home-stats num";
  const doneStat = document.createElement("span");
  doneStat.textContent = `🌱 已通关 ${done}/${MAX}`;
  const bestStat = document.createElement("span");
  bestStat.textContent = `⏱ 最快 ${bestOwner ? fmtTime(save.bestTimes[bestOwner.id]!) : "—"}`;
  const soundBtn = document.createElement("button");
  soundBtn.type = "button";
  soundBtn.className = "sound-btn";
  let on = save.soundOn;
  const syncSound = (): void => {
    soundBtn.textContent = on ? "🔊" : "🔇";
    soundBtn.setAttribute("aria-label", on ? "关闭音效" : "开启音效");
  };
  syncSound();
  soundBtn.addEventListener("click", () => {
    on = !on;
    setMuted(!on);
    deps.storage.setSoundOn(on);
    syncSound();
  });
  stats.append(doneStat, bestStat, soundBtn);

  const barWrap = document.createElement("div");
  barWrap.className = "home-bar";
  const fill = document.createElement("div");
  fill.className = "home-bar-fill";
  fill.style.width = `${(done / MAX) * 100}%`;
  barWrap.appendChild(fill);

  const actions = document.createElement("div");
  actions.className = "home-actions";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "home-play";
  playBtn.textContent = `▶ ${primaryLabel}`;
  playBtn.addEventListener("click", () => deps.onContinue(target));
  const selBtn = document.createElement("button");
  selBtn.type = "button";
  selBtn.className = "home-select";
  selBtn.textContent = "🌿 选关";
  selBtn.addEventListener("click", () => deps.onSelect());
  actions.append(playBtn, selBtn);

  const ver = document.createElement("p");
  ver.className = "home-ver num";
  ver.textContent = `v${deps.version}`;

  panel.append(stats, barWrap, actions, ver);
  home.append(hero, panel);
  root.replaceChildren(home);
}

/** 装饰藤蔓:自顶垂落,CSS 驱动生长动画(prefers-reduced-motion 时静态) */
function buildVineDeco(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 260 330");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("home-vine");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M 130 -10 C 70 60, 190 100, 130 170 C 80 230, 170 260, 140 330");
  path.setAttribute("pathLength", "1");
  svg.appendChild(path);
  const dot = (x: number, y: number, r: number, cls: string): void => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", String(r));
    c.classList.add(cls);
    svg.appendChild(c);
  };
  dot(105, 62, 7, "home-leaf");
  dot(163, 108, 7, "home-leaf");
  dot(130, 170, 10, "home-bud");
  dot(122, 258, 8, "home-leaf");
  return svg;
}
```

`src/ui/style.css` 文件末尾追加:

```css
/* ===== 首页(v2.1)===== */
.home {
  width: 100%;
  max-width: 27rem;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: max(1.5rem, env(safe-area-inset-top)) 1.375rem
    calc(1.5rem + env(safe-area-inset-bottom));
}

.home-hero {
  position: relative;
  flex: 1;
  min-height: 16rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.home-vine {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}

.home-vine path {
  fill: none;
  stroke: var(--easy);
  stroke-width: 5;
  stroke-linecap: round;
  opacity: 0.55;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: vine-grow 2s ease-out;
}

@keyframes vine-grow {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-vine path {
    animation: none;
  }
}

.home-leaf {
  fill: #c9d6c7;
}

.home-bud {
  fill: var(--easy);
}

.home-hero h1 {
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: 0.35em;
  margin-left: 0.35em;
  text-shadow: 0 1px 0 #fff;
}

.home-sub {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--ink-soft);
  letter-spacing: 0.15em;
}

.home-panel {
  background: var(--card);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-soft);
  padding: 1.125rem 1.25rem 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.home-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: var(--ink-soft);
}

.sound-btn {
  font-size: 1.05rem;
  line-height: 1;
  padding: 0.25rem 0.375rem;
  border-radius: 0.625rem;
  transition: transform 0.15s ease;
}

.sound-btn:active {
  transform: scale(0.9);
}

.home-bar {
  height: 0.4rem;
  background: var(--cell);
  border-radius: 999px;
  overflow: hidden;
}

.home-bar-fill {
  height: 100%;
  background: var(--easy);
  border-radius: 999px;
  transition: width 0.4s ease;
}

.home-actions {
  display: flex;
  gap: 0.625rem;
}

.home-play {
  flex: 1.7;
  padding: 0.8125rem 0;
  background: var(--easy);
  color: #fff;
  border-radius: var(--r-btn);
  font-size: 1.0625rem;
  font-weight: 700;
  box-shadow: 0 6px 16px rgba(143, 174, 139, 0.4);
  transition: transform 0.15s ease;
}

.home-play:active {
  transform: scale(0.97);
}

.home-select {
  flex: 1;
  padding: 0.8125rem 0;
  background: var(--bg);
  color: var(--ink);
  border-radius: var(--r-btn);
  font-size: 0.9375rem;
  transition: transform 0.15s ease;
}

.home-select:active {
  transform: scale(0.97);
}

.home-ver {
  text-align: center;
  font-size: 0.6875rem;
  color: #b5ad9f;
}
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/home.test.ts`
Expected: PASS(7 用例)

- [ ] **Step 5: 全量 + tsc + 提交**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/ui/home.ts src/ui/style.css tests/home.test.ts
git commit -m "feat: 游戏首界面(藤蔓延伸式:进度/最快/音效钮/三态主按钮)"
```

---

### Task 7: main.ts 路由接入首页 + menu 返回钮与"—"标签

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ui/menu.ts`
- Modify: `src/ui/style.css`(.menu 相对定位 + .menu-back)
- Modify: `tests/ui.test.ts`(菜单用例)

**Interfaces:**
- Consumes: `showHome/HomeDeps`(Task 6)、`setMuted`(Task 4)。
- Produces: `MenuDeps` 增必填 `onBack(): void`;页面流 home ↔ menu ↔ game;启动进 home;启动时按存档设置静音。Task 8 不依赖本任务,但验收路径经此。

- [ ] **Step 1: 写失败测试(tests/ui.test.ts 菜单区)**

选关页 describe 中两处 `showMenu(root, { storage: ..., onPlay: ... })` 调用都补 `onBack: () => {}`。追加两个用例:

```ts
  it("返回钮回首页回调", () => {
    let back = 0;
    showMenu(root, {
      storage: createStorage(memBackend()),
      onPlay: () => {},
      onBack: () => back++,
    });
    const btn = root.querySelector<HTMLButtonElement>(".menu-back")!;
    expect(btn.getAttribute("aria-label")).toBe("返回首页");
    btn.click();
    expect(back).toBe(1);
  });

  it("已通关但无成绩(v1 迁移)显示 — 而非 未通关", () => {
    const backend = memBackend();
    backend.setItem(
      "minesweeper-save-v1",
      '{"version":2,"unlockedLevel":3,"bestTimes":{}}',
    );
    showMenu(root, { storage: createStorage(backend), onPlay: () => {}, onBack: () => {} });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes[0]!.classList.contains("done")).toBe(true);
    expect(nodes[0]!.querySelector(".vn-best")!.textContent).toBe("—");
    expect(nodes[1]!.querySelector(".vn-best")!.textContent).toBe("—");
    expect(nodes[2]!.querySelector(".vn-best")!.textContent).toBe("未通关"); // current 关仍显示未通关
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL(MenuDeps 无 onBack / .menu-back 不存在 / 标签仍为"未通关")

- [ ] **Step 3: 改 menu.ts**

1. `MenuDeps`:`onPlay` 行后加 `onBack(): void;`
2. `showMenu` 中 `menu.appendChild(head);` 之前插入:

```ts
  const back = document.createElement("button");
  back.type = "button";
  back.className = "pill back menu-back";
  back.textContent = "←";
  back.setAttribute("aria-label", "返回首页");
  back.addEventListener("click", () => deps.onBack());
  menu.appendChild(back);
```

3. `vineNode` 中副标签与 aria 两处("未通关"分支细分):

```ts
  sub.textContent = locked ? "🔒" : best !== undefined ? fmtTime(best) : done ? "—" : "未通关";
```

aria-label 的三元同步改为:

```ts
    btn.setAttribute(
      "aria-label",
      `第 ${level.id} 关,${best !== undefined ? `最好成绩 ${fmtTime(best)}` : done ? "已通关" : "未通关"}`,
    );
```

`src/ui/style.css` `.menu {` 块内加一行 `position: relative;`;`.menu-note` 块后追加:

```css
.menu-back {
  position: absolute;
  top: max(1rem, env(safe-area-inset-top));
  left: 1rem;
}
```

- [ ] **Step 4: 改 main.ts(整文件替换)**

```ts
import "./ui/style.css";
import { createStorage } from "./core/storage";
import { LEVELS, type LevelSpec } from "./core/levels";
import { setMuted } from "./ui/audio";
import { showHome } from "./ui/home";
import { showMenu } from "./ui/menu";
import { showGame } from "./ui/game";
import { showResult } from "./ui/result";

const APP_VERSION = "2.1.0";
const root = document.querySelector<HTMLDivElement>("#app")!;

function localStorageBackend(): globalThis.Storage | undefined {
  try {
    const probe = "__minesweeper_probe__";
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return undefined;
  }
}

const backend = localStorageBackend();
const storage = createStorage(backend);
setMuted(!storage.load().soundOn);

function gotoHome(): void {
  showHome(root, {
    storage,
    version: APP_VERSION,
    onContinue: gotoGame,
    onSelect: gotoMenu,
  });
}

function gotoMenu(): void {
  showMenu(root, {
    storage,
    persistWarning: backend === undefined,
    onPlay: gotoGame,
    onBack: gotoHome,
  });
}

function gotoGame(level: LevelSpec): void {
  showGame(root, {
    level,
    onExit: gotoMenu,
    onToggleSound: (on) => void storage.setSoundOn(on),
    onFinish: (result) => {
      const next = LEVELS.find((l) => l.id === level.id + 1);
      const rec = result.won ? storage.recordWin(level.id, result.timeSec) : null;
      showResult({
        won: result.won,
        reason: result.reason,
        timeSec: result.timeSec,
        newBest: rec?.newBest ?? false,
        persisted: rec?.persisted ?? true,
        hasNext: result.won && next !== undefined,
        onNext: () => next && gotoGame(next),
        onRetry: () => gotoGame(level),
        onMenu: gotoMenu,
      });
    },
  });
}

gotoHome();

// PWA:仅在 Web 环境(https 或本地预览)注册 Service Worker;Tauri 桌面端不需要
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
```

**注意**:`onToggleSound` 是 Task 8 加进 `GameDeps` 的字段。本任务先行引用会导致 tsc 报错——所以 Step 5 之前,先在 `src/ui/game.ts` 的 `GameDeps` 接口(`onFinish` 行后)加上这一行签名(仅签名,行为 Task 8 实现):

```ts
  onToggleSound(on: boolean): void;
```

同时 `tests/ui.test.ts` 游戏页 `start()` 助手中 `showGame(root, { level, onExit: () => {}, onFinish: ... })` 补 `onToggleSound: () => {},`。

- [ ] **Step 5: 跑测试**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿、干净

- [ ] **Step 6: 手动冒烟(可选但建议)**

Run: `npm run dev`,浏览器确认:启动进首页 → 开始游戏进关卡 → 退出到藤蔓 → 返回钮回首页。Ctrl-C 结束。

- [ ] **Step 7: 提交**

```bash
git add src/main.ts src/ui/menu.ts src/ui/game.ts src/ui/style.css tests/ui.test.ts
git commit -m "feat: 首页路由接入,选关页返回钮与迁移档 — 标签"
```

---

### Task 8: game.ts 音效接线 + 顶栏静音钮

**Files:**
- Modify: `src/ui/game.ts`
- Modify: `tests/ui.test.ts`

**Interfaces:**
- Consumes: `unlock/setMuted/isMuted/playBlank/playNumber/playBoom/playWin/playLose`(Task 4)、`GameDeps.onToggleSound`(Task 7 已加签名)。
- Produces: 触发规则(规格 §3.3):空白/数字一次挖掘一声;踩雷瞬间爆炸、结算时失败音;超时仅失败音;通关即胜利音;插旗/预旗无声。

- [ ] **Step 1: 写失败测试(tests/ui.test.ts)**

文件顶部(generator mock 之后)追加 audio mock 与导入:

```ts
vi.mock("../src/ui/audio", () => ({
  unlock: vi.fn(),
  setMuted: vi.fn(),
  isMuted: vi.fn(() => false),
  playBlank: vi.fn(),
  playNumber: vi.fn(),
  playBoom: vi.fn(),
  playWin: vi.fn(),
  playLose: vi.fn(),
}));
import * as audio from "../src/ui/audio";
```

(`afterEach` 已有 `vi.useRealTimers()`,在其中追加 `vi.clearAllMocks();`。)

游戏页 describe 追加:

```ts
  it("音效触发:空白挖/数字挖/通关", () => {
    const cells = start();
    press(cells[63]!); // 洪泛(挖开格邻雷 0)
    expect(vi.mocked(audio.playBlank)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.playNumber)).not.toHaveBeenCalled();
    press(cells[7]!); // 邻雷 1 的数字格,同时完成全盘 → 通关
    expect(vi.mocked(audio.playNumber)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.playWin)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.unlock)).toHaveBeenCalled(); // 每次按下先解锁
  });

  it("踩雷:爆炸音即刻,失败音在结算暂停后", () => {
    const cells = start();
    press(cells[63]!);
    press(cells[0]!); // 雷
    expect(vi.mocked(audio.playBoom)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.playLose)).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(vi.mocked(audio.playLose)).toHaveBeenCalledTimes(1);
  });

  it("超时:无爆炸音,仅失败音", () => {
    const cells = start();
    press(cells[63]!);
    vi.advanceTimersByTime(level.timeLimitSec * 1000 + 2000);
    expect(vi.mocked(audio.playBoom)).not.toHaveBeenCalled();
    expect(vi.mocked(audio.playLose)).toHaveBeenCalledTimes(1);
  });

  it("插旗与预旗不出声", () => {
    const cells = start();
    press(cells[7]!, { button: 2 }); // 预旗
    press(cells[63]!); // 开局
    press(cells[8]!, { button: 2 }); // 已开局插旗(8 号已开?否——8 号是数字格已被洪泛开,换未开格)
    expect(vi.mocked(audio.playNumber)).not.toHaveBeenCalled();
    expect(vi.mocked(audio.playBoom)).not.toHaveBeenCalled();
  });

  it("顶栏静音钮:切换调 setMuted 并回调持久化", () => {
    const toggles: boolean[] = [];
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    showGame(root, {
      level,
      onExit: () => {},
      onFinish: () => {},
      onToggleSound: (on) => toggles.push(on),
    });
    const btn = root.querySelector<HTMLButtonElement>(".game-sound")!;
    expect(btn.textContent).toBe("🔊"); // isMuted mock 恒 false
    btn.click();
    expect(vi.mocked(audio.setMuted)).toHaveBeenCalledWith(true);
    expect(toggles).toEqual([false]);
  });
```

**注意**"插旗与预旗不出声"用例:`press(cells[8]!, { button: 2 })` 中 8 号格开局后已是翻开的数字格,右键对已开格走 chord 分支(changed 为空,无声)。这正是要断言的"无声"路径之一,保留即可。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL(音效函数未被调用 / .game-sound 不存在)

- [ ] **Step 3: 改 game.ts**

1. import 追加:

```ts
import {
  isMuted,
  playBlank,
  playBoom,
  playLose,
  playNumber,
  playWin,
  setMuted,
  unlock,
} from "./audio";
```

2. 顶栏静音钮:`stats.append(mineStat, timeStat);` 之后追加:

```ts
  const soundBtn = button("pill stat game-sound", "", toggleSound);
  stats.appendChild(soundBtn);
```

`setMode` 函数后追加两个函数:

```ts
  function syncSoundBtn(): void {
    soundBtn.textContent = isMuted() ? "🔇" : "🔊";
    soundBtn.setAttribute("aria-label", isMuted() ? "开启音效" : "关闭音效");
  }

  function toggleSound(): void {
    setMuted(!isMuted());
    deps.onToggleSound(!isMuted());
    syncSoundBtn();
  }
```

并在 `refit();` 调用行(第一次)之前加一行 `syncSoundBtn();` 完成初始渲染。

3. pointerdown 处理器第一行加 `unlock();`(在 `const p = vpPoint(e);` 之前)。

4. `act()` 中挖掘音效:`const r = b.revealed[li] ? chord(b, li) : reveal(b, li);` 一段改为:

```ts
    const wasOpen = b.revealed[li];
    const r = wasOpen ? chord(b, li) : reveal(b, li);
    if (r.changed.length > 0 && !r.exploded) {
      if (!wasOpen && b.adjacent[li] === 0) playBlank();
      else playNumber();
    }
```

5. `win()`:`stopTimer();` 与 resize 摘除行之后加 `playWin();`。

6. `lose()`:函数体 `stopTimer();`/resize 摘除行之后加:

```ts
    if (reason === "mine") playBoom();
```

末尾 `setTimeout(() => deps.onFinish(...), FINISH_PAUSE_MS)` 改为:

```ts
    setTimeout(() => {
      playLose();
      deps.onFinish({ won: false, reason, timeSec });
    }, FINISH_PAUSE_MS);
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/ui.test.ts`
Expected: PASS(既有用例不受影响:audio 全程 mock)

- [ ] **Step 5: 全量 + tsc + 提交**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/ui/game.ts tests/ui.test.ts
git commit -m "feat: 游戏页五音效接线与顶栏静音钮"
```

---

### Task 9: 版本 2.1.0 与桌面打包

**Files:**
- Modify: `package.json`(version 2.0.0 → 2.1.0)
- Modify: `src-tauri/tauri.conf.json`(version 2.0.0 → 2.1.0;windows 配置不动)

**Interfaces:**
- Produces: 产品版本 2.1.0;安装包 `minesweeper_2.1.0_x64-setup.exe` 在项目根(替换 2.0.0)。

- [ ] **Step 1: 改两处版本号**

`package.json`:`"version": "2.0.0"` → `"2.1.0"`。
`src-tauri/tauri.conf.json`:`"version": "2.0.0"` → `"2.1.0"`(其余不动)。

- [ ] **Step 2: 构建 + 冒烟**

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npm run build:web
npx tauri build
```

Expected: 两者成功;产物 `src-tauri/target/release/bundle/nsis/minesweeper_2.1.0_x64-setup.exe`。
冒烟:启动 `src-tauri/target/release/app.exe`,存活 ≥4 秒后正常结束进程。

- [ ] **Step 3: 安装包入根 + 提交**

```powershell
Remove-Item "minesweeper_2.0.0_x64-setup.exe" -ErrorAction SilentlyContinue
Copy-Item "src-tauri/target/release/bundle/nsis/minesweeper_2.1.0_x64-setup.exe" .
```

`git status` 若见 `src-tauri/Cargo.toml` 为 M:执行 `git diff --ignore-cr-at-eol src-tauri/Cargo.toml` 确认为空(EOL 噪音)后 `git restore src-tauri/Cargo.toml`。

```bash
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: v2.1.0 版本号与桌面打包"
```

---

### Task 10: 全量验收

**Files:** 无新增改动(只验证)

- [ ] **Step 1: 自动化全量**

Run: `npm test`(全绿,9 个测试文件)
Run: `npm run build:web && npm run build:desktop`(两种 base 均成功)
Run(PowerShell): `$env:GEN_BENCH="1"; npx vitest run tests/gen-bench.test.ts; Remove-Item Env:GEN_BENCH`,30 关全部 <500ms,记录最坏三关后删除 `gen-bench.tmp.txt`。

- [ ] **Step 2: 手动清单(`npm run dev` + 桌面 exe)**

- PC 浏览器:快速连点 30+ 次无一次吞点击;点格间缝隙必响应;7px 内抖动照常挖格;拖动平移/滚轮缩放手感不变;五种音效触发正确(空白/数字/爆炸/胜利/失败);静音钮首页与游戏内联动且刷新后记忆;首页藤蔓生长动画、三态主按钮、进度条/最快成绩正确;选关页 50 节点十色带、返回钮回首页。
- PC exe:同上,窗口 1100×800。
- 手机(部署后 iPhone PWA):首页/藤蔓/游戏导航顺畅;触屏首次手势后音效正常;长按插旗无点击音;藤蔓 50 关滚动定位正确。
- 存档:v2.0 老档升级后进度/成绩保留、soundOn 缺省开;v1 迁移档 3-10 关显示"—"。

- [ ] **Step 3: 完成开发分支**

全部通过后调用 superpowers:finishing-a-development-branch(合并 main → 推送 → 自动部署 → 安装包已在根)。

---

## Self-Review 记录

- 规格覆盖:§1 点击修复→Task 2/3;§2 关卡 21-50 + 性能闸门→Task 1;§3 音效(参数表/触发/静音持久化)→Task 4/5/8;§4 首界面与页面流→Task 6/7;§5 "—"标签→Task 7;§6 版本/测试矩阵/发布→Task 9/10 + 各任务 TDD 步骤;§7 路线图(无尽模式)非本版,无任务,正确。
- 占位符:无 TBD/"适当处理";所有代码步骤给出完整代码;Task 1 Step 8 的闸门回调是明确规则 + 不变式测试兜底,非留白。
- 类型一致性:`hitCell(px,py,v,cols,rows)` Task 2 定义 = Task 3 调用;`soundOn/setSoundOn` Task 5 定义 = Task 6/7 消费;`onToggleSound(on:boolean)` Task 7 加签名 = Task 8 调用 = main.ts 传入;`HomeDeps` Task 6 定义 = Task 7 消费;十档 Tier key(inferno/umbra/void/chaos/finale)在 levels/CSS/测试三处逐字一致;数值表经手工验算满足全部不变式(格数/雷数严格递增、密度 ∈[22.129,23.173]⊂[22.1,23.2]、档均值递增、限时 930→1800 步进 30)。
- 任务顺序:1(数据)→2(纯函数)→3(接线)→4(音效模块)→5(存档)→6(首页)→7(路由)→8(游戏接线)→9(版本)→10(验收);Task 7 对 GameDeps 的前向签名已显式写入步骤,无隐式依赖。
