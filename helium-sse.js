import helium, { registerSSE } from "./helium.js";

const handleSSE = async (response, options, reconnect, update, isCurrent = () => true, onError) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", lastId = null, retryDelay = options.retry || 3000, reconnecting = false;

  const processEvents = () => {
    const events = buffer.split(/\r\n\r\n|\r\r|\n\n/);
    buffer = events.pop();
    for (const block of events) {
      if (!block.trim()) continue;
      let data = "", event = "", id = null;
      for (const line of block.split(/\r\n|\r|\n/)) {
        if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trimStart();
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("id:")) id = line.slice(3).trim();
        else if (line.startsWith("retry:")) retryDelay = parseInt(line.slice(6).trim()) || retryDelay;
      }
      if (id) lastId = id;
      if (data && isCurrent()) {
        // An explicit @target wins; otherwise Helium's SSE convention uses the
        // event field as a selector or state property name.
        const targets = options.target?.length ? options.target : event ? [event] : undefined;
        update(data, targets, options.action, options.template);
      }
    }
  };

  const retry = () => {
    reconnecting = true;
    return setTimeout(async () => {
      if (!isCurrent()) return;
      try {
        await reconnect(lastId);
      } catch (error) {
        if (error?.name === "AbortError" || !isCurrent()) return;
        if (onError) await onError(error);
        else console.error("SSE:", error.message);
        if (isCurrent()) retry();
      }
    }, retryDelay);
  };
  try {
    while (isCurrent()) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processEvents();
    }
    if (buffer.trim() && isCurrent()) {
      buffer += "\n\n";
      processEvents();
    }
    if (options.retryMode === "always" && isCurrent()) retry();
  } catch (error) {
    if (error?.name === "AbortError" || !isCurrent()) return reconnecting;
    if (options.retryMode === "always" || options.retryMode === "error") {
      if (onError) await onError(error);
      else console.error("SSE:", error.message);
      if (isCurrent()) retry();
    } else throw error;
  }
  return reconnecting;
};

registerSSE(handleSSE);

export * from "./helium.js";
export { handleSSE };
export default helium;
