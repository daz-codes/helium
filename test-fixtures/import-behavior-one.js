export const importedGreeting = name => `Hello ${name}`;

export default context => {
  if (globalThis.__heliumImportBehavior) {
    return globalThis.__heliumImportBehavior("one", context);
  }
  const { element, refs, query, watch, signal } = context;
  element.dataset.startedOne = String(Number(element.dataset.startedOne || 0) + 1);
  element.dataset.refsOne = String(refs.trigger.length);
  element.dataset.queriesOne = String(query.all(".candidate").length);
  watch(data => data.watched, (value, previous) => {
    element.dataset.watched = `${previous}:${value}`;
  });
  watch(() => refs.trigger, (value, previous) => {
    element.dataset.watchedRefs = `${previous.length}:${value.length}`;
  });
  return () => { element.dataset.cleanedOne = String(signal.aborted); };
};
