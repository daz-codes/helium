export default function connectDisclosure({ element, data, refs, watch, signal, dispatch }) {
  const close = () => { data.open = false }

  document.addEventListener("click", event => {
    if (!element.contains(event.target)) close()
  }, { signal })

  element.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !data.open) return
    close()
    refs.trigger[0]?.focus()
  }, { signal })

  watch(
    state => state.open,
    (open, previous) => {
      const trigger = refs.trigger[0]
      const panel = refs.panel[0]
      trigger?.setAttribute("aria-expanded", String(open))
      if (panel) panel.inert = !open
      element.dataset.state = open ? "open" : "closed"
      if (previous !== undefined) dispatch("disclosure:change", { open, previous })
    },
    { immediate: true },
  )

  return () => element.removeAttribute("data-state")
}
