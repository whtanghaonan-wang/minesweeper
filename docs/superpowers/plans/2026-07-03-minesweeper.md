# 扫雷 DIY 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 无猜扫雷游戏，10 关 3 档逐关解锁，Windows .exe + iPhone PWA 双端发布。

**Architecture:** 纯 TypeScript 核心逻辑层（core/，无 DOM 依赖，Vitest 全覆盖）+ 轻量 DOM 界面层（ui/）。无猜由「先点后布雷 → 求解器验证 → 重试」保证。Tauri 2 打包桌面端，vite-plugin-pwa 生成离线 PWA，GitHub Actions 部署 GitHub Pages。

**Tech Stack:** TypeScript (strict) + Vite + Vitest；vite-plugin-pwa；Tauri 2；无任何运行时依赖。

**Spec:** `docs/superpowers/specs/2026-07-02-minesweeper-design.md`（本计划的需求来源，冲突时以 spec 为准）

## Global Constraints

- TypeScript strict 模式；无框架、无运行时依赖（dependencies 为空，只允许 devDependencies）。
- 界面文案全部中文。
- 无猜保证是绝对的：任何路径都不得把不可纯逻辑推完的盘面交给玩家。
- 棋盘逻辑宽度 ≤ 12 列（竖屏）；宽屏在开局时交换行列。
- 关卡数值以 spec §4 表为唯一来源，全部集中在 `src/core/levels.ts`。
- localStorage key：`minesweeper-save-v1`，数据带 `version: 1` 字段。
- 配色/圆角遵守 spec §6：暖米白背景 `#F2EFE9`、卡片 `#FFFFFF`、文字 `#4A453E`、三档点缀色 鼠尾草绿 `#8FAE8B` / 琥珀 `#D9A86C` / 珊瑚 `#D98880`；卡片圆角 20px、按钮 16px、格子约 30%。
- 每个任务完成即 `git commit`（feat:/test:/chore: 前缀，中文描述）。
- 测试命令统一 `npx vitest run`（在 `E:\DIY PROJECTS\minesweeper` 下执行）。

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore`

**Interfaces:**
- Produces: npm scripts `dev` / `build:web`（`vite build --base=/minesweeper/`）/ `build:desktop`（`vite build --base=./`）/ `test`（`vitest run`）；目录 `src/core/`、`src/ui/`。

- [ ] **Step 1:** `npm create vite@latest . -- --template vanilla-ts` 思路初始化（手写等价文件即可，避免交互式命令）；安装 devDependencies：`typescript vite vitest`。
- [ ] **Step 2:** tsconfig 开启 `"strict": true`；`.gitignore` 含 `node_modules/ dist/ src-tauri/target/`。
- [ ] **Step 3:** 验证：`npx vitest run` 通过（空测试集允许 `--passWithNoTests`）；`npx vite build` 成功。
- [ ] **Step 4:** Commit：`chore: Vite + TypeScript + Vitest 脚手架`

### Task 2: core/rng.ts + core/board.ts —— 棋盘核心（TDD）

**Files:**
- Create: `src/core/rng.ts`, `src/core/board.ts`
- Test: `tests/board.test.ts`

**Interfaces（Produces，后续任务按此调用）:**
```ts
// rng.ts
export function mulberry32(seed: number): () => number; // 返回 [0,1) 均匀数

// board.ts
export interface Board {
  width: number; height: number; mineCount: number;
  mine: boolean[]; adjacent: number[];      // 长度 w*h
  revealed: boolean[]; flagged: boolean[];
}
export function createBoard(width: number, height: number, mineIdxs: number[]): Board;
export function neighbors(b: Board, i: number): number[];
export function reveal(b: Board, i: number): { exploded: boolean; changed: number[] }; // 0 格洪泛展开；旗格/已开格为无操作
export function toggleFlag(b: Board, i: number): boolean; // 已开格无操作；返回当前是否插旗
export function chord(b: Board, i: number): { exploded: boolean; changed: number[] }; // 已开数字格且周围旗数==数字时展开其余未旗邻格，否则无操作
export function isWin(b: Board): boolean;   // 所有非雷格已开
export function flaggedCount(b: Board): number;
```

- [ ] **Step 1: 写失败测试**（示例，须全部覆盖以下行为）：
```ts
import { describe, it, expect } from "vitest";
import { createBoard, reveal, toggleFlag, chord, isWin, neighbors } from "../src/core/board";

