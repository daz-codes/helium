import helium, {
  createHelium,
  helium as namedHelium,
  heliumTeardown,
  type HeliumBehavior,
  type HeliumErrorContext,
} from "@daz4126/helium";
import lite, { heliumTeardown as teardownLite } from "@daz4126/helium/lite";
import sse, { handleSSE } from "@daz4126/helium/sse";
import turbo from "@daz4126/helium/turbo";
import turboSse from "@daz4126/helium/turbo/sse";
import csp, { allowGlobals, createCSPHelium } from "@daz4126/helium/csp";
import cspSse from "@daz4126/helium/csp/sse";
import cspTurbo from "@daz4126/helium/csp/turbo";
import cspTurboSse from "@daz4126/helium/csp/turbo/sse";

const report = (_error: unknown, context: HeliumErrorContext) => context.phase;
const app = createHelium({ root: "#app", handleError: report, requireCsrf: true });
const liteState = await lite({ count: 0 });
liteState.count = 1;
teardownLite();
const cspApp = createCSPHelium({ debug: true });

void app.helium({ count: 0 }).then(state => state.count++);
cspApp.heliumTeardown();
heliumTeardown();

const behavior: HeliumBehavior<{ open: boolean }> = ({ data, refs, watch, signal }) => {
  watch(value => value.open, (current, previous) => {
    data.open = previous === undefined ? current : !previous;
  });
  refs.trigger[0]?.addEventListener("click", () => { data.open = true; }, { signal });
};

allowGlobals({ fetch });
void behavior;
void [helium, namedHelium, lite, sse, turbo, turboSse, csp, cspSse, cspTurbo, cspTurboSse, handleSSE];
