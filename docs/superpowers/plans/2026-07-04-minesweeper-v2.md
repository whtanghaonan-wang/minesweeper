# 扫雷 v2 实施计划（20关5档 · 视口缩放平移 · 藤蔓选关 · 响应式 · 插旗修复）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按规格 `docs/superpowers/specs/2026-07-03-v2-zoom-levels-tree-design.md` 交付 v2：关卡扩至 20 关 5 档，雷区支持缩放/平移/防误触，选关页改藤蔓地图，PC UI 随窗口等比缩放，修复右键插旗（含开局前预旗）。

**Architecture:** 保留 DOM 网格渲染；新增 `viewport.ts`（纯逻辑：视图变换数学 + 手势状态机）与 `vine.ts`（纯逻辑：藤蔓布局）；`game.ts` 只做 DOM 接线；`menu.ts` 重写为 SVG 藤蔓 + 绝对定位按钮层；存档 v1→v2 迁移。核心 `board.ts / generator.ts / solver.ts / rng.ts` **不改动**。

**Tech Stack:** TypeScript(strict) + Vite 8 无框架；Vitest 4（纯逻辑 node 环境、UI jsdom）；vite-plugin-pwa；Tauri 2。

## Global Constraints

- 不新增任何运行时依赖；不改 `src/core/board.ts`、`generator.ts`、`solver.ts`、`rng.ts`。
- TS strict + `tsc --noEmit` 每个任务结束必须通过（`npm run build:web` 含 tsc）。
- 每个任务结束 `npm test` 全绿后才 commit；提交信息用中文、前缀 `feat:/test:/chore:/refactor:`，末尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- UI 文案一律简体中文；配色沿用既有柔和中性令牌，新增 `--expert: #9b8fc4`、`--abyss: #7a9cc4`。
- jsdom 测试模拟指针输入用 `MouseEvent` 构造 + `Object.defineProperty(e, "pointerType", …)`（jsdom 无 PointerEvent 构造器）；`pointerId` 缺省按 0 处理。
- 关卡数值以规格 §1.2 表为唯一来源，写入 `src/core/levels.ts`。

---

## 任务总览

| # | 任务 | 产出 |
|---|---|---|
| 1 | 关卡表 v2（5 档 20 关） | levels.ts、levels.test.ts、generator.test.ts 重写、menu.ts 临时补丁 |
| 2 | 存档 v2 迁移 | storage.ts、storage.test.ts |
| 3 | 视口数学 | viewport.ts（fitScale/clampView/zoomAt）、viewport.test.ts |
| 4 | 手势状态机 | viewport.ts（createGestures）、viewport.test.ts 追加 |
| 5 | game.ts 视口接线 | game.ts 输入重写、style.css 棋盘层、ui.test.ts 游戏区更新 |
| 6 | 预旗 + PC 操作提示 | game.ts、style.css、ui.test.ts 追加 |
| 7 | 藤蔓布局纯函数 | vine.ts、vine.test.ts |
| 8 | 选关页藤蔓重写 | menu.ts 重写、style.css、ui.test.ts 选关区重写 |
| 9 | 全局 rem 响应式 + 文案 | style.css、vite.config.ts |
| 10 | 版本号与桌面窗口、打包 | package.json、tauri.conf.json、构建产物 |
| 11 | 全量验收 | 测试/构建/手动清单全过 |

---

### Task 1: 关卡表 v2（5 档 20 关）

**Files:**
- Modify: `src/core/levels.ts`（整文件替换）
- Modify: `src/ui/menu.ts:12-13`（TIER_ORDER/TIER_COLS 补新档，防 tsc 破窗；Task 8 重写时移除）
- Modify: `tests/generator.test.ts`（SPEC_TABLE 换 20 关、删"宽度≤12"测试、SEEDS 补新档）
- Modify: `tests/ui.test.ts:41-47`（选关瓦片数 10→20）
- Create: `tests/levels.test.ts`

**Interfaces:**
- Produces: `type Tier = "easy" | "challenge" | "hard" | "expert" | "abyss"`；`TIER_NAMES`（新增 expert:"专家"、abyss:"深渊"）；`LEVELS: LevelSpec[]`（20 项，id 1..20）。`LevelSpec` 字段不变。
- 后续任务依赖：Task 2 用 `LEVELS` 推导 MAX_LEVEL；Task 7/8 用 `LEVELS` 与 `Tier`。

- [ ] **Step 1: 写失败测试 `tests/levels.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { LEVELS, TIER_NAMES, type Tier } from "../src/core/levels";

const TIERS: Tier[] = ["easy", "challenge", "hard", "expert", "abyss"];
const density = (i: number): number =>
  (LEVELS[i]!.mines / (LEVELS[i]!.width * LEVELS[i]!.height)) * 100;

describe("v2 关卡设计律（规格 §1.2）", () => {
  it("共 20 关、编号连续、每档 4 关", () => {
    expect(LEVELS).toHaveLength(20);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
    for (const t of TIERS) expect(LEVELS.filter((l) => l.tier === t)).toHaveLength(4);
    // 档位顺序：easy → challenge → hard → expert → abyss，各自连续
    expect(LEVELS.map((l) => l.tier)).toEqual(TIERS.flatMap((t) => [t, t, t, t]));
  });

  it("档内雷密度严格单调递增", () => {
    for (let i = 1; i < 20; i++) {
      if (LEVELS[i]!.tier === LEVELS[i - 1]!.tier) {
        expect(density(i)).toBeGreaterThan(density(i - 1));
      }
    }
  });

  it("档间密度跳变 ≥ 0.9 个百分点", () => {
    for (let i = 1; i < 20; i++) {
      if (LEVELS[i]!.tier !== LEVELS[i - 1]!.tier) {
        expect(density(i) - density(i - 1)).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it("限时单调不减", () => {
    for (let i = 1; i < 20; i++) {
      expect(LEVELS[i]!.timeLimitSec).toBeGreaterThanOrEqual(LEVELS[i - 1]!.timeLimitSec);
    }
  });

  it("五档名称齐全", () => {
    expect(TIER_NAMES).toEqual({
      easy: "简单",
      challenge: "挑战",
      hard: "困难",
      expert: "专家",
      abyss: "深渊",
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/levels.test.ts`
Expected: FAIL（LEVELS 只有 10 项 / TIER_NAMES 缺 expert）

- [ ] **Step 3: 整文件替换 `src/core/levels.ts`**

```ts
export type Tier = "easy" | "challenge" | "hard" | "expert" | "abyss";

export interface LevelSpec {
  id: number;
  tier: Tier;
  width: number;
  height: number;
  mines: number;
  timeLimitSec: number;
}

export const TIER_NAMES: Record<Tier, string> = {
  easy: "简单",
  challenge: "挑战",
  hard: "困难",
  expert: "专家",
  abyss: "深渊",
};

/** 关卡数值唯一来源（v2 设计文档 §1.2）：档内密度递增；专家/深渊两档密度近无猜生成可行上限，
 *  档内难度增长主要靠盘面尺寸与限时；档间密度跳变 ≥0.9 个百分点并叠加尺寸跳档 */
export const LEVELS: LevelSpec[] = [
  { id: 1, tier: "easy", width: 8, height: 8, mines: 7, timeLimitSec: 180 },
  { id: 2, tier: "easy", width: 9, height: 10, mines: 11, timeLimitSec: 180 },
  { id: 3, tier: "easy", width: 9, height: 11, mines: 13, timeLimitSec: 210 },
  { id: 4, tier: "easy", width: 10, height: 12, mines: 17, timeLimitSec: 240 },
  { id: 5, tier: "challenge", width: 10, height: 14, mines: 22, timeLimitSec: 270 },
  { id: 6, tier: "challenge", width: 11, height: 15, mines: 27, timeLimitSec: 300 },
  { id: 7, tier: "challenge", width: 12, height: 16, mines: 32, timeLimitSec: 330 },
  { id: 8, tier: "challenge", width: 12, height: 18, mines: 37, timeLimitSec: 360 },
  { id: 9, tier: "hard", width: 13, height: 19, mines: 45, timeLimitSec: 390 },
  { id: 10, tier: "hard", width: 14, height: 20, mines: 52, timeLimitSec: 420 },
  { id: 11, tier: "hard", width: 14, height: 22, mines: 58, timeLimitSec: 450 },
  { id: 12, tier: "hard", width: 15, height: 23, mines: 66, timeLimitSec: 480 },
  { id: 13, tier: "expert", width: 16, height: 24, mines: 77, timeLimitSec: 510 },
  { id: 14, tier: "expert", width: 16, height: 26, mines: 85, timeLimitSec: 540 },
  { id: 15, tier: "expert", width: 17, height: 27, mines: 94, timeLimitSec: 570 },
  { id: 16, tier: "expert", width: 18, height: 28, mines: 104, timeLimitSec: 600 },
  { id: 17, tier: "abyss", width: 18, height: 30, mines: 118, timeLimitSec: 660 },
  { id: 18, tier: "abyss", width: 19, height: 31, mines: 129, timeLimitSec: 720 },
  { id: 19, tier: "abyss", width: 20, height: 32, mines: 141, timeLimitSec: 780 },
  { id: 20, tier: "abyss", width: 20, height: 34, mines: 150, timeLimitSec: 900 },
];
```

