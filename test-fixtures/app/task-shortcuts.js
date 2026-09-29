// Imported behavior: pressing "n" focuses the new-task field.
export default function ({ refs, signal }) {
  window.appLog.setups++;
  signal.addEventListener("abort", () => window.appLog.cleanups++, { once: true });
  document.addEventListener("keydown", event => {
    if (event.key !== "n" || event.target !== document.body) return;
    event.preventDefault();
    refs.newTask[0]?.focus();
  }, { signal });
}
