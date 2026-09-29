export type { HeliumCleanup, HeliumState, MaybePromise } from "./_types.js";

import type { HeliumState } from "./_types.js";

export declare function helium(initial?: HeliumState): Promise<HeliumState>;
export declare function heliumTeardown(): void;
export default helium;
