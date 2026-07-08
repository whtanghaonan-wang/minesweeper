import { describe, it, expect } from "vitest";
import { createStorage, SAVE_KEY } from "../src/core/storage";

function memBackend(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe("createStorage", () => {
  it("空档返回默认值", () => {
    const s = createStorage(memBackend());
    expect(s.load()).toEqual({ version: 2, unlockedLevel: 1, bestTimes: {}, soundOn: true });
  });

  it("recordWin 首次即纪录、更好才更新", () => {
    const s = createStorage(memBackend());
    expect(s.recordWin(1, 100).newBest).toBe(true);
    expect(s.recordWin(1, 120).newBest).toBe(false);
    expect(s.load().bestTimes[1]).toBe(100);
    expect(s.recordWin(1, 80).newBest).toBe(true);
    expect(s.load().bestTimes[1]).toBe(80);
  });

  it("第 50 关不解锁 51", () => {
    const s = createStorage(memBackend());
    expect(s.recordWin(1, 60).unlocked).toBe(2);
    expect(s.load().unlockedLevel).toBe(2);
    expect(s.recordWin(1, 50).unlocked).toBe(null);
    for (let l = 2; l <= 49; l++) expect(s.recordWin(l, 60).unlocked).toBe(l + 1);
    expect(s.recordWin(50, 60).unlocked).toBe(null);
    expect(s.load().unlockedLevel).toBe(50);
  });

  it("存档在 backend 中持久化，新实例可读回", () => {
    const backend = memBackend();
    createStorage(backend).recordWin(1, 90);
    const s2 = createStorage(backend);
    expect(s2.load().unlockedLevel).toBe(2);
    expect(s2.load().bestTimes[1]).toBe(90);
  });

  it("损坏 JSON / 版本不符 / 非法字段回退默认", () => {
    expect(createStorage(memBackend({ [SAVE_KEY]: "{oops" })).load()).toEqual({
      version: 2,
      unlockedLevel: 1,
      bestTimes: {},
      soundOn: true,
    });
    expect(
      createStorage(memBackend({ [SAVE_KEY]: '{"version":99,"unlockedLevel":5,"bestTimes":{}}' })).load()
        .unlockedLevel,
    ).toBe(1);
    const s = createStorage(
      memBackend({
        [SAVE_KEY]: '{"version":2,"unlockedLevel":"abc","bestTimes":{"1":77,"2":"bad"}}',
      }),
    );
    expect(s.load().unlockedLevel).toBe(1); // 损坏项回退
    expect(s.load().bestTimes).toEqual({ 1: 77 }); // 合法项保留
  });

  it("backend 抛异常时 save 返回 false，内存态仍工作", () => {
    const s = createStorage({
      getItem: () => {
        throw new Error("nope");
      },
      setItem: () => {
        throw new Error("nope");
      },
    });
    expect(s.load()).toEqual({ version: 2, unlockedLevel: 1, bestTimes: {}, soundOn: true });
    const r = s.recordWin(1, 55);
    expect(r.newBest).toBe(true);
    expect(r.persisted).toBe(false);
    expect(s.load().bestTimes[1]).toBe(55); // 内存内最新值
  });

  it("无 backend（如隐私模式禁 localStorage）时纯内存运行", () => {
    const s = createStorage(undefined);
    expect(s.recordWin(3, 42).persisted).toBe(false);
    expect(s.load().bestTimes[3]).toBe(42);
  });

  it("v1 存档迁移：进度继承，成绩仅保留规格未变的第 1、2 关，且立即持久化", () => {
    const backend = memBackend({
      [SAVE_KEY]: JSON.stringify({
        version: 1,
        unlockedLevel: 7,
        bestTimes: { 1: 55, 2: 66, 3: 77, 9: 99, 10: 111 },
      }),
    });
    const s = createStorage(backend);
    expect(s.load()).toEqual({
      version: 2,
      unlockedLevel: 7,
      bestTimes: { 1: 55, 2: 66 },
      soundOn: true,
    });
    expect(JSON.parse(backend.map.get(SAVE_KEY)!)).toEqual({
      version: 2,
      unlockedLevel: 7,
      bestTimes: { 1: 55, 2: 66 },
      soundOn: true,
    });
  });

  it("v1 存档字段损坏时按同样规则回退后再迁移", () => {
    const s = createStorage(
      memBackend({
        [SAVE_KEY]: '{"version":1,"unlockedLevel":"abc","bestTimes":{"2":88,"5":"bad"}}',
      }),
    );
    expect(s.load()).toEqual({ version: 2, unlockedLevel: 1, bestTimes: { 2: 88 }, soundOn: true });
  });
});

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