- [ ] **Step 4: 给 `src/ui/menu.ts` 打临时类型补丁**（Tier 扩了 union，Record 缺键会 tsc 报错）

把第 12–13 行：

```ts
const TIER_ORDER: Tier[] = ["easy", "challenge", "hard"];
const TIER_COLS: Record<Tier, number> = { easy: 3, challenge: 4, hard: 3 };
```

改为：

```ts
const TIER_ORDER: Tier[] = ["easy", "challenge", "hard", "expert", "abyss"];
const TIER_COLS: Record<Tier, number> = { easy: 4, challenge: 4, hard: 4, expert: 4, abyss: 4 };
```

- [ ] **Step 5: 重写 `tests/generator.test.ts` 的 SPEC_TABLE 与 SEEDS**

SPEC_TABLE 整体替换为 20 行（与 Step 3 表逐项一致）：

```ts
// 与 v2 设计文档 §1.2 关卡表逐项对拍
const SPEC_TABLE: [number, Tier, number, number, number, number][] = [
  [1, "easy", 8, 8, 7, 180],
  [2, "easy", 9, 10, 11, 180],
  [3, "easy", 9, 11, 13, 210],
  [4, "easy", 10, 12, 17, 240],
  [5, "challenge", 10, 14, 22, 270],
  [6, "challenge", 11, 15, 27, 300],
  [7, "challenge", 12, 16, 32, 330],
  [8, "challenge", 12, 18, 37, 360],
  [9, "hard", 13, 19, 45, 390],
  [10, "hard", 14, 20, 52, 420],
  [11, "hard", 14, 22, 58, 450],
  [12, "hard", 15, 23, 66, 480],
  [13, "expert", 16, 24, 77, 510],
  [14, "expert", 16, 26, 85, 540],
  [15, "expert", 17, 27, 94, 570],
  [16, "expert", 18, 28, 104, 600],
  [17, "abyss", 18, 30, 118, 660],
  [18, "abyss", 19, 31, 129, 720],
  [19, "abyss", 20, 32, 141, 780],
  [20, "abyss", 20, 34, 150, 900],
];
```

`describe("LEVELS")` 内：`expect(LEVELS).toHaveLength(10)` → `20`；**删除**整个 `it("棋盘宽度不超过 12 列（手机竖屏约束）")`（v2 由缩放平移承接大盘）；"三档名称齐全" 改为断言五档（与 levels.test.ts 相同的 `toEqual` 五键断言，标题改"五档名称齐全"）。

`describe("generate")` 的 SEEDS 替换为：

```ts
const SEEDS: Record<Tier, number[]> = {
  easy: [1, 2, 3, 4, 5],
  challenge: [1, 2, 3, 4, 5],
  hard: [1, 2, 3],
  expert: [1, 2],
  abyss: [1, 2],
};
```

- [ ] **Step 6: 更新 `tests/ui.test.ts` 选关数量断言**

`it("渲染 10 个关卡，仅第 1 关可玩，其余锁定")` 改名"渲染 20 个关卡…"，`toHaveLength(10)` → `20`，循环 `for (let i = 1; i < 10; …)` → `i < 20`。

- [ ] **Step 7: 全量测试 + 提交**

Run: `npm test`
Expected: 全绿（levels 新 5 个用例通过；generator 20 关生成用例全过，深渊关单盘 <200ms）

```bash
git add src/core/levels.ts src/ui/menu.ts tests/levels.test.ts tests/generator.test.ts tests/ui.test.ts
git commit -m "feat: 关卡扩至 20 关 5 档（新增专家/深渊档，实测无猜生成毫秒级）"
```

---

### Task 2: 存档 v2 迁移

**Files:**
- Modify: `src/core/storage.ts`（整文件替换）
- Modify: `tests/storage.test.ts`

**Interfaces:**
- Consumes: `LEVELS`（Task 1）。
- Produces: `SaveData.version: 2`；`MAX_LEVEL` 内部改由 `LEVELS[LEVELS.length-1].id` 推导（=20）；`createStorage/GameStorage/recordWin/WinRecord/SAVE_KEY` 签名不变。迁移规则：v1 → 继承 `unlockedLevel`；`bestTimes` 仅保留盘面规格与 v1 相同的关（第 1、2 关）；迁移立即持久化。

- [ ] **Step 1: 更新并追加 `tests/storage.test.ts` 用例**

既有用例改动：
- "空档返回默认值"与"backend 抛异常"以及"无 backend"中 `version: 1` → `version: 2`；
- "通关第 N 关解锁 N+1…"改为：循环 `for (let l = 2; l <= 19; l++)`，末段 `recordWin(20, 60).unlocked` 为 `null`、`unlockedLevel` 为 `20`，标题改"第 20 关不解锁 21"；
- "损坏 JSON / 版本不符 / 非法字段回退默认"里两个 `version: 1` 的期望改 `version: 2`；`"version":1` 的最后一段输入改为 `"version":2`（v2 数据的字段校验行为不变）。

新增用例：

```ts
it("v1 存档迁移：进度继承，成绩仅保留规格未变的第 1、2 关，且立即持久化", () => {
  const backend = memBackend({
    [SAVE_KEY]: JSON.stringify({
      version: 1,
      unlockedLevel: 7,
      bestTimes: { 1: 55, 2: 66, 3: 77, 9: 99, 10: 111 },
    }),
  });
  const s = createStorage(backend);
  expect(s.load()).toEqual({ version: 2, unlockedLevel: 7, bestTimes: { 1: 55, 2: 66 } });
  expect(JSON.parse(backend.map.get(SAVE_KEY)!)).toEqual({
    version: 2,
    unlockedLevel: 7,
    bestTimes: { 1: 55, 2: 66 },
  });
});

it("v1 存档字段损坏时按同样规则回退后再迁移", () => {
  const s = createStorage(
    memBackend({
      [SAVE_KEY]: '{"version":1,"unlockedLevel":"abc","bestTimes":{"2":88,"5":"bad"}}',
    }),
  );
  expect(s.load()).toEqual({ version: 2, unlockedLevel: 1, bestTimes: { 2: 88 } });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL（默认值仍是 version 1；v1 输入被当垃圾回退）

- [ ] **Step 3: 整文件替换 `src/core/storage.ts`**

```ts
import { LEVELS } from "./levels";

export const SAVE_KEY = "minesweeper-save-v1"; // localStorage 键名不变，内容版本升级

export interface SaveData {
  version: 2;
  unlockedLevel: number;
  bestTimes: Record<number, number>;
}

export interface WinRecord {
  newBest: boolean;
  unlocked: number | null;
  persisted: boolean;
}

export interface GameStorage {
  load(): SaveData;
  save(d: SaveData): boolean;
  recordWin(levelId: number, timeSec: number): WinRecord;
}

type Backend = Pick<globalThis.Storage, "getItem" | "setItem">;

const MAX_LEVEL = LEVELS[LEVELS.length - 1]!.id;

/** v1 关卡盘面规格（宽,高,雷），迁移时判断旧最好成绩是否仍可比 */
const V1_SPECS: Record<number, [number, number, number]> = {
  1: [8, 8, 7],
  2: [9, 10, 11],
  3: [9, 12, 14],
  4: [10, 14, 21],
  5: [10, 16, 26],
  6: [11, 17, 32],
  7: [11, 19, 37],
  8: [12, 20, 46],
  9: [12, 22, 53],
  10: [12, 24, 60],
};

function defaults(): SaveData {
  return { version: 2, unlockedLevel: 1, bestTimes: {} };
}

/** 逐项校验 unlockedLevel/bestTimes，损坏字段回退默认、合法字段保留 */
function readFields(r: Record<string, unknown>): SaveData {
  const d = defaults();
  if (
    typeof r["unlockedLevel"] === "number" &&
    Number.isInteger(r["unlockedLevel"]) &&
    r["unlockedLevel"] >= 1 &&
    r["unlockedLevel"] <= MAX_LEVEL
  ) {
    d.unlockedLevel = r["unlockedLevel"];
  }
  if (typeof r["bestTimes"] === "object" && r["bestTimes"] !== null) {
    for (const [k, v] of Object.entries(r["bestTimes"])) {
      const id = Number(k);
      if (Number.isInteger(id) && id >= 1 && id <= MAX_LEVEL && typeof v === "number" && v > 0) {
        d.bestTimes[id] = v;
      }
    }
  }
  return d;
}

function sanitize(raw: unknown): SaveData {
  if (typeof raw !== "object" || raw === null) return defaults();
  const r = raw as Record<string, unknown>;
  if (r["version"] === 2) return readFields(r);
  if (r["version"] === 1) {
    // v1 迁移：进度继承；成绩仅保留盘面规格未变的关
    const v1 = readFields(r);
    const d = defaults();
    d.unlockedLevel = v1.unlockedLevel;
    for (const [k, t] of Object.entries(v1.bestTimes)) {
      const id = Number(k);
      const spec = V1_SPECS[id];
      const cur = LEVELS[id - 1];
      if (spec && cur && cur.width === spec[0] && cur.height === spec[1] && cur.mines === spec[2]) {
        d.bestTimes[id] = t;
      }
    }
    return d;
  }
  return defaults();
}