// 固定 4x4 盘，雷在 idx 0 和 5：
// M 1 . .        adjacent: [_,2,1,0,
// 2 M 1 .                   2,_,1,0,
// 1 1 1 .                   1,1,1,0,
// . . . .                   0,0,0,0]
const mk = () => createBoard(4, 4, [0, 5]);

it("角格 3 邻居、边格 5 邻居、中格 8 邻居", () => {
  expect(neighbors(mk(), 0)).toHaveLength(3);
  expect(neighbors(mk(), 1)).toHaveLength(5);
  expect(neighbors(mk(), 5)).toHaveLength(8);
});
it("adjacent 计数正确", () => { const b = mk(); expect(b.adjacent[1]).toBe(2); expect(b.adjacent[10]).toBe(1); expect(b.adjacent[15]).toBe(0); });
it("挖到雷爆炸", () => { expect(reveal(mk(), 0).exploded).toBe(true); });
it("挖 0 格洪泛展开到数字边界", () => {
  const b = mk(); const r = reveal(b, 15);
  expect(r.exploded).toBe(false);
  expect(b.revealed[15] && b.revealed[3] && b.revealed[10]).toBe(true); // 右下整片+边界数字
  expect(b.revealed[0] || b.revealed[5]).toBe(false);
});
it("旗格不可挖、已开格不可插旗", () => {
  const b = mk(); toggleFlag(b, 0);
  expect(reveal(b, 0).changed).toHaveLength(0);
  reveal(b, 15); expect(toggleFlag(b, 15)).toBe(false); expect(b.flagged[15]).toBe(false);
});
it("chord：旗数匹配时展开其余邻格，插错旗会爆", () => {
  const b = mk(); reveal(b, 2); toggleFlag(b, 5); // idx2 数字1，旗在真雷上
  expect(chord(b, 2).exploded).toBe(false); expect(b.revealed[1] && b.revealed[6]).toBe(true);
  const b2 = mk(); reveal(b2, 2); toggleFlag(b2, 6); // 错旗
  expect(chord(b2, 2).exploded).toBe(true);
});
it("isWin：全部非雷格开完为胜（与插旗无关）", () => {
  const b = mk();
  for (let i = 0; i < 16; i++) if (!b.mine[i]) reveal(b, i);
  expect(isWin(b)).toBe(true);
});
```
- [ ] **Step 2:** `npx vitest run` → FAIL（模块不存在）。
- [ ] **Step 3:** 实现 rng（mulberry32 标准实现）与 board：`createBoard` 预计算 adjacent；`reveal` 用显式栈洪泛（避免深递归）；`chord` 对每个未旗未开邻格调用 reveal 并合并结果（任一爆则 exploded）。
- [ ] **Step 4:** `npx vitest run` → PASS。
- [ ] **Step 5:** Commit：`feat: 棋盘核心逻辑（洪泛展开/插旗/chord/胜负判定）`

### Task 3: core/solver.ts —— 无猜求解器（TDD）

**Files:**
- Create: `src/core/solver.ts`
- Test: `tests/solver.test.ts`

**Interfaces（Produces）:**
```ts
export function isSolvable(board: Board, firstIdx: number, maxComponent?: number): boolean; // 默认 maxComponent=24；不修改传入 board（内部克隆）
```

**算法（三层，循环至推完或无进展）：**
1. 收集约束：每个已开数字格 → `{ cells: 未开未旗邻格集合, mines: 数字 − 周围旗数 }`（cells 非空才保留）。
2. 基础规则：`mines===0` → 全开；`mines===cells.length` → 全旗。
3. 子集推理：约束两两比较，A.cells ⊆ B.cells → 派生 `{B−A, B.mines−A.mines}` 再套基础规则。
4. 全局终局：剩余雷数 0 → 其余全开；未开未旗格数 == 剩余雷数 → 全旗。
5. 边界穷举：按共享约束把边界未知格连通分块；块 ≤ maxComponent 时做带剪枝回溯枚举（逐格赋值，约束一旦超雷/欠雷即剪枝；并校验块内雷数 m 满足 `m ≤ 全局剩余雷` 且 `全局剩余雷 − m ≤ 块外未知格数`）；对所有可行解取交集：恒雷 → 旗、恒安全 → 开。块超限视为该块不可推。
6. 一轮 2–5 全无进展 → 返回 false；所有非雷格已开 → true。

- [ ] **Step 1: 写失败测试**（核心用例）：
```ts
// 1) 基础规则可解的小盘 → true
// 4x4 雷 [0]，首点 15：展开后 idx1/4/5 均可由基础规则定雷
// 2) 子集/枚举可解：构造经典 1-2-1 局面盘 → true
//    5x3 盘（w=5,h=3），雷 [10,12]（底行两侧），首点 2 顶行中间 —— 展开后顶两行开，
//    底行 1 2 1 约束需子集推理定出雷在 10/12、安全在 11/13/14 边角。
//    断言 isSolvable(b, 2) === true
// 3) 必须猜的盘 → false：
//    2x2 盘雷 [1]?? 太小；用 1x4 盘 mine [3]，首点 0：展开到 idx2 显示 1，
//    idx3 唯一未知 → 其实基础规则可解。改用经典 50/50：
//    4x2 盘（w=4,h=2）雷 [2,3]?? —— 直接手工构造：w=5,h=1 一维盘 雷[3]，首点0：
//    [0 0 1 M 1] 开到 idx2=1，idx3、idx4 未知，约束 {3,4}=1 加 idx4 的?  
//    —— 用明确不可解构型：w=2,h=3 雷 [4,5]（底行全雷），首点 0：
//    顶行 0 0 / 中行 2 2 / 底行 M M：基础规则「未知数==雷数」直接全旗 → 可解。
//    最可靠的不可解用例：w=4,h=1 雷 [2]，首点 0 → [0 1 ? ?]，约束 {2,3}=1，
//    全局剩雷 1 分布于 2 格且无其他约束 → 两解各不同，无恒定格 → false。
//    断言 isSolvable(b, 0) === false
// 4) isSolvable 不修改传入 board（前后 revealed/flagged 快照相等）
```
  （测试中直接用 `createBoard` 手工摆雷构造以上局面；期望值先人工推演核对。）
- [ ] **Step 2:** `npx vitest run` → 新测试 FAIL。
- [ ] **Step 3:** 按上述算法实现；约束用 `{ cells: number[], mines: number }`，集合运算用 `Set`。
- [ ] **Step 4:** `npx vitest run` → PASS。
- [ ] **Step 5:** Commit：`feat: 无猜求解器（基础/子集/边界穷举三层推理）`

### Task 4: core/levels.ts + core/generator.ts —— 关卡与生成器（TDD）

**Files:**
- Create: `src/core/levels.ts`, `src/core/generator.ts`
- Test: `tests/generator.test.ts`

**Interfaces（Produces）:**
```ts
// levels.ts —— 数值严格照抄 spec §4 表
export type Tier = "easy" | "challenge" | "hard";
export interface LevelSpec { id: number; tier: Tier; width: number; height: number; mines: number; timeLimitSec: number }
export const LEVELS: LevelSpec[]; // 10 项，id 1..10
export const TIER_NAMES: Record<Tier, string>; // 简单/挑战/困难

