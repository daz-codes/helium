export type {
  CompiledExpression,
  ExpressionEngine,
  HeliumBehavior,
  HeliumBehaviorContext,
  HeliumCleanup,
  HeliumEntrypoint,
  HeliumErrorContext,
  HeliumInstance,
  HeliumOptions,
  HeliumQuery,
  HeliumRequest,
  HeliumRequestOptions,
  HeliumRoot,
  HeliumState,
  HeliumWatch,
  MaybePromise,
  MountedHelium,
  SSEHandler,
  TurboIntegration,
  WatchOptions,
} from "./_types.js";

import type { HeliumEntrypoint, HeliumInstance, HeliumOptions, SSEHandler, TurboIntegration } from "./_types.js";

export declare function createHelium(options?: HeliumOptions): HeliumInstance;
export declare const helium: HeliumEntrypoint;
export declare const heliumTeardown: () => void;
export declare function disableDefault(): void;
export declare function registerSSE(handler: SSEHandler | null): SSEHandler | null;
export declare function registerTurbo(integration: TurboIntegration | null): TurboIntegration | null;
export default helium;
