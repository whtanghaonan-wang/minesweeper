/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTest,
  isMuted,
  playBlank,
  playBoom,
  playFlag,
  playLose,
  playNumber,
  playUnflag,
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

  it("插旗/拔旗音(甲·木钉入座):各 sine×2+噪声×1,拔旗低一档;静音短路", () => {
    unlock();
    const c = FakeCtx.instances[0]!;
    playFlag();
    expect(c.oscs).toHaveLength(2);
    expect(c.oscs.every((o) => o.type === "sine" && o.started)).toBe(true);
    expect(c.noises).toBe(1);
    playUnflag();
    expect(c.oscs).toHaveLength(4);
    expect(c.noises).toBe(2);
    setMuted(true);
    playFlag();
    playUnflag();
    expect(c.oscs).toHaveLength(4);
    expect(c.noises).toBe(2);
  });
});