// generator.ts
export function generate(level: LevelSpec, firstIdx: number, rng: () => number,
                         onSlow?: (attempts: number) => void): Board;
// 循环：均匀采样雷位（排除 firstIdx 及其邻居 3×3）→ createBoard → isSolvable(board, firstIdx) 通过即返回；
// 每 200 次失败调用一次 onSlow 并 console.warn，但永不降级、永不返回不可解盘。
```

- [ ] **Step 1: 写失败测试**：
  - LEVELS 有 10 项、id 连续、宽 ≤12、雷数/尺寸/限时与 spec 表逐项相等（表格数据在测试里再抄一份对拍）。
  - 对每关：`generate(level, firstIdx=中心格, mulberry32(seed))` 生成盘 → 断言雷数正确、首格 3×3 无雷、`isSolvable` 为 true；easy/challenge 各跑 5 seeds，hard 跑 3 seeds（控制测试时长）。
  - 统计并 `console.log` 每关生成耗时（性能观察，不设硬断言，但单测总时长 >60s 时视为需优化）。
- [ ] **Step 2:** `npx vitest run` → FAIL。
- [ ] **Step 3:** 实现 levels 表与 generate 循环。
- [ ] **Step 4:** `npx vitest run` → PASS；记录耗时数据到 commit message。
- [ ] **Step 5:** Commit：`feat: 10 关配置表与无猜盘生成器`

### Task 5: core/storage.ts —— 存档（TDD）

**Files:**
- Create: `src/core/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces（Produces）:**
```ts
export interface SaveData { version: 1; unlockedLevel: number; bestTimes: Record<number, number> }
export interface Storage {
  load(): SaveData;                       // 缺失/损坏/版本不符 → 按项回退默认 {version:1, unlockedLevel:1, bestTimes:{}}
  save(d: SaveData): boolean;             // localStorage 异常时 false（调用方提示"成绩不会保存"）并保持内存态
  recordWin(levelId: number, timeSec: number): { newBest: boolean; unlocked: number | null }; // 更新纪录+解锁下一关（≤10）
}
export function createStorage(backend?: Pick<globalThis.Storage, "getItem" | "setItem">): Storage; // 可注入 mock
```

