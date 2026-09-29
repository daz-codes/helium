export type HeliumState = Record<PropertyKey, any>;
export type HeliumRoot = Element | string;
export type MaybePromise<T> = T | PromiseLike<T>;
export type HeliumCleanup = () => MaybePromise<void>;

export interface CompiledExpression {
  execute(scope: unknown): unknown;
  error?: unknown;
}

export interface ExpressionEngine {
  diagnosticName?: string;
  compile(expression: string, withReturn?: boolean): CompiledExpression;
  createScope?(context: Record<string, unknown>): unknown;
}

export interface HeliumRequest {
  method: string;
  url: string;
  element: Element;
  signal: AbortSignal;
  response: Response | null;
  data: unknown;
  error?: unknown;
}

export interface HeliumErrorContext {
  phase: "setup" | "cleanup" | "watch" | "binding" | "event" | "import" | "request" | string;
  root: Element | null;
  element?: Element;
  directive?: string;
  expression?: string;
  signal?: AbortSignal;
  event?: Event;
  behavior?: string;
  path?: string;
  method?: string;
  url?: string;
  status?: number;
  response?: Response;
  request?: HeliumRequest;
  stage?: string;
  [key: string]: unknown;
}

export interface HeliumRequestOptions extends RequestInit {
  target?: string | Node | Array<string | Node>;
  action?: string | null | Array<string | null>;
  template?: string;
  loading?: string | Node | Record<string, unknown>;
  latest?: boolean;
  requestKey?: string;
  requireCsrf?: boolean;
  signal?: AbortSignal;
  retry?: number;
  retryMode?: "always" | "error" | string;
  success?(data: unknown, request: HeliumRequest): MaybePromise<void>;
  error?(error: unknown, request: HeliumRequest): MaybePromise<void>;
}

export interface SSEHandler {
  (
    response: Response,
    options: HeliumRequestOptions,
    reconnect: (lastEventId: string | null) => MaybePromise<unknown>,
    update: (...args: any[]) => unknown,
    isCurrent?: () => boolean,
    onError?: (error: unknown) => MaybePromise<void>,
  ): MaybePromise<boolean | void>;
}

export interface TurboIntegration {
  morphChildren?(element: Element, incoming: Element): boolean;
  renderStreamMessage(message: string): unknown;
}

export interface HeliumOptions {
  root?: HeliumRoot;
  engine?: ExpressionEngine;
  handleError?(error: unknown, context: HeliumErrorContext): void;
  debug?: boolean;
  requireCsrf?: boolean;
  sse?: SSEHandler;
}

export interface MountedHelium<State extends HeliumState = HeliumState> {
  state: State;
  unmount(): void;
}

export interface HeliumInstance {
  helium<State extends HeliumState = HeliumState>(initialState?: State): Promise<State>;
  heliumTeardown(): void;
  mount<State extends HeliumState = HeliumState>(root: HeliumRoot, initialState?: State): Promise<MountedHelium<State>>;
}

export interface HeliumEntrypoint {
  <State extends HeliumState = HeliumState>(initialState?: State): Promise<State>;
  mount<State extends HeliumState = HeliumState>(root: HeliumRoot, initialState?: State): Promise<MountedHelium<State>>;
}

export interface HeliumQuery {
  (selector: string): Element | null;
  all(selector: string): Element[];
}

export interface WatchOptions<Value> {
  immediate?: boolean;
  equals?: false | ((current: Value, previous: Value) => boolean);
}

export interface HeliumWatch<State extends HeliumState = HeliumState> {
  <Value>(
    selector: (data: State) => Value,
    callback: (current: Value, previous: Value | undefined) => MaybePromise<void>,
    options?: WatchOptions<Value>,
  ): () => void;
}

export interface HeliumBehaviorContext<State extends HeliumState = HeliumState> {
  element: Element;
  root: Element;
  scope: Element;
  data: State;
  refs: Record<string, Element[]>;
  query: HeliumQuery;
  watch: HeliumWatch<State>;
  signal: AbortSignal;
  dispatch(name: string, detail?: unknown, options?: {
    bubbles?: boolean;
    cancelable?: boolean;
    target?: EventTarget;
  }): CustomEvent;
}

export type HeliumBehavior<State extends HeliumState = HeliumState> =
  (context: HeliumBehaviorContext<State>) => MaybePromise<void | HeliumCleanup>;
