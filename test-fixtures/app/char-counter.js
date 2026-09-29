// Imported behavior: shows "used/limit" for the nearest `title` field.
export default function ({ element, watch, signal }) {
  window.appLog.setups++;
  signal.addEventListener("abort", () => window.appLog.cleanups++, { once: true });
  const limit = Number(element.dataset.limit);
  watch(data => data.title ?? "", title => {
    element.textContent = `${title.length}/${limit}`;
  }, { immediate: true });
}