- [ ] **Step 1:** 失败测试：空档默认值；recordWin 首次即纪录、更好才更新、通关第 N 关解锁 N+1（第 10 关不解锁 11）；损坏 JSON / 错版本回退默认；backend 抛异常时 save 返回 false 且后续 load 仍给内存内最新值。
- [ ] **Step 2:** RUN → FAIL。 **Step 3:** 实现。 **Step 4:** RUN → PASS。
- [ ] **Step 5:** Commit：`feat: 存档（解锁进度/最好成绩/损坏回退）`

### Task 6: UI 骨架 + 选关页

**Files:**
- Create: `src/ui/style.css`, `src/ui/menu.ts`, `src/ui/screen.ts`
- Modify: `index.html`, `src/main.ts`

**Interfaces:**
- Consumes: `LEVELS`, `TIER_NAMES`, `createStorage`。
- Produces: `showMenu(root: HTMLElement, deps: { storage: Storage; onPlay(level: LevelSpec): void }): void`；`screen.ts` 提供 `switchScreen(render: (root: HTMLElement) => void)` 简单单页切换。

**要点（照 spec §6）：**
- `style.css` 定义 CSS 变量：`--bg:#F2EFE9; --card:#FFFFFF; --ink:#4A453E; --ink-soft:#8B8377; --easy:#8FAE8B; --challenge:#D9A86C; --hard:#D98880; --r-card:20px; --r-btn:16px;` 数字 1–8 低饱和色系变量 `--n1..--n8`。
- 选关页：大标题「扫雷」+ 三个档次分组（组名 简单/挑战/困难 + 档次色小圆点）；每关一张卡片：关号、盘面×雷数摘要、最好成绩（`最佳 1:23`）或「未通关」；锁定卡灰显 + 🔒 不可点。
- 触摸优化 meta：`viewport-fit=cover, user-scalable=no`；`touch-action: manipulation`。
- [ ] **Step 1:** 实现骨架与选关页（此任务无单测，编译通过 + 手动验收）。
- [ ] **Step 2:** 验证：`npx vite build` 通过；`npm run dev` 浏览器目视检查：分组/锁定态/成绩显示正确、缩窄到 iPhone 宽度不拥挤。
- [ ] **Step 3:** Commit：`feat: 选关页与柔和中性视觉体系`

### Task 7: 游戏页（棋盘渲染 + 输入 + 倒计时）

**Files:**
- Create: `src/ui/game.ts`
- Modify: `src/ui/style.css`, `src/main.ts`

