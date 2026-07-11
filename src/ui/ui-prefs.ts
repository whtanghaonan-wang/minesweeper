export const UI_PREFS_KEY = "minesweeper-ui-prefs-v1";

export interface UiPrefs {
  largeBoardHintSeen: boolean;
  reducedTransparency: boolean;
}

export interface UiPrefsStore {
  load(): UiPrefs;
  setLargeBoardHintSeen(seen: boolean): void;
  setReducedTransparency(reduced: boolean): void;
}

type Backend = Pick<Storage, "getItem" | "setItem">;
const defaults = (): UiPrefs => ({ largeBoardHintSeen: false, reducedTransparency: false });

export function applyReducedTransparency(reduced: boolean): void {
  if (reduced) document.documentElement.dataset["reducedTransparency"] = "true";
  else delete document.documentElement.dataset["reducedTransparency"];
}

export function createUiPrefs(backend?: Backend): UiPrefsStore {
  let data = defaults();
  try {
    const raw = backend?.getItem(UI_PREFS_KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      data = {
        largeBoardHintSeen: parsed["largeBoardHintSeen"] === true,
        reducedTransparency: parsed["reducedTransparency"] === true,
      };
    }
  } catch {
    data = defaults();
  }

  const persist = (): void => {
    try {
      backend?.setItem(UI_PREFS_KEY, JSON.stringify(data));
    } catch {
      // UI 偏好可丢，内存状态仍保持可用。
    }
  };

  return {
    load: () => ({ ...data }),
    setLargeBoardHintSeen(seen) {
      data = { ...data, largeBoardHintSeen: seen };
      persist();
    },
    setReducedTransparency(reduced) {
      data = { ...data, reducedTransparency: reduced };
      persist();
    },
  };
}
