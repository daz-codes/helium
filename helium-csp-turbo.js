import {
  allowGlobals,
  createCSPHelium as createBase,
  evaluate,
  preprocess,
} from "./helium-csp.js";
import { createTurboAdapter } from "./helium-turbo-adapter.js";

const { create: createCSPHelium, helium, heliumTeardown } = createTurboAdapter(createBase);
helium.allowGlobals = allowGlobals;

export { allowGlobals, createCSPHelium, evaluate, helium, heliumTeardown, preprocess };
export default helium;
