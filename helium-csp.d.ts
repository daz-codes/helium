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
  WatchOptions,
} from "./_types.js";

import type { HeliumEntrypoint, HeliumInstance, HeliumOptions } from "./_types.js";

export interface CSPHeliumEntrypoint extends HeliumEntrypoint {
  allowGlobals(globals: Record<string, unknown>): void;
}

export declare function createCSPHelium(options?: HeliumOptions): HeliumInstance;
export declare const helium: CSPHeliumEntrypoint;
export declare const heliumTeardown: () => void;
export declare function allowGlobals(globals: Record<string, unknown>): void;
export declare function preprocess(expression: string): string;
export declare function evaluate(expression: string, scope?: Record<string, unknown>): unknown;
export default helium;
