export function setPersistenceWarning(show: boolean): void {
  const existing = document.querySelector(".persistence-warning");
  if (!show) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const warning = document.createElement("p");
  warning.className = "persistence-warning";
  warning.setAttribute("role", "status");
  warning.setAttribute("aria-live", "polite");
  warning.textContent = "进度暂未保存，将自动重试";
  document.body.appendChild(warning);
}
