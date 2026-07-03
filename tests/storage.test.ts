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
    expect(s.load()).toEqual({ version: 1, unlockedLevel: 1, bestTimes: {} });
  });

  it("recordWin 首次即纪录、更好才更新", () => {
    const s = createStorage(memBackend());
    expect(s.recordWin(1, 100).newBest).toBe(true);
    expect(s.recordWin(1, 120).newBest).toBe(false);
    expect(s.load().bestTimes[1]).toBe(100);
    expect(s.recordWin(1, 80).newBest).toBe(true);
    expect(s.load().bestTimes[1]).toBe(80);
  });

  it("通关第 N 关解锁 N+1，重复通关不再报解锁，第 10 关不解锁 11", () => {
    const s = createStorage(memBackend());
    expect(s.recordWin(1, 60).unlocked).toBe(2);
    expect(s.load().unlockedLevel).toBe(2);
    expect(s.recordWin(1, 50).unlocked).toBe(null);
    for (let l = 2; l <= 9; l++) expect(s.recordWin(l, 60).unlocked).toBe(l + 1);
    expect(s.recordWin(10, 60).unlocked).toBe(null);
    expect(s.load().unlockedLevel).toBe(10);
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
      version: 1,
      unlockedLevel: 1,
      bestTimes: {},
    });
    expect(
      createStorage(memBackend({ [SAVE_KEY]: '{"version":99,"unlockedLevel":5,"bestTimes":{}}' })).load()
        .unlockedLevel,
    ).toBe(1);
    const s = createStorage(
      memBackend({
        [SAVE_KEY]: '{"version":1,"unlockedLevel":"abc","bestTimes":{"1":77,"2":"bad"}}',
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
    expect(s.load()).toEqual({ version: 1, unlockedLevel: 1, bestTimes: {} });
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
});
