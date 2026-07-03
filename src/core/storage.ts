export const SAVE_KEY = "minesweeper-save-v1";

export interface SaveData {
  version: 1;
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

const MAX_LEVEL = 10;

function defaults(): SaveData {
  return { version: 1, unlockedLevel: 1, bestTimes: {} };
}

/** 逐项校验，损坏字段回退默认、合法字段保留 */
function sanitize(raw: unknown): SaveData {
  const d = defaults();
  if (typeof raw !== "object" || raw === null) return d;
  const r = raw as Record<string, unknown>;
  if (r["version"] !== 1) return d;
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

export function createStorage(backend?: Backend): GameStorage {
  let data = defaults();
  try {
    const raw = backend?.getItem(SAVE_KEY);
    if (raw != null) data = sanitize(JSON.parse(raw));
  } catch {
    // 读失败/损坏 → 使用默认值，内存态继续工作
  }

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
