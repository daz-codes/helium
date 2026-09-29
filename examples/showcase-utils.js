export async function connectClock(element, data, signal) {
  element.dataset.status = "connecting"
  await new Promise(resolve => setTimeout(resolve, 320))

  let timer
  if (!signal.aborted) {
    element.dataset.status = "connected"
    timer = setInterval(() => { data.ticks++ }, 800)
  }

  return () => {
    clearInterval(timer)
    data.cleanups++
  }
}

export function cycleDirective(button, data) {
  const actions = [
    ["score += 1", "+1 point"],
    ["score += 5", "+5 points"],
    ["score = 0", "Reset score"],
  ]
  data.actionIndex = (data.actionIndex + 1) % actions.length
  const [expression, label] = actions[data.actionIndex]
  button.setAttribute("data-he-click", expression)
  data.actionLabel = label
}