**Interfaces:**
- Consumes: `generate`, `reveal/toggleFlag/chord/isWin/flaggedCount`, `LevelSpec`。
- Produces: `showGame(root, deps: { level: LevelSpec; storage: Storage; onExit(): void; onFinish(r: GameResult): void })`；`GameResult = { won: boolean; reason?: "mine" | "time"; timeSec: number }`。

**要点：**
- 开局方向：`window.innerWidth > window.innerHeight` 时交换 level 的 w/h（仅本局呈现）。
- 首次点击才 `generate`（传点击格为 firstIdx，`Math.random()*2**32|0` 做种子）+ 启动倒计时；生成期间盘面加 `.generating` 样式（onSlow 回调时显示「正在生成无猜盘…」提示条）。
- 倒计时：记录 `deadline = Date.now() + limit*1000`，250ms interval 刷新显示（`M:SS`），剩 ≤30s 变珊瑚色；到 0 → 失败(time)。
- 顶栏：返回 ←、`第 N 关`、💣 剩余雷数（总雷−旗数）、⏱ 倒计时。
- 棋盘：CSS Grid，`repeat(w, 1fr)`，格子 `<button>`，`aspect-ratio:1`，圆角 30%，未开=浅色凸起、已开=更浅凹陷、数字用 `--n1..n8`、旗 🚩、雷 💥；格子尺寸 `min( (100vw−边距)/w, 44px )`。
- 输入：`pointerdown/up` 统一处理。鼠标：左键挖 / 右键旗（`contextmenu` preventDefault）/ 已开数字格左键 = chord。触摸：点按 = 当前模式；长按 350ms = 另一模式（触发时 `navigator.vibrate?.(10)`，且抑制随后的点按）；已开数字格点按 = chord。底部操作区：`⛏ 挖开 | 🚩 插旗` 分段切换 + `↻ 重新开始`。
- 失败时揭示全部雷（踩中的高亮），错旗标 ✕；胜利时 `timeSec = limit − 剩余`。任一终局停表并回调 `onFinish`。
- [ ] **Step 1:** 实现（无单测；核心逻辑已在 core 层覆盖）。
- [ ] **Step 2:** 手动验证清单：第 1 关可完整通关；踩雷/超时失败表现正确；右键不弹菜单；手机宽度下模式切换 + 长按可用；chord 正常；重开清零。
- [ ] **Step 3:** Commit：`feat: 游戏页（棋盘/双端输入/倒计时）`

### Task 8: 结算弹窗 + 解锁与成绩闭环

**Files:**
- Create: `src/ui/result.ts`
- Modify: `src/ui/game.ts`, `src/ui/menu.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `GameResult`, `storage.recordWin`。
- Produces: `showResult(overlayRoot, r: { won: boolean; reason?: string; timeSec: number; newBest: boolean; hasNext: boolean; onNext(): void; onRetry(): void; onMenu(): void })`。

**要点：** 半透明遮罩 + 白色大圆角卡片，缩放淡入动画（`prefers-reduced-motion` 时关闭）。通关：🎉 `用时 M:SS`、新纪录徽标「新纪录！」、按钮 [下一关](有下一关且已解锁)/[重玩]/[返回选关]；失败：💥 踩到雷了 / ⏰ 时间到，按钮 [重试]/[返回选关]。`main.ts` 装配：menu → game → result → 回 menu 或下一关；通关时调 `recordWin` 并把 `newBest/unlocked` 传给弹窗；save 失败时弹窗内小字提示「本次成绩未能保存」。
- [ ] **Step 1:** 实现。 **Step 2:** 手动验证：通关→解锁下一关（返回选关可见）、破纪录标识、失败重试、第 10 关通关无「下一关」。
- [ ] **Step 3:** Commit：`feat: 结算弹窗与解锁/最好成绩闭环`

### Task 9: PWA（离线 + 主屏幕安装）

**Files:**
- Create: `public/icons/icon.svg` 及生成的 `icon-192.png/icon-512.png/apple-touch-icon.png`（sharp 一次性脚本 `scripts/make-icons.mjs` 生成后提交 PNG）、
- Modify: `vite.config.ts`（vite-plugin-pwa）、`index.html`（`apple-touch-icon`、`theme-color #F2EFE9`）、`src/main.ts`（仅 https 下注册 SW）

