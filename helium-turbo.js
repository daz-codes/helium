import { createHelium as createBase, disableDefault, registerSSE } from "./helium.js";
import { createTurboAdapter } from "./helium-turbo-adapter.js";

// The base build owns normal one-shot auto initialization. The Turbo adapter
// takes that ownership so it can safely tear down snapshots and restart after
// navigation without installing any navigation listeners in Helium core.
disableDefault();
const { create: createHelium, helium, heliumTeardown } = createTurboAdapter(createBase);

export { createHelium, helium, heliumTeardown, registerSSE };
export default helium;