export function createStorage(backend?: Backend): GameStorage {
  let data = defaults();

  const save = (d: SaveData): boolean => {
    data = d;
    if (!backend) return false;
    try {
      backend.setItem(SAVE_KEY, JSON.stringify(d));
      return true;
    } catch {
      return false;
    }
  };

  try {
    const raw = backend?.getItem(SAVE_KEY);
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      data = sanitize(parsed);
      // v1 迁移结果立即持久化，避免下次再迁移
      if ((parsed as { version?: unknown } | null)?.["version"] === 1) save(data);
    }
  } catch {
    // 读失败/损坏 → 使用默认值，内存态继续工作
  }

  return {
    load: () => ({ ...data, bestTimes: { ...data.bestTimes } }),
    save,
    recordWin(levelId, timeSec) {
      const d = { ...data, bestTimes: { ...data.bestTimes } };
      const prev = d.bestTimes[levelId];
      const newBest = prev === undefined || timeSec < prev;
      if (newBest) d.bestTimes[levelId] = timeSec;
      let unlocked: number | null = null;
      if (levelId < MAX_LEVEL && d.unlockedLevel === levelId) {
        d.unlockedLevel = levelId + 1;
        unlocked = d.unlockedLevel;
      }
      const persisted = save(d);
      return { newBest, unlocked, persisted };
    },
  };
}
```

- [ ] **Step 4: 测试 + 提交**

Run: `npm test` — Expected: 全绿

```bash
git add src/core/storage.ts tests/storage.test.ts
git commit -m "feat: 存档 v2 迁移（进度继承、规格未变关保留成绩、上限 20 关）"
```

---

### Task 3: 视口数学（fitScale / clampView / zoomAt）

**Files:**
- Create: `src/ui/viewport.ts`
- Create: `tests/viewport.test.ts`

**Interfaces:**
- Produces（Task 4/5 依赖，签名务必一致）：

```ts
export interface ViewState { scale: number; tx: number; ty: number }
export interface Metrics { viewW: number; viewH: number; boardW: number; boardH: number }
export const BASE_CELL_PX = 40;
export const MAX_CELL_PX = 64;
export function fitScale(m: Metrics): number;
export function maxScale(m: Metrics): number;
export function clampView(v: ViewState, m: Metrics): ViewState;
export function zoomAt(v: ViewState, m: Metrics, px: number, py: number, factor: number): ViewState;
```

- [ ] **Step 1: 写失败测试 `tests/viewport.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  clampView,
  fitScale,
  maxScale,
  zoomAt,
  type Metrics,
} from "../src/ui/viewport";

const M: Metrics = { viewW: 600, viewH: 800, boardW: 300, boardH: 400 };

describe("视口数学", () => {
  it("fitScale 取两轴较小者，整盘恰好放入视口", () => {
    expect(fitScale(M)).toBe(2); // 600/300=2, 800/400=2
    expect(fitScale({ ...M, boardW: 600 })).toBe(1); // 600/600=1 < 800/400
    expect(fitScale({ ...M, viewW: 0 })).toBe(1); // 尺寸未知（jsdom）回退 1
  });

  it("maxScale ≥ fitScale，且保证单格可放大到 64px", () => {
    expect(maxScale(M)).toBe(2); // fit=2 > 64/40=1.6
    const small: Metrics = { viewW: 300, viewH: 300, boardW: 300, boardH: 300 };
    expect(maxScale(small)).toBeCloseTo(1.6); // fit=1 < 1.6
  });

  it("clampView：盘小于视口的轴向居中", () => {
    const v = clampView({ scale: 1, tx: -50, ty: 999 }, M); // 300x400 盘在 600x800 视口
    expect(v).toEqual({ scale: 1, tx: 150, ty: 200 });
  });

  it("clampView：盘大于视口的轴向不许露底", () => {
    const m: Metrics = { viewW: 600, viewH: 800, boardW: 400, boardH: 500 };
    const big = { scale: 2, tx: 99, ty: -9999 }; // 盘 800x1000
    expect(clampView(big, m)).toEqual({ scale: 2, tx: 0, ty: -200 }); // tx∈[-200,0], ty∈[-200,0]
  });

  it("zoomAt 不动点：缩放后指针下的盘面点不变", () => {
    // fit = min(600/800, 800/1000) = 0.75，max = max(0.75, 64/40) = 1.6
    // 起点与目标 scale 都取区间 (fit, max) 内、且远离平移钳制边界的内点，不动点性质才严格成立
    const m: Metrics = { viewW: 600, viewH: 800, boardW: 800, boardH: 1000 };
    const v0 = { scale: 1.2, tx: -100, ty: -50 };
    const v1 = zoomAt(v0, m, 100, 100, 1.25);
    expect(v1.scale).toBeCloseTo(1.5);
    // 盘面点 p = (px - tx)/s 缩放前后不变
    expect((100 - v1.tx) / v1.scale).toBeCloseTo((100 - v0.tx) / v0.scale);
    expect((100 - v1.ty) / v1.scale).toBeCloseTo((100 - v0.ty) / v0.scale);
  });

  it("zoomAt 缩放范围被钳制在 [fitScale, maxScale]", () => {
    const m: Metrics = { viewW: 600, viewH: 800, boardW: 300, boardH: 400 }; // fit=2
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, m, 0, 0, 0.5).scale).toBe(2); // 不许缩小过 fit
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, m, 0, 0, 100).scale).toBe(2); // max=2 封顶
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/viewport.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 创建 `src/ui/viewport.ts`（本任务只含数学部分）**

```ts
// 视口变换与手势判定：纯逻辑、不依赖 DOM（v2 设计文档 §2）

export interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

export interface Metrics {
  viewW: number;
  viewH: number;
  boardW: number;
  boardH: number;
}

export const BASE_CELL_PX = 40;
export const MAX_CELL_PX = 64;

export function fitScale(m: Metrics): number {
  if (m.viewW <= 0 || m.viewH <= 0 || m.boardW <= 0 || m.boardH <= 0) return 1;
  return Math.min(m.viewW / m.boardW, m.viewH / m.boardH);
}

export function maxScale(m: Metrics): number {
  return Math.max(fitScale(m), MAX_CELL_PX / BASE_CELL_PX);
}

/** 平移钳制：盘小于视口的轴向居中，大于视口的轴向不许露底 */
export function clampView(v: ViewState, m: Metrics): ViewState {
  const bw = m.boardW * v.scale;
  const bh = m.boardH * v.scale;
  const tx = bw <= m.viewW ? (m.viewW - bw) / 2 : Math.min(0, Math.max(m.viewW - bw, v.tx));
  const ty = bh <= m.viewH ? (m.viewH - bh) / 2 : Math.min(0, Math.max(m.viewH - bh, v.ty));
  return { scale: v.scale, tx, ty };
}

/** 以视口内点 (px,py) 为不动点缩放 factor 倍，缩放范围 [fitScale, maxScale]，并钳制平移 */
export function zoomAt(
  v: ViewState,
  m: Metrics,
  px: number,
  py: number,
  factor: number,
): ViewState {
  const s = Math.min(maxScale(m), Math.max(fitScale(m), v.scale * factor));
  const k = s / v.scale;
  return clampView({ scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }, m);
}
```

- [ ] **Step 4: 测试 + 提交**

Run: `npx vitest run tests/viewport.test.ts` — Expected: PASS；再 `npm test` 全绿

```bash
git add src/ui/viewport.ts tests/viewport.test.ts
git commit -m "feat: 视口变换数学（适配缩放/平移钳制/定点缩放）"
```

---

### Task 4: 手势状态机（防误触核心）

**Files:**
- Modify: `src/ui/viewport.ts`（追加）
- Modify: `tests/viewport.test.ts`（追加）

**Interfaces:**
- Produces（Task 5 依赖）：

```ts
export const MOUSE_SLOP_PX = 4;
export const TOUCH_SLOP_PX = 10;
export type GestureEvent =
  | { type: "down"; id: number; x: number; y: number; touch: boolean; button: number }
  | { type: "move"; id: number; x: number; y: number }
  | { type: "up"; id: number; x: number; y: number }
  | { type: "cancel"; id: number }
  | { type: "longpress" };
export type GestureAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; cx: number; cy: number; factor: number; dx: number; dy: number }
  | { type: "tap"; alt: boolean; touch: boolean }
  | { type: "startTimer" }
  | { type: "cancelTimer" };
export function createGestures(): { handle(e: GestureEvent): GestureAction[] };
```

语义约定（Task 5 按此接线）：`tap.alt=false` 主动作（鼠标左键/触摸点按）；`tap.alt=true` 次动作（鼠标右键/触摸长按）。`startTimer/cancelTimer` 由 DOM 层用 `setTimeout(LONG_PRESS_MS)` 落实，定时到点回注 `{type:"longpress"}`。

- [ ] **Step 1: 追加失败测试到 `tests/viewport.test.ts`**

