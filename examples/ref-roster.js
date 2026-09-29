export default function connectRefRoster({ data, refs, watch }) {
  watch(
    () => refs.member,
    (current, previous = []) => {
      data.refCount = current.length
      data.refChange = `${previous.length} → ${current.length} live refs`
    },
    { immediate: true },
  )
}
