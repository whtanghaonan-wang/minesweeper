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