```ts
import { createGestures, MOUSE_SLOP_PX, TOUCH_SLOP_PX, type GestureAction } from "../src/ui/viewport";

const types = (as: GestureAction[]): string[] => as.map((a) => a.type);

describe("手势状态机", () => {
  it("鼠标：位移小于阈值 → 抬起触发 tap(主)", () => {
    const g = createGestures();
    expect(g.handle({ type: "down", id: 1, x: 100, y: 100, touch: false, button: 0 })).toEqual([]);
    expect(g.handle({ type: "move", id: 1, x: 102, y: 101 })).toEqual([]); // < 4px
    expect(g.handle({ type: "up", id: 1, x: 102, y: 101 })).toEqual([
      { type: "tap", alt: false, touch: false },
    ]);
  });

  it("鼠标：位移超阈值 → 转平移，抬起不触发 tap", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: false, button: 0 });
    const a = g.handle({ type: "move", id: 1, x: 100 + MOUSE_SLOP_PX, y: 100 });
    expect(a).toEqual([{ type: "pan", dx: MOUSE_SLOP_PX, dy: 0 }]);
    expect(g.handle({ type: "move", id: 1, x: 110, y: 103 })).toEqual([
      { type: "pan", dx: 110 - (100 + MOUSE_SLOP_PX), dy: 3 },
    ]);
    expect(g.handle({ type: "up", id: 1, x: 110, y: 103 })).toEqual([]);
  });

  it("鼠标右键：按下立即 tap(次)，随后的移动/抬起无动作", () => {
    const g = createGestures();
    expect(g.handle({ type: "down", id: 1, x: 5, y: 5, touch: false, button: 2 })).toEqual([
      { type: "tap", alt: true, touch: false },
    ]);
    expect(g.handle({ type: "move", id: 1, x: 50, y: 50 })).toEqual([]);
    expect(g.handle({ type: "up", id: 1, x: 50, y: 50 })).toEqual([]);
    // 冷却结束后恢复正常
    g.handle({ type: "down", id: 1, x: 0, y: 0, touch: false, button: 0 });
    expect(types(g.handle({ type: "up", id: 1, x: 0, y: 0 }))).toEqual(["tap"]);
  });

  it("触摸：按下启动长按计时；小位移点按 → cancelTimer + tap(主)", () => {
    const g = createGestures();
    expect(g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 })).toEqual([
      { type: "startTimer" },
    ]);
    expect(g.handle({ type: "up", id: 1, x: 12, y: 10 })).toEqual([
      { type: "cancelTimer" },
      { type: "tap", alt: false, touch: true },
    ]);
  });

  it("触摸：长按到点 → tap(次)，其后抬起无动作", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 });
    expect(g.handle({ type: "longpress" })).toEqual([{ type: "tap", alt: true, touch: true }]);
    expect(g.handle({ type: "up", id: 1, x: 10, y: 10 })).toEqual([]);
  });

  it("触摸：位移超阈值 → 取消长按并转平移，抬起不点按", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 });
    const a = g.handle({ type: "move", id: 1, x: 10 + TOUCH_SLOP_PX, y: 10 });
    expect(a).toEqual([
      { type: "cancelTimer" },
      { type: "pan", dx: TOUCH_SLOP_PX, dy: 0 },
    ]);
    expect(g.handle({ type: "up", id: 1, x: 40, y: 10 })).toEqual([]);
    expect(g.handle({ type: "longpress" })).toEqual([]); // 迟到的计时器无害
  });

  it("双指落下即捏合：取消点按意图，产出 pinch（中点缩放+平移）", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: true, button: 0 });
    expect(g.handle({ type: "down", id: 2, x: 200, y: 100, touch: true, button: 0 })).toEqual([
      { type: "cancelTimer" },
    ]); // 起始距离 100，中点 (150,100)
    const a = g.handle({ type: "move", id: 2, x: 300, y: 100 }); // 距离 200，中点 (200,100)
    expect(a).toHaveLength(1);
    const p = a[0] as Extract<GestureAction, { type: "pinch" }>;
    expect(p.type).toBe("pinch");
    expect(p.factor).toBeCloseTo(2);
    expect(p.cx).toBe(200);
    expect(p.cy).toBe(100);
    expect(p.dx).toBe(50);
    expect(p.dy).toBe(0);
  });

  it("捏合后冷却：先后抬起两指都不触发点按，全部离开后才恢复", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: true, button: 0 });
    g.handle({ type: "down", id: 2, x: 200, y: 100, touch: true, button: 0 });
    expect(g.handle({ type: "up", id: 2, x: 200, y: 100 })).toEqual([]);
    expect(g.handle({ type: "up", id: 1, x: 100, y: 100 })).toEqual([]); // 残留指抬起也不点按
    g.handle({ type: "down", id: 3, x: 10, y: 10, touch: true, button: 0 });
    expect(types(g.handle({ type: "up", id: 3, x: 10, y: 10 }))).toEqual(["cancelTimer", "tap"]);
  });

  it("cancel 事件终止当前手势", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 });
    expect(g.handle({ type: "cancel", id: 1 })).toEqual([{ type: "cancelTimer" }]);
    expect(g.handle({ type: "longpress" })).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/viewport.test.ts`
Expected: FAIL（createGestures 未导出）

- [ ] **Step 3: 在 `src/ui/viewport.ts` 追加状态机实现**

```ts
// ===== 手势状态机（防误触，v2 设计文档 §2.2）=====

export const MOUSE_SLOP_PX = 4;
export const TOUCH_SLOP_PX = 10;

export type GestureEvent =
  | { type: "down"; id: number; x: number; y: number; touch: boolean; button: number }
  | { type: "move"; id: number; x: number; y: number }
  | { type: "up"; id: number; x: number; y: number }
  | { type: "cancel"; id: number }
  | { type: "longpress" };

export type GestureAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; cx: number; cy: number; factor: number; dx: number; dy: number }
  | { type: "tap"; alt: boolean; touch: boolean }
  | { type: "startTimer" }
  | { type: "cancelTimer" };

type Pt = { x: number; y: number };
type State = "idle" | "maybeTap" | "pan" | "pinch" | "cooldown";

export function createGestures(): { handle(e: GestureEvent): GestureAction[] } {
  let state: State = "idle";
  let touch = false;
  let primaryId = -1;
  let start: Pt = { x: 0, y: 0 };
  const held = new Map<number, Pt>(); // 按下中的指针
  let pinchDist = 0;
  let pinchMid: Pt = { x: 0, y: 0 };

  const settle = (): void => {
    state = held.size > 0 ? "cooldown" : "idle";
  };

  return {
    handle(e) {
      const out: GestureAction[] = [];
      switch (e.type) {
        case "down": {
          held.set(e.id, { x: e.x, y: e.y });
          if (state === "cooldown") break;
          if (state === "idle") {
            if (!e.touch && e.button === 2) {
              out.push({ type: "tap", alt: true, touch: false }); // 右键按下即插旗
              state = "cooldown";
              break;
            }
            if (!e.touch && e.button !== 0) {
              state = "cooldown"; // 中键等其它键：无动作
              break;
            }
            state = "maybeTap";
            touch = e.touch;
            primaryId = e.id;
            start = { x: e.x, y: e.y };
            if (e.touch) out.push({ type: "startTimer" });
          } else if (touch && (state === "maybeTap" || state === "pan")) {
            // 第二根手指落下：进入捏合，取消一切点按意图
            if (state === "maybeTap") out.push({ type: "cancelTimer" });
            state = "pinch";
            const [a, b] = [...held.values()];
            pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            pinchMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
          } else {
            if (state === "maybeTap") out.push({ type: "cancelTimer" });
            state = "cooldown"; // 鼠标按键并发等异常 → 冷却
          }
          break;
        }
        case "move": {
          const prev = held.get(e.id);
          if (!prev) break;
          held.set(e.id, { x: e.x, y: e.y });
          if (state === "maybeTap" && e.id === primaryId) {
            const slop = touch ? TOUCH_SLOP_PX : MOUSE_SLOP_PX;
            if (Math.hypot(e.x - start.x, e.y - start.y) >= slop) {
              if (touch) out.push({ type: "cancelTimer" });
              state = "pan";
              out.push({ type: "pan", dx: e.x - prev.x, dy: e.y - prev.y });
            }
          } else if (state === "pan" && e.id === primaryId) {
            out.push({ type: "pan", dx: e.x - prev.x, dy: e.y - prev.y });
          } else if (state === "pinch") {
            const [a, b] = [...held.values()];
            if (!a || !b) break;
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            out.push({
              type: "pinch",
              cx: mid.x,
              cy: mid.y,
              factor: pinchDist > 0 ? dist / pinchDist : 1,
              dx: mid.x - pinchMid.x,
              dy: mid.y - pinchMid.y,
            });
            pinchDist = dist;
            pinchMid = mid;
          }
          break;
        }
        case "up": {
          if (!held.delete(e.id)) break;
          if (state === "maybeTap" && e.id === primaryId) {
            if (touch) out.push({ type: "cancelTimer" });
            out.push({ type: "tap", alt: false, touch });
            state = "idle";
          } else {
            settle(); // pan/pinch/cooldown 抬起：捏合后残留指同样不点按
          }
          break;
        }
        case "cancel": {
          if (held.delete(e.id)) {
            if (state === "maybeTap" && touch) out.push({ type: "cancelTimer" });
            settle();
          }
          break;
        }
        case "longpress": {
          if (state === "maybeTap" && touch) {
            out.push({ type: "tap", alt: true, touch: true });
            state = "cooldown"; // 长按已消费，后续抬起不再点按
          }
          break;
        }
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: 测试 + 提交**

Run: `npx vitest run tests/viewport.test.ts` — Expected: PASS；`npm test` 全绿

```bash
git add src/ui/viewport.ts tests/viewport.test.ts
git commit -m "feat: 手势状态机（点按/拖动阈值、右键即旗、捏合与冷却防误触）"
```

---

### Task 5: game.ts 视口接线（缩放/平移/输入重写）

**Files:**
- Modify: `src/ui/game.ts`
- Modify: `src/ui/style.css`（`.board-wrap` → `.board-viewport`、`.board` 定位与固定格大小）
- Modify: `tests/ui.test.ts`（游戏页区块：输入助手改 down+up、加拖动/滚轮/长按用例）

**Interfaces:**
- Consumes: viewport.ts 的全部导出（Task 3/4 签名）。
- Produces: `showGame` 对外签名不变；棋盘 DOM 结构变为 `.board-viewport > .board`；`.board` 使用 `style.transform`、显式 `width/height`（px）。格基准 40px、间隙 3px、内边距 10px（常量 `BOARD_PAD=10`、`CELL_GAP=3`）。

- [ ] **Step 1: 更新 `tests/ui.test.ts` 游戏页区块（先写测试）**

把 `mouse()` 助手整体替换为：

```ts
/** 模拟一次完整点按/拖动：down →(可选 move)→ up。jsdom 无 PointerEvent，用 MouseEvent 冒充 */
function press(el: Element, opts: { button?: number; dx?: number; dy?: number; touch?: boolean } = {}): void {
  const { button = 0, dx = 0, dy = 0, touch = false } = opts;
  const fire = (type: string, x: number, y: number): void => {
    const e = new MouseEvent(type, { bubbles: true, button, clientX: x, clientY: y });
    Object.defineProperty(e, "pointerType", { value: touch ? "touch" : "mouse" });
    el.dispatchEvent(e);
  };
  fire("pointerdown", 100, 100);
  if (dx !== 0 || dy !== 0) fire("pointermove", 100 + dx, 100 + dy);
  fire("pointerup", 100 + dx, 100 + dy);
}
```

游戏页 describe 内：所有 `mouse(cells[i]!, "pointerdown")` → `press(cells[i]!)`；`mouse(cells[7]!, "pointerdown", 2)` → `press(cells[7]!, { button: 2 })`。

新增用例（放在"倒计时归零判负"之后）：

```ts
it("拖动超过阈值：平移雷区且不挖格", () => {
  const cells = start();
  press(cells[63]!, { dx: -30 });
  expect(root.querySelectorAll(".cell.open")).toHaveLength(0); // 未误触
  const board = root.querySelector<HTMLElement>(".board")!;
  expect(board.style.transform).toBe("translate(-30px, 0px) scale(1)");
});

