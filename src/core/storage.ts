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
