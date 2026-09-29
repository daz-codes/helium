export const importedBehaviorTwo = true;

export default context => {
  if (globalThis.__heliumImportBehavior) {
    return globalThis.__heliumImportBehavior("two", context);
  }
  const { element, refs, query, signal } = context;
  element.dataset.startedTwo = String(Number(element.dataset.startedTwo || 0) + 1);
  element.dataset.refsTwo = String(refs.trigger.length);
  element.dataset.queriesTwo = String(query.all(".candidate").length);
  return () => { element.dataset.cleanedTwo = String(signal.aborted); };
};
