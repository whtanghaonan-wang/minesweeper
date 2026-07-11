/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createUiPrefs, UI_PREFS_KEY } from "../src/ui/ui-prefs";

function backend(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(UI_PREFS_KEY, initial);
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("ui-prefs", () => {
  it("缺失/损坏回默认，两个偏好独立持久化", () => {
    expect(createUiPrefs(backend()).load()).toEqual({
      largeBoardHintSeen: false, reducedTransparency: false,
    });
    expect(createUiPrefs(backend("{bad")).load()).toEqual({
      largeBoardHintSeen: false, reducedTransparency: false,
    });
    const b = backend();
    const prefs = createUiPrefs(b);
    prefs.setLargeBoardHintSeen(true);
    prefs.setReducedTransparency(true);
    expect(createUiPrefs(b).load()).toEqual({
      largeBoardHintSeen: true, reducedTransparency: true,
    });
    expect([...b.map.keys()]).toEqual([UI_PREFS_KEY]);
  });

  it("两个 setter 从默认态分别只修改自己的字段", () => {
    const largeStore = createUiPrefs(backend());
    largeStore.setLargeBoardHintSeen(true);
    expect(largeStore.load()).toEqual({
      largeBoardHintSeen: true,
      reducedTransparency: false,
    });

    const transparencyStore = createUiPrefs(backend());
    transparencyStore.setReducedTransparency(true);
    expect(transparencyStore.load()).toEqual({
      largeBoardHintSeen: false,
      reducedTransparency: true,
    });
  });

  it("load 返回副本，调用方修改不会污染 store", () => {
    const prefs = createUiPrefs(backend());
    const loaded = prefs.load();
    loaded.largeBoardHintSeen = true;
    loaded.reducedTransparency = true;
    expect(prefs.load()).toEqual({
      largeBoardHintSeen: false,
      reducedTransparency: false,
    });
  });

  it("JSON primitive/null/损坏内容回默认，partial object 仅接受严格 true", () => {
    const fallback = { largeBoardHintSeen: false, reducedTransparency: false };
    for (const raw of ["null", "true", "42", '"text"', "[]", "{bad"]) {
      expect(createUiPrefs(backend(raw)).load()).toEqual(fallback);
    }

    expect(createUiPrefs(backend('{"largeBoardHintSeen":true}')).load()).toEqual({
      largeBoardHintSeen: true,
      reducedTransparency: false,
    });
    expect(createUiPrefs(backend('{"reducedTransparency":true}')).load()).toEqual({
      largeBoardHintSeen: false,
      reducedTransparency: true,
    });
    expect(createUiPrefs(backend(
      '{"largeBoardHintSeen":1,"reducedTransparency":"true"}',
    )).load()).toEqual(fallback);
  });

  it("存储读取或写入失败时仍可使用内存中的偏好", () => {
    const broken = {
      getItem: () => { throw new Error("read failed"); },
      setItem: () => { throw new Error("write failed"); },
    };
    const prefs = createUiPrefs(broken);
    expect(prefs.load()).toEqual({ largeBoardHintSeen: false, reducedTransparency: false });
    expect(() => prefs.setLargeBoardHintSeen(true)).not.toThrow();
    expect(() => prefs.setReducedTransparency(true)).not.toThrow();
    expect(prefs.load()).toEqual({ largeBoardHintSeen: true, reducedTransparency: true });
  });
});
