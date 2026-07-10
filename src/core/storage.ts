import { LEVELS } from "./levels";

export const SAVE_KEY = "minesweeper-save-v3";
export const LEGACY_SAVE_KEY = "minesweeper-save-v1";

export interface EndlessData {
  streak: number;
  bestStreak: number;
}

export interface SaveData {
  version: 3;
  unlockedLevel: number;
  bestTimes: Record<number, number>;
  soundOn: boolean;
  endless: EndlessData;
}

export interface WinRecord {
  newBest: boolean;
  unlocked: number | null;
  persisted: boolean;
}

export interface EndlessWinRecord {
  streak: number;
  bestStreak: number;
  newBest: boolean;
}

export interface GameStorage {
  load(): SaveData;
  save(d: SaveData): boolean;
  recordWin(levelId: number, timeSec: number): WinRecord;
  setSoundOn(on: boolean): boolean;
  recordEndlessWin(): EndlessWinRecord;
  recordEndlessLoss(): void;
}

type Backend = Pick<globalThis.Storage, "getItem" | "setItem">;

const MAX_LEVEL = LEVELS[LEVELS.length - 1]!.id;

function isValidTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

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
  return {
    version: 3,
    unlockedLevel: 1,
    bestTimes: {},
    soundOn: true,
    endless: { streak: 0, bestStreak: 0 },
  };
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
      if (Number.isInteger(id) && id >= 1 && id <= MAX_LEVEL && isValidTime(v)) {
        d.bestTimes[id] = v;
      }
    }
  }
  if (typeof r["soundOn"] === "boolean") d.soundOn = r["soundOn"];
  const e = r["endless"];
  if (typeof e === "object" && e !== null) {
    const es = e as Record<string, unknown>;
    if (
      typeof es["streak"] === "number" &&
      Number.isInteger(es["streak"]) &&
      es["streak"] >= 0
    ) {
      d.endless.streak = es["streak"];
    }
    if (
      typeof es["bestStreak"] === "number" &&
      Number.isInteger(es["bestStreak"]) &&
      es["bestStreak"] >= 0
    ) {
      d.endless.bestStreak = es["bestStreak"];
    }
    // 自洽:最长连胜不得低于当前连胜
    if (d.endless.bestStreak < d.endless.streak) d.endless.bestStreak = d.endless.streak;
  }
  return d;
}

function sanitize(raw: unknown): SaveData {
  if (typeof raw !== "object" || raw === null) return defaults();
  const r = raw as Record<string, unknown>;
  if (r["version"] === 3) return readFields(r);
  if (r["version"] === 2) {
    // v2 迁移:进度/静音继承;21-50 盘面规格全变,旧成绩不可比,迁移即弃(规格 §3.4)
    const v2 = readFields(r);
    for (const k of Object.keys(v2.bestTimes)) {
      if (Number(k) >= 21) delete v2.bestTimes[Number(k)];
    }
    return v2;
  }
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

  let protectedMissing = false;
  try {
    const protectedRaw = backend?.getItem(SAVE_KEY);
    protectedMissing = protectedRaw == null;
    if (protectedRaw != null) data = sanitize(JSON.parse(protectedRaw) as unknown);
  } catch {
    protectedMissing = false;
    data = defaults();
  }

  if (protectedMissing) {
    try {
      const legacyRaw = backend?.getItem(LEGACY_SAVE_KEY);
      if (legacyRaw != null) {
        data = sanitize(JSON.parse(legacyRaw) as unknown);
        backend?.setItem(SAVE_KEY, JSON.stringify(data));
      }
    } catch {
      // legacy 读取或首次 protected 写入失败：会话仍使用已完成 sanitize 的 data。
    }
  }

  return {
    load: () => ({ ...data, bestTimes: { ...data.bestTimes }, endless: { ...data.endless } }),
    save,
    recordWin(levelId, timeSec) {
      const d = { ...data, bestTimes: { ...data.bestTimes }, endless: { ...data.endless } };
      const prev = d.bestTimes[levelId];
      const validTime = isValidTime(timeSec);
      const newBest = validTime && (prev === undefined || timeSec < prev);
      if (newBest) d.bestTimes[levelId] = timeSec;
      let unlocked: number | null = null;
      if (levelId < MAX_LEVEL && d.unlockedLevel === levelId) {
        d.unlockedLevel = levelId + 1;
        unlocked = d.unlockedLevel;
      }
      const persisted = save(d);
      return { newBest, unlocked, persisted };
    },
    setSoundOn(on) {
      return save({ ...data, bestTimes: { ...data.bestTimes }, endless: { ...data.endless }, soundOn: on });
    },
    recordEndlessWin() {
      const streak = data.endless.streak + 1;
      const newBest = streak > data.endless.bestStreak;
      const bestStreak = Math.max(data.endless.bestStreak, streak);
      save({ ...data, bestTimes: { ...data.bestTimes }, endless: { streak, bestStreak } });
      return { streak, bestStreak, newBest };
    },
    recordEndlessLoss() {
      save({
        ...data,
        bestTimes: { ...data.bestTimes },
        endless: { streak: 0, bestStreak: data.endless.bestStreak },
      });
    },
  };
}
