import type { PwaUpdateCoordinator, UpdateSnapshot } from "./pwa-update";

export function mountPwaPrompt(coordinator: PwaUpdateCoordinator): () => void {
  let prompt: HTMLElement | null = null;
  let destroyed = false;
  const remove = (): void => {
    prompt?.remove();
    prompt = null;
  };
  const render = (snapshot: UpdateSnapshot): void => {
    if (destroyed) return;
    remove();
    if (!snapshot.visible) return;

    const panel = document.createElement("aside");
    panel.className = "pwa-update-prompt glass-clear";
    panel.dataset["liquidGlass"] = "";

    const text = document.createElement("p");
    text.className = "pwa-update-message";
    text.setAttribute("role", "status");
    text.setAttribute("aria-live", "polite");
    text.textContent = snapshot.state === "error"
      ? "更新未完成，请稍后重试"
      : snapshot.state === "activating"
        ? "正在更新…"
        : snapshot.reloadReady
          ? "新版本已启用，重新载入后使用"
          : "新版本已准备好";
    panel.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "pwa-update-actions";
    const now = document.createElement("button");
    now.type = "button";
    now.className = "pwa-now";
    now.dataset["jelly"] = "";
    now.textContent = snapshot.state === "error"
      ? "重试"
      : snapshot.reloadReady
        ? "重新载入"
        : "立即更新";
    now.disabled = snapshot.state === "activating";
    now.addEventListener("click", () => { void coordinator.activate(); });

    const later = document.createElement("button");
    later.type = "button";
    later.className = "pwa-later";
    later.dataset["jelly"] = "";
    later.textContent = "稍后";
    later.disabled = snapshot.state === "activating";
    later.addEventListener("click", () => coordinator.defer());
    actions.append(now, later);
    panel.appendChild(actions);
    document.body.appendChild(panel);
    prompt = panel;
  };

  const unsubscribe = coordinator.subscribe(render);
  return () => {
    if (destroyed) return;
    destroyed = true;
    unsubscribe();
    remove();
  };
}