it("滚轮缩放：以指针为中心改变 scale", () => {
  start();
  const vp = root.querySelector<HTMLElement>(".board-viewport")!;
  vp.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
  const board = root.querySelector<HTMLElement>(".board")!;
  expect(board.style.transform).toContain("scale(1.15");
});

it("触摸长按 = 反模式（挖开模式下长按插旗）", () => {
  const cells = start();
  press(cells[63]!, { touch: true }); // 触摸点按开局
  const down = new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 });
  Object.defineProperty(down, "pointerType", { value: "touch" });
  cells[7]!.dispatchEvent(down);
  vi.advanceTimersByTime(400); // 越过 LONG_PRESS_MS=350
  const up = new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 100, clientY: 100 });
  Object.defineProperty(up, "pointerType", { value: "touch" });
  cells[7]!.dispatchEvent(up);
  expect(cells[7]!.textContent).toBe("🚩");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL（现实现鼠标在 pointerdown 挖格，拖动/滚轮用例失败；`.board-viewport` 不存在）

- [ ] **Step 3: 改写 `src/ui/game.ts`**

顶部 import 追加：

```ts
import {
  BASE_CELL_PX,
  clampView,
  createGestures,
  fitScale,
  zoomAt,
  type GestureAction,
  type Metrics,
  type ViewState,
} from "./viewport";
```

常量区追加：

```ts
const BOARD_PAD = 10;
const CELL_GAP = 3;
const WHEEL_STEP = 1.15;
```

DOM 段：把 `boardWrap`（`.board-wrap`）替换为视口容器，并给棋盘显式尺寸：

```ts
const boardVp = document.createElement("div");
boardVp.className = "board-viewport";
const boardEl = document.createElement("div");
boardEl.className = "board";
boardEl.style.setProperty("--w", String(w));
const boardW = BOARD_PAD * 2 + w * BASE_CELL_PX + (w - 1) * CELL_GAP;
const boardH = BOARD_PAD * 2 + h * BASE_CELL_PX + (h - 1) * CELL_GAP;
boardEl.style.width = `${boardW}px`;
boardEl.style.height = `${boardH}px`;
boardVp.appendChild(boardEl);
```

`game.append(top, boardWrap, bottom)` → `game.append(top, boardVp, bottom)`；删除原 `--h` 设置（高度已显式）。

视图状态与应用（放在 DOM 段之后）：

```ts
// ===== 视口（缩放/平移）=====
let view: ViewState = { scale: 1, tx: 0, ty: 0 };
let lastFit = 1;

function metrics(): Metrics {
  return { viewW: boardVp.clientWidth, viewH: boardVp.clientHeight, boardW, boardH };
}

function applyView(): void {
  boardEl.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
}

function refit(): void {
  const m = metrics();
  lastFit = fitScale(m);
  view = clampView({ scale: lastFit, tx: 0, ty: 0 }, m);
  applyView();
}

function onResize(): void {
  if (!game.isConnected) {
    window.removeEventListener("resize", onResize); // 页面已被替换，自清理
    return;
  }
  const m = metrics();
  const wasFit = Math.abs(view.scale - lastFit) < 1e-3;
  lastFit = fitScale(m);
  view = wasFit
    ? clampView({ scale: lastFit, tx: 0, ty: 0 }, m)
    : clampView({ ...view, scale: zoomAt(view, m, 0, 0, 1).scale }, m);
  applyView();
}

refit(); // jsdom 下尺寸为 0，fitScale 回退 1，保持确定性
requestAnimationFrame(refit); // 真实浏览器等布局完成后精确适配
window.addEventListener("resize", onResize);
```

输入段：**整体删除** v1 的 `pressTimer/longPressed`、`pointerdown/pointerup/pointercancel/pointerleave` 四个监听与 `clearPress`，替换为：

```ts
// ===== 输入：手势状态机接线 =====
const gestures = createGestures();
let longTimer: ReturnType<typeof setTimeout> | null = null;
let downCellVi: number | null = null; // 手势起点所在格（视觉索引）

boardVp.addEventListener("contextmenu", (e) => e.preventDefault());

function vpPoint(e: MouseEvent): { x: number; y: number } {
  const r = boardVp.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function pid(e: Event): number {
  return (e as PointerEvent).pointerId ?? 0;
}

function isTouch(e: Event): boolean {
  return (e as PointerEvent).pointerType !== "mouse";
}

function run(actions: GestureAction[]): void {
  for (const a of actions) {
    switch (a.type) {
      case "pan": {
        view = clampView({ scale: view.scale, tx: view.tx + a.dx, ty: view.ty + a.dy }, metrics());
        applyView();
        break;
      }
      case "pinch": {
        const m = metrics();
        view = zoomAt(view, m, a.cx, a.cy, a.factor);
        view = clampView({ scale: view.scale, tx: view.tx + a.dx, ty: view.ty + a.dy }, m);
        applyView();
        break;
      }
      case "tap": {
        if (downCellVi === null || finished) break;
        const action: Mode = a.touch
          ? a.alt
            ? mode === "dig"
              ? "flag"
              : "dig"
            : mode
          : a.alt
            ? "flag"
            : "dig";
        if (a.touch && a.alt) navigator.vibrate?.(10);
        act(downCellVi, action);
        break;
      }
      case "startTimer": {
        longTimer = setTimeout(() => run(gestures.handle({ type: "longpress" })), LONG_PRESS_MS);
        break;
      }
      case "cancelTimer": {
        if (longTimer !== null) {
          clearTimeout(longTimer);
          longTimer = null;
        }
        break;
      }
    }
  }
}

boardVp.addEventListener("pointerdown", (e) => {
  downCellVi = cellIndex(e.target);
  boardVp.setPointerCapture?.(pid(e));
  const p = vpPoint(e);
  run(gestures.handle({ type: "down", id: pid(e), x: p.x, y: p.y, touch: isTouch(e), button: e.button }));
});

boardVp.addEventListener("pointermove", (e) => {
  const p = vpPoint(e);
  run(gestures.handle({ type: "move", id: pid(e), x: p.x, y: p.y }));
});

boardVp.addEventListener("pointerup", (e) => {
  const p = vpPoint(e);
  run(gestures.handle({ type: "up", id: pid(e), x: p.x, y: p.y }));
});

boardVp.addEventListener("pointercancel", (e) => {
  run(gestures.handle({ type: "cancel", id: pid(e) }));
});

boardVp.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = vpPoint(e);
    view = zoomAt(view, metrics(), p.x, p.y, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    applyView();
  },
  { passive: false },
);
```

`cellIndex` 保留原实现。`exit()`/`restart()` 里各加一行 `window.removeEventListener("resize", onResize);`（`onResize` 的 isConnected 守卫是兜底，主动清理是正道）。

- [ ] **Step 4: 更新 `src/ui/style.css` 棋盘区**

`.board-wrap` 规则整体替换为：

```css
.board-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
  touch-action: none;
}
```

`.board` 规则整体替换为（固定基准格大小，尺寸变化全交给 transform）：

