// 七种音效的 Web Audio 实时合成(v2.1 设计文档 §3 + v2.2 §5,A·木质柔和)——零素材文件。
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

/** 插旗(v2.2 §5.1,甲·木钉入座) */
export function playFlag(): void {
  tone(988, "sine", 0.055, 0.2);
  tone(1976, "sine", 0.03, 0.05);
  noise(0.02, 0.07, 0, 1500);
}

/** 拔旗(低一档) */
export function playUnflag(): void {
  tone(784, "sine", 0.055, 0.18);
  tone(1568, "sine", 0.03, 0.04);
  noise(0.02, 0.05, 0, 1100);
}
