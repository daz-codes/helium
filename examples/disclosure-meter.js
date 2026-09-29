export default function connectDisclosureMeter({ data, watch }) {
  watch(state => state.open, () => { data.transitions++ })
}