```css
.board {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  display: grid;
  grid-template-columns: repeat(var(--w), 40px);
  grid-auto-rows: 40px;
  gap: 3px;
  padding: 10px;
  background: var(--card);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-soft);
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
```

`.cell` 的 `font-size: calc(var(--cell-size) * 0.48)` → `font-size: 19px`；`.cell.flagged, .cell.mine-shown, .cell.boom, .cell.wrong` 的 `font-size: calc(var(--cell-size) * 0.52)` → `font-size: 21px`。

- [ ] **Step 5: 测试 + 提交**

Run: `npm test` — Expected: 全绿（含新拖动/滚轮/长按用例）

```bash
git add src/ui/game.ts src/ui/style.css tests/ui.test.ts
git commit -m "feat: 雷区视口接线（滚轮/捏合缩放、拖动平移、点按防误触）"
```

---

### Task 6: 预旗（开局前插旗）+ PC 操作提示

**Files:**
- Modify: `src/ui/game.ts`
- Modify: `src/ui/style.css`
- Modify: `tests/ui.test.ts`（追加 2 用例）

**Interfaces:**
- Consumes: Task 5 后的 game.ts 结构。
- Produces: 行为规则——盘面生成前右键/旗模式点按可插旗（存 `preFlags: Set<逻辑索引>`）；预旗格在首挖时原样落盘；预旗格上"挖"无操作；剩余雷数 = `mines - preFlags.size`。新 DOM：`.pc-hint` 提示行（仅 fine pointer 显示）。

- [ ] **Step 1: 追加失败测试到 `tests/ui.test.ts` 游戏页区块**

```ts
it("开局前可插旗：计数联动、首挖后旗保留", () => {
  const cells = start();
  press(cells[7]!, { button: 2 }); // 盘面未生成时右键
  expect(cells[7]!.textContent).toBe("🚩");
  expect(root.querySelector(".game-stats")!.textContent).toContain("6"); // 7 - 1
  press(cells[7]!, { button: 2 }); // 再点取消
  expect(cells[7]!.textContent).toBe("");
  press(cells[7]!, { button: 2 }); // 重新插上
  press(cells[63]!); // 首挖生成盘面
  expect(cells[7]!.textContent).toBe("🚩"); // 旗保留
  expect(root.querySelector(".game-stats")!.textContent).toContain("6");
});

it("开局前预旗格上左键挖无操作（不生成盘面）", () => {
  const cells = start();
  press(cells[5]!, { button: 2 });
  press(cells[5]!); // 对着旗挖
  expect(root.querySelectorAll(".cell.open")).toHaveLength(0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL（现实现开局前右键被忽略）

- [ ] **Step 3: 实现预旗**

`showGame` 状态区加 `const preFlags = new Set<number>();`（紧邻 `let board`）。

`act()` 开头改为：

```ts
function act(i: number, action: Mode): void {
  if (finished) return;
  const liEarly = toLogical(i);
  if (board === null) {
    if (action === "flag") {
      // 开局前预旗：只记标记，不生成盘面
      if (preFlags.has(liEarly)) preFlags.delete(liEarly);
      else preFlags.add(liEarly);
      syncCell(i);
      updateStats();
      return;
    }
    if (preFlags.has(liEarly)) return; // 旗格不可挖，也不触发开局
    board = generate(level, liEarly, mulberry32((Math.random() * 2 ** 32) >>> 0));
    for (const li of preFlags) toggleFlag(board, li); // 预旗原样落盘
    preFlags.clear();
    startTimer();
  }
  // …以下与原实现相同（const b = board; const li = toLogical(i); …）
}
```

`syncCell` 开头的空盘分支改为渲染预旗：

```ts
function syncCell(vi: number): void {
  const el = cells[vi]!;
  if (board === null) {
    const li = toLogical(vi);
    if (preFlags.has(li)) {
      el.className = "cell flagged";
      el.textContent = "🚩";
    } else {
      el.className = "cell";
      el.textContent = "";
    }
    return;
  }
  // …原有已生成盘面的渲染逻辑不变
}
```

`updateStats` 改为：

```ts
function updateStats(): void {
  const left = board === null ? level.mines - preFlags.size : level.mines - flaggedCount(board);
  mineStat.textContent = `💣 ${left}`;
}
```

- [ ] **Step 4: 加 PC 提示行**

`bottom.append(modeToggle, restartBtn);` 之后：

```ts
const hint = document.createElement("p");
hint.className = "pc-hint";
hint.textContent = "左键挖开 · 右键插旗 · 滚轮缩放 · 拖动平移";
game.append(top, boardVp, bottom, hint);
```

（替换原 `game.append(top, boardVp, bottom)` 行。）

style.css 底部操作区追加：

```css
.pc-hint {
  display: none;
  text-align: center;
  font-size: 0.8rem;
  color: var(--ink-soft);
  letter-spacing: 0.06em;
}

@media (pointer: fine) {
  .pc-hint {
    display: block;
  }
}
```

- [ ] **Step 5: 测试 + 提交**

Run: `npm test` — Expected: 全绿

```bash
git add src/ui/game.ts src/ui/style.css tests/ui.test.ts
git commit -m "feat: 开局前预旗与 PC 操作提示（修复首下右键无效）"
```

---

### Task 7: 藤蔓布局纯函数 vine.ts

**Files:**
- Create: `src/ui/vine.ts`
- Create: `tests/vine.test.ts`

**Interfaces:**
- Consumes: `LEVELS`、`Tier`、`LevelSpec`（Task 1）。
- Produces（Task 8 依赖）：

```ts
export interface VinePoint { x: number; y: number }
export interface VineNode extends VinePoint { levelId: number }
export interface VineSegment { tier: Tier; points: VinePoint[] }
export interface VineLayout { width: number; height: number; nodes: VineNode[]; segments: VineSegment[] }
export const VINE_W = 260;
export function vineLayout(levels: LevelSpec[]): VineLayout;
```

坐标系：SVG viewBox 单位；第 1 关在最下（y 最大），关越深 y 越小；x 以 130 为轴、振幅 80、周期 10 关的余弦摆动。

- [ ] **Step 1: 写失败测试 `tests/vine.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/core/levels";
import { vineLayout, VINE_W } from "../src/ui/vine";