**要点：** manifest：`name/short_name 扫雷`、`display: standalone`、`background_color/theme_color #F2EFE9`、icons 192/512（`purpose: any maskable`）。workbox 预缓存全部构建产物；`registerType: "autoUpdate"`。图标：暖米白圆角方块 + 简化地雷图形（柔和色）。
- [ ] **Step 1:** 实现并 `npm run build:web`，`npx vite preview` 验证 manifest/SW 注册无报错。
- [ ] **Step 2:** Commit：`feat: PWA（manifest/离线缓存/图标）`

### Task 10: GitHub 仓库 + Pages 部署

**Files:**
- Create: `.github/workflows/deploy.yml`

**要点：** workflow：push main → `npm ci && npm run build:web` → `actions/upload-pages-artifact`（dist）→ `actions/deploy-pages`。前置：`gh auth status` 检查登录（未登录则请用户执行 `! gh auth login`）；`gh repo create minesweeper --public --source . --push`。完成后 iPhone Safari 打开 `https://<user>.github.io/minesweeper/` → 分享 → 添加到主屏幕。
- [ ] **Step 1:** 写 workflow + 创建仓库 + push；在仓库设置启用 Pages（workflow 方式，`gh api` 可设）。
- [ ] **Step 2:** 验证：Actions 绿 → 手机访问地址可玩、可安装、飞行模式下再次打开可玩。
- [ ] **Step 3:** Commit：`chore: GitHub Pages 自动部署`

### Task 11: Tauri 2 打包 Windows .exe

**Files:**
- Create: `src-tauri/`（`tauri.conf.json`、Rust 脚手架）
- Modify: `package.json`（`tauri` script）

**要点：** 前置检查 `rustc --version`；无 Rust 则先 `winget install Rustlang.Rustup` + `rustup default stable`（大下载，先告知用户再装）。`npm i -D @tauri-apps/cli` → `npx tauri init`（非交互参数：app name 扫雷、window title 扫雷、frontendDist ../dist、devUrl http://localhost:5173、beforeBuildCommand `npm run build:desktop`）。窗口默认 480×760、最小 400×600、可缩放。`npx tauri build` 产出 `src-tauri/target/release/` 下 exe 与安装包。
- [ ] **Step 1:** 环境检查/安装 → init → 配置。
- [ ] **Step 2:** `npx tauri build` 成功；运行 exe 完整通一关、成绩持久化（重开 exe 仍在）。
- [ ] **Step 3:** Commit：`feat: Tauri Windows 桌面打包`

### Task 12: 全流程验收与调参

- [ ] **Step 1:** `npx vitest run` 全绿 + `npm run build:web` + `npm run build:desktop` 无错。
- [ ] **Step 2:** 三端手动验收（浏览器 / exe / iPhone PWA）：新档 → 逐关解锁 → 破纪录 → 踩雷/超时 → 存档持久化。
- [ ] **Step 3:** 生成耗时实测：若 L8–L10 首击生成 > 1.5s，按 spec §3.5 把 generate 迁入 Web Worker（`new Worker(new URL(...))`，postMessage 传 level+firstIdx，回传盘面数组）。
- [ ] **Step 4:** 按试玩体感微调 levels.ts 限时（只改这一个文件）。
- [ ] **Step 5:** Commit：`chore: 全流程验收与关卡调参`

---

## Self-Review 记录

- **Spec 覆盖**：§2 平台（T1/T9/T10/T11）、§3 无猜（T3/T4）、§4 关卡（T4）、§5 规则判定（T2/T7/T8）、§6 UI（T6/T7/T8）、§7 存档（T5/T8）、§8 错误处理（T4 onSlow、T5 回退、T8 保存失败提示）、§9 测试（T2–T5 单测 + T12 验收）、§10 交付物（T10/T11/T12）——无缺口。
- **占位符**：无 TBD/TODO；UI 任务以行为清单+手动验收代替单测（core 已全覆盖），符合测试策略。
- **类型一致性**：`Board/LevelSpec/Storage/GameResult` 各任务引用与定义处签名一致；`isSolvable(board, firstIdx)` 在 T3 定义、T4 消费一致。