describe("vineLayout", () => {
  const L = vineLayout(LEVELS);

  it("每关一个节点，第 1 关在最底部，越深越高（y 严格递减）", () => {
    expect(L.nodes).toHaveLength(20);
    expect(L.nodes[0]!.levelId).toBe(1);
    for (let i = 1; i < L.nodes.length; i++) {
      expect(L.nodes[i]!.y).toBeLessThan(L.nodes[i - 1]!.y);
    }
  });

  it("节点横向在藤蔓摆动范围内，纵向留了上下边距", () => {
    for (const n of L.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(130 - 80);
      expect(n.x).toBeLessThanOrEqual(130 + 80);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(L.height);
    }
    expect(L.width).toBe(VINE_W);
  });

  it("色带按档分段、相邻段共享边界点（拐点相接）", () => {
    expect(L.segments.map((s) => s.tier)).toEqual(["easy", "challenge", "hard", "expert", "abyss"]);
    for (let i = 1; i < L.segments.length; i++) {
      const prev = L.segments[i - 1]!.points;
      expect(prev[prev.length - 1]).toEqual(L.segments[i]!.points[0]);
    }
    // 每段 = 本档 4 节点 + 下一档首节点（末段除外）
    expect(L.segments[0]!.points).toHaveLength(5);
    expect(L.segments[4]!.points).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/vine.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 创建 `src/ui/vine.ts`**

```ts
import type { LevelSpec, Tier } from "../core/levels";

export interface VinePoint {
  x: number;
  y: number;
}
export interface VineNode extends VinePoint {
  levelId: number;
}
export interface VineSegment {
  tier: Tier;
  points: VinePoint[];
}
export interface VineLayout {
  width: number;
  height: number;
  nodes: VineNode[];
  segments: VineSegment[];
}

export const VINE_W = 260;
const STEP_Y = 64;
const AMP = 80;
const CX = 130;
const PAD_TOP = 70;
const PAD_BOTTOM = 56;
const PERIOD = 10; // 每 10 关摆动一个来回

/** 蜿蜒藤蔓布局：第 1 关在最底部（根），难度越深位置越高（v2 设计文档 §3） */
export function vineLayout(levels: LevelSpec[]): VineLayout {
  const n = levels.length;
  const height = PAD_TOP + (n - 1) * STEP_Y + PAD_BOTTOM;
  const nodes: VineNode[] = levels.map((l, i) => ({
    levelId: l.id,
    x: Math.round(CX - AMP * Math.cos((i * 2 * Math.PI) / PERIOD)),
    y: PAD_TOP + (n - 1 - i) * STEP_Y,
  }));

  const segments: VineSegment[] = [];
  for (let i = 0; i < n; ) {
    const tier = levels[i]!.tier;
    let j = i;
    while (j < n && levels[j]!.tier === tier) j++;
    // 含下一档首节点，使相邻色带在拐点处相接
    const points = nodes.slice(i, Math.min(j + 1, n)).map(({ x, y }) => ({ x, y }));
    segments.push({ tier, points });
    i = j;
  }
  return { width: VINE_W, height, nodes, segments };
}
```

- [ ] **Step 4: 测试 + 提交**

Run: `npx vitest run tests/vine.test.ts` — Expected: PASS；`npm test` 全绿

```bash
git add src/ui/vine.ts tests/vine.test.ts
git commit -m "feat: 藤蔓选关布局纯函数（蜿蜒锚点与档位色带分段）"
```

---

### Task 8: 选关页藤蔓重写

**Files:**
- Modify: `src/ui/menu.ts`（整文件替换，移除 Task 1 的临时补丁）
- Modify: `src/ui/style.css`（删 `.tier/.tier-grid/.level-tile` 系列，增藤蔓样式与新档色）
- Modify: `tests/ui.test.ts`（选关页 describe 重写）

**Interfaces:**
- Consumes: `vineLayout/VINE_W`（Task 7）、`LEVELS/TIER_NAMES`（Task 1）、`GameStorage`（Task 2）。
- Produces: `showMenu(root, deps)` 签名不变。DOM 结构：`.menu > .menu-head + [.menu-note] + .vine-map(.vine-svg + .vine-node×20)`。节点类：`.vine-node.tier-<tier>[.done][.current][.locked]`；子元素 `.vn-num`、`.vn-best`。

- [ ] **Step 1: 重写 `tests/ui.test.ts` 选关页 describe（先写测试）**

```ts
describe("选关页", () => {
  it("渲染 20 个藤蔓节点，仅第 1 关可玩，其余锁定", () => {
    showMenu(root, { storage: createStorage(memBackend()), onPlay: () => {} });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes).toHaveLength(20);
    expect(nodes[0]!.disabled).toBe(false);
    expect(nodes[0]!.classList.contains("current")).toBe(true);
    for (let i = 1; i < 20; i++) {
      expect(nodes[i]!.disabled).toBe(true);
      expect(nodes[i]!.classList.contains("locked")).toBe(true);
    }
    expect(root.querySelector(".menu-sub")!.textContent).toContain("二十关");
    expect(root.querySelectorAll(".vine-svg polyline").length).toBeGreaterThanOrEqual(6); // 底线+5 档色带
  });

  it("显示最好成绩、当前关高亮并自动滚动定位、可进入已解锁关", () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const storage = createStorage(memBackend());
    storage.recordWin(1, 83);
    const played: number[] = [];
    showMenu(root, { storage, onPlay: (l) => played.push(l.id) });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes[0]!.classList.contains("done")).toBe(true);
    expect(nodes[0]!.textContent).toContain("1:23");
    expect(nodes[1]!.disabled).toBe(false);
    expect(nodes[1]!.classList.contains("current")).toBe(true);
    expect(scrolled).toHaveBeenCalled();
    nodes[1]!.click();
    expect(played).toEqual([2]);
  });
});
```

（顶部 import 需含 `vi`，已有。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL（`.vine-node` 不存在）

- [ ] **Step 3: 整文件替换 `src/ui/menu.ts`**

```ts
import { LEVELS, type LevelSpec } from "../core/levels";
import type { GameStorage } from "../core/storage";
import { fmtTime } from "./format";
import { vineLayout, type VineLayout, type VineNode } from "./vine";

export interface MenuDeps {
  storage: GameStorage;
  /** 存档降级为内存态时为 true，用于提示成绩不会保存 */
  persistWarning?: boolean;
  onPlay(level: LevelSpec): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function showMenu(root: HTMLElement, deps: MenuDeps): void {
  const save = deps.storage.load();

  const menu = document.createElement("div");
  menu.className = "menu";

  const head = document.createElement("header");
  head.className = "menu-head";
  head.innerHTML = `<h1>扫雷</h1><p class="menu-sub">无猜 · 二十关 · 五档</p>`;
  menu.appendChild(head);

  if (deps.persistWarning) {
    const note = document.createElement("p");
    note.className = "menu-note";
    note.textContent = "当前无法读写本地存储，成绩与进度只在本次游戏内有效";
    menu.appendChild(note);
  }

  const layout = vineLayout(LEVELS);
  const map = document.createElement("div");
  map.className = "vine-map";
  map.appendChild(buildSvg(layout));

  let currentEl: HTMLElement | null = null;
  LEVELS.forEach((level, i) => {
    const btn = vineNode(level, layout.nodes[i]!, layout, save.unlockedLevel, save.bestTimes[level.id], deps);
    if (btn.classList.contains("current")) currentEl = btn;
    map.appendChild(btn);
  });

  menu.appendChild(map);
  root.replaceChildren(menu);
  // 打开即定位到当前进度（jsdom 无 scrollIntoView 时静默跳过）
  currentEl?.scrollIntoView?.({ block: "center" });
}

function buildSvg(layout: VineLayout): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  svg.classList.add("vine-svg");

  const pts = (points: { x: number; y: number }[]): string =>
    points.map((p) => `${p.x},${p.y}`).join(" ");

  const base = document.createElementNS(SVG_NS, "polyline");
  base.setAttribute("points", pts(layout.nodes));
  base.classList.add("vine-base");
  svg.appendChild(base);

  for (const seg of layout.segments) {
    const pl = document.createElementNS(SVG_NS, "polyline");
    pl.setAttribute("points", pts(seg.points));
    pl.classList.add("vine-band", `tier-${seg.tier}`);
    svg.appendChild(pl);
  }

  const deco = (x: number, y: number, glyph: string): void => {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("font-size", "16");
    t.textContent = glyph;
    svg.appendChild(t);
  };
  const rootNode = layout.nodes[0]!;
  const topNode = layout.nodes[layout.nodes.length - 1]!;
  deco(rootNode.x - 30, rootNode.y + 26, "🌱");
  deco(topNode.x + 16, topNode.y - 20, "👑");
  return svg;
}

function vineNode(
  level: LevelSpec,
  pos: VineNode,
  layout: VineLayout,
  unlockedLevel: number,
  best: number | undefined,
  deps: MenuDeps,
): HTMLButtonElement {
  const locked = level.id > unlockedLevel;
  const done = best !== undefined || level.id < unlockedLevel;
  const current = !locked && !done;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `vine-node tier-${level.tier}`;
  if (locked) btn.classList.add("locked");
  if (done) btn.classList.add("done");
  if (current) btn.classList.add("current");
  btn.style.left = `${(pos.x / layout.width) * 100}%`;
  btn.style.top = `${(pos.y / layout.height) * 100}%`;

  const num = document.createElement("span");
  num.className = "vn-num num";
  num.textContent = String(level.id);
  const sub = document.createElement("span");
  sub.className = "vn-best num";
  sub.textContent = locked ? "🔒" : best !== undefined ? fmtTime(best) : "未通关";
  btn.append(num, sub);

  if (locked) {
    btn.disabled = true;
    btn.setAttribute("aria-label", `第 ${level.id} 关（未解锁）`);
  } else {
    btn.setAttribute(
      "aria-label",
      `第 ${level.id} 关，${best !== undefined ? `最好成绩 ${fmtTime(best)}` : "未通关"}`,
    );
    btn.addEventListener("click", () => deps.onPlay(level));
  }
  return btn;
}
```

- [ ] **Step 4: style.css：删旧加新**

**删除**整段：`.tier`、`.tier-head`、`.tier-dot`、`.tier-head h2`、`.tier-range`、`.tier-grid`、`.level-tile`、`.level-tile:focus-visible`、`.level-tile:not(.locked):active`、`.lv-num`、`.lv-best`、`.level-tile.locked`、`.level-tile.locked .lv-num`。

**保留** `.tier-easy/.tier-challenge/.tier-hard { --tier-color: … }`，并在其后追加新档色（同时在 `:root` 加两个令牌）：

`:root` 内 `--hard: #d98880;` 之后追加：

```css
  --expert: #9b8fc4;
  --abyss: #7a9cc4;
```

档色映射区追加：

```css
.tier-expert {
  --tier-color: var(--expert);
}
.tier-abyss {
  --tier-color: var(--abyss);
}
```

藤蔓样式（加在原 tier 区块位置）：

```css
/* ===== 藤蔓选关 ===== */
.vine-map {
  position: relative;
  width: min(100%, 24rem);
  margin: 0 auto;
}

.vine-svg {
  display: block;
  width: 100%;
  height: auto;
}

.vine-base {
  fill: none;
  stroke: #ddd3c2;
  stroke-width: 10;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.vine-band {
  fill: none;
  stroke: var(--tier-color);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
}

.vine-node {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: var(--card);
  border: 2px solid var(--tier-color);
  box-shadow: var(--shadow-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
}

.vine-node:not(.locked):active {
  transform: translate(-50%, -50%) scale(0.92);
}

.vine-node:focus-visible {
  outline-color: var(--tier-color);
}

.vn-num {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--tier-color);
  line-height: 1;
}

.vn-best {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 0.3rem;
  font-size: 0.68rem;
  color: var(--ink-soft);
  white-space: nowrap;
  pointer-events: none;
}

.vine-node.done {
  background: var(--tier-color);
}

.vine-node.done .vn-num {
  color: #fff;
}

.vine-node.locked {
  background: transparent;
  border-style: dashed;
  border-color: rgba(74, 69, 62, 0.25);
  box-shadow: none;
  cursor: default;
  opacity: 0.6;
}

.vine-node.locked .vn-num {
  color: var(--ink-soft);
}

.vine-node.current {
  animation: vine-pulse 1.8s ease-in-out infinite;
}

@keyframes vine-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(74, 69, 62, 0.22);
  }
  50% {
    box-shadow: 0 0 0 0.55rem rgba(74, 69, 62, 0);
  }
}
```

- [ ] **Step 5: 测试 + 提交**

Run: `npm test` — Expected: 全绿

```bash
git add src/ui/menu.ts src/ui/vine.ts src/ui/style.css tests/ui.test.ts
git commit -m "feat: 选关页改蜿蜒藤蔓地图（档位色带拐点、当前关光圈、自动定位）"
```

---

### Task 9: 全局 rem 响应式 + 文案

**Files:**
- Modify: `src/ui/style.css`
- Modify: `vite.config.ts:15`（manifest description）

**Interfaces:**
- Produces: 根字号 `clamp(14px, 1.1vmin + 9px, 26px)`；UI 皮壳（菜单/顶栏/底栏/弹窗）尺寸全 rem。棋盘内部（40px 格、3px 缝、10px 边）保持 px——尺寸变化由 transform 承担，不受根字号影响。

- [ ] **Step 1: style.css 根与皮壳 rem 化**

`html, body { height: 100%; }` 规则改为：

```css
html {
  height: 100%;
  font-size: clamp(14px, 1.1vmin + 9px, 26px);
}

body {
  height: 100%;
}
```

`body` 原规则中 `font-size: 16px` → `font-size: 1rem`。

下列规则中的 px 按 ÷16 换算成 rem（完整替换值）：

```css
:root 内：
  --r-card: 20px → 1.25rem;
  --r-btn: 16px → 1rem;

.menu: padding: max(36px, …+20px) 22px calc(32px + …) → max(2.25rem, env(safe-area-inset-top) + 1.25rem) 1.375rem calc(2rem + env(safe-area-inset-bottom)); gap: 30px → 1.875rem;
.menu-head h1: font-size: 44px → 2.75rem;
.menu-sub: margin-top: 6px → 0.375rem; font-size: 14px → 0.875rem;
.menu-note: font-size: 12px → 0.75rem; padding: 8px 14px → 0.5rem 0.875rem;
.game: gap: 12px → 0.75rem; padding: max(14px, env(safe-area-inset-top) + 6px) 16px calc(16px + env(safe-area-inset-bottom)) → max(0.875rem, env(safe-area-inset-top) + 0.375rem) 1rem calc(1rem + env(safe-area-inset-bottom));
.game-top: gap: 10px → 0.625rem; max-width: 560px → 35rem;
.pill: padding: 8px 14px → 0.5rem 0.875rem; font-size: 15px → 0.9375rem; gap: 6px → 0.375rem;
.back: font-size: 18px → 1.125rem; padding: 6px 14px → 0.375rem 0.875rem;
.game-title: gap: 8px → 0.5rem; font-size: 16px → 1rem;
.game-tier: font-size: 11.5px → 0.72rem; padding: 2px 9px → 0.125rem 0.5625rem;
.game-stats: gap: 8px → 0.5rem;
.stat: padding: 6px 11px → 0.375rem 0.6875rem; font-size: 14.5px → 0.9rem;
.game-bottom: gap: 12px → 0.75rem; max-width: 560px → 35rem;
.mode-toggle: padding: 4px → 0.25rem; gap: 4px → 0.25rem;
.mode-btn: border-radius: calc(var(--r-btn) - 4px) → calc(var(--r-btn) - 0.25rem); padding: 10px 20px → 0.625rem 1.25rem; font-size: 15.5px → 0.97rem;
.restart: padding: 12px 18px → 0.75rem 1.125rem;
.overlay: padding: 24px → 1.5rem;
.modal: border-radius: 24px → 1.5rem; padding: 30px 26px 24px → 1.875rem 1.625rem 1.5rem; width: min(330px, 100%) → min(20.6rem, 100%); gap: 8px → 0.5rem;
.modal-icon: font-size: 44px → 2.75rem;
.modal h2: font-size: 22px → 1.375rem;
.modal-time: font-size: 15px → 0.9375rem;
.best-badge: font-size: 13px → 0.8125rem; padding: 4px 13px → 0.25rem 0.8125rem; margin-top: 2px → 0.125rem;
.save-warn: font-size: 12.5px → 0.78rem;
.modal-actions: margin-top: 14px → 0.875rem; gap: 9px → 0.5625rem;
.btn: padding: 12px 16px → 0.75rem 1rem; font-size: 15.5px → 0.97rem;
```

（`.board`/`.cell` 及其修饰类、`--shadow-soft` 阴影、`.menu` 的 `max-width: 430px` → `27rem`。）

- [ ] **Step 2: vite.config.ts manifest 文案**

`description: "无猜扫雷 · 十关三档"` → `description: "无猜扫雷 · 二十关五档"`。

- [ ] **Step 3: 构建验证 + 提交**

Run: `npm test && npm run build:web`
Expected: 测试全绿；tsc + vite build 成功

```bash
git add src/ui/style.css vite.config.ts
git commit -m "feat: 全窗口等比响应式（根字号 clamp + UI 皮壳 rem 化）"
```

---

### Task 10: 版本号、桌面窗口与打包

**Files:**
- Modify: `package.json:5`（version 0.1.0 → 2.0.0）
- Modify: `src-tauri/tauri.conf.json`（version、窗口尺寸）

**Interfaces:**
- Produces: 桌面窗口 1100×800（min 640×560）；产品版本 2.0.0；安装包 `minesweeper_2.0.0_x64-setup.exe`。

- [ ] **Step 1: 改版本与窗口**

package.json：`"version": "0.1.0"` → `"version": "2.0.0"`。

tauri.conf.json：`"version": "1.0.0"` → `"2.0.0"`；windows[0] 改为：

```json
{
  "title": "扫雷",
  "width": 1100,
  "height": 800,
  "minWidth": 640,
  "minHeight": 560,
  "center": true,
  "resizable": true,
  "fullscreen": false
}
```

- [ ] **Step 2: 桌面构建 + 冒烟**

Run（新 shell 需先刷新 PATH 才能找到 cargo）：

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npx tauri build
```

Expected: 构建成功，产物 `src-tauri/target/release/bundle/nsis/minesweeper_2.0.0_x64-setup.exe`

冒烟：启动 `src-tauri/target/release/app.exe`，存活 ≥4 秒后正常退出进程；**人工确认**窗口为宽屏 1100×800、右键在雷区可插旗（WebView2 环境验证，规格 §5 验收项）。

- [ ] **Step 3: 安装包放到项目根 + 提交**

```powershell
Remove-Item "minesweeper_1.0.0_x64-setup.exe" -ErrorAction SilentlyContinue
Copy-Item "src-tauri/target/release/bundle/nsis/minesweeper_2.0.0_x64-setup.exe" .
```

```bash
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: v2.0.0 版本号与桌面窗口 1100x800"
```

---

### Task 11: 全量验收

**Files:** 无新增改动（只验证）

- [ ] **Step 1: 自动化全量**

Run: `npm test`
Expected: 全部测试文件通过（board/generator/levels/solver/storage/ui/viewport/vine），0 失败

Run: `npm run build:web && npm run build:desktop`
Expected: 两种 base 构建均成功

- [ ] **Step 2: 生成性能抽查（可选但建议）**

Run: `GEN_STATS=1 npm test -- tests/generator.test.ts`（PowerShell: `$env:GEN_STATS=1; npm test -- tests/generator.test.ts; Remove-Item Env:GEN_STATS`）
Expected: `gen-stats.tmp.txt` 中第 17–20 关单盘生成 <500ms；检查后删除该临时文件

- [ ] **Step 3: 手动清单（`npm run dev` + 桌面 exe）**

- PC 浏览器：滚轮缩放以鼠标为中心；左键拖动平移且抬起不挖格；左键点按挖格；右键插旗（含开局第一下）；窗口全屏后 UI 与雷区同步放大无大片空白；第 20 关雷区适配显示。
- PC exe：同上 + 窗口默认 1100×800。
- 手机（部署后 iPhone PWA）：单指拖动平移不误挖；双指捏合缩放流畅；捏合后抬指不误触；长按插旗震动反馈；藤蔓选关滚动定位正确。
- 存档迁移：带 v1 进度的浏览器更新后进度保留、第 1/2 关成绩保留。

- [ ] **Step 4: 完成开发分支**

全部通过后调用 superpowers:finishing-a-development-branch（合并 main → 推送 → 自动部署 → 视需要重出安装包）。

---

## Self-Review 记录

- 规格覆盖：§1 关卡表→Task 1；§1.1 性能→Task 11 Step 2；§2 视口/手势→Task 3/4/5；§2.2 触摸/捏合/冷却→Task 4（SM 单测）+Task 5（长按接线用例）；§3 藤蔓→Task 7/8；§4 响应式+窗口→Task 9/10；§5 预旗+提示+exe 右键验证→Task 6/Task 10 Step 2；§6 迁移→Task 2；§7 测试矩阵→各任务 TDD 步骤；§8 版本发布→Task 10/11。无缺口。
- 占位符：无 TBD/“适当处理”类步骤；所有代码步骤给出完整代码。
- 类型一致性：`ViewState/Metrics/GestureEvent/GestureAction/createGestures/vineLayout/VineLayout` 在 Task 3/4/7 定义、Task 5/8 消费，签名逐字一致；`SaveData.version: 2` 与 ui.test 无交叉依赖（ui 测试用内存后端默认值）。
