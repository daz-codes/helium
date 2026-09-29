import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import helium, { heliumTeardown } from "./helium-lite.js";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("Helium Lite", () => {
  let root;

  beforeEach(() => {
    root = document.createElement("main");
    root.setAttribute("data-helium", "");
    document.body.append(root);
  });

  afterEach(() => {
    heliumTeardown();
    document.body.innerHTML = "";
  });

  it("initializes and updates @text", async () => {
    root.innerHTML = '<span @text="count">2</span>';
    const state = await helium();
    expect(state.count).toBe(2);
    state.count++;
    await tick();
    expect(root.textContent).toBe("3");
  });

  it("does not replace explicit initial state with seeded markup", async () => {
    root.innerHTML = '<span @text="name">Markup</span>';
    await helium({ name: "State" });
    expect(root.textContent).toBe("State");
  });

  it("evaluates root @data before bindings", async () => {
    root.innerHTML = '<section @data="{ open: true }"><span @text="open ? \'yes\' : \'no\'"></span></section>';
    const state = await helium();
    expect(root.textContent).toBe("yes");
    expect(state.open).toBe(true);
  });

  it("reacts to nested state changes", async () => {
    root.innerHTML = '<span @text="user.address.city"></span>';
    const state = await helium({ user: { address: { city: "London" } } });
    state.user.address.city = "Bristol";
    await tick();
    expect(root.textContent).toBe("Bristol");
  });

  it("batches repeated changes", async () => {
    const stringify = vi.fn(value => value);
    root.innerHTML = '<span @text="stringify(count)"></span>';
    const state = await helium({ count: 0, stringify });
    stringify.mockClear();
    state.count = 1;
    state.count = 2;
    state.count = 3;
    await tick();
    expect(stringify).toHaveBeenCalledOnce();
    expect(root.textContent).toBe("3");
  });

  it("renders @html with native innerHTML", async () => {
    root.innerHTML = '<div @html="content"></div>';
    const state = await helium({ content: "<strong>Hello</strong>" });
    expect(root.querySelector("strong").textContent).toBe("Hello");
    state.content = "<em>Bye</em>";
    await tick();
    expect(root.querySelector("em").textContent).toBe("Bye");
  });

  it("binds text inputs in both directions", async () => {
    root.innerHTML = '<input @bind.trim="name" value="Ada"><span @text="name"></span>';
    const state = await helium();
    expect(state.name).toBe("Ada");
    const input = root.querySelector("input");
    input.value = "  Grace  ";
    input.dispatchEvent(new Event("input"));
    await tick();
    expect(state.name).toBe("Grace");
    expect(root.querySelector("span").textContent).toBe("Grace");
  });

  it("supports number and lazy binding modifiers", async () => {
    root.innerHTML = '<input @bind.number.lazy="count" value="1">';
    const state = await helium();
    const input = root.querySelector("input");
    input.value = "5";
    input.dispatchEvent(new Event("input"));
    expect(state.count).toBe(1);
    input.dispatchEvent(new Event("change"));
    expect(state.count).toBe(5);
  });

  it("supports checkbox binding", async () => {
    root.innerHTML = '<input type="checkbox" @bind="enabled" checked>';
    const state = await helium();
    expect(state.enabled).toBe(true);
    const input = root.querySelector("input");
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    expect(state.enabled).toBe(false);
  });

  it("supports dynamic attributes and booleans", async () => {
    root.innerHTML = '<button :title="label" :disabled="busy" :hidden="hidden"></button>';
    const state = await helium({ label: "Save", busy: false, hidden: false });
    const button = root.querySelector("button");
    expect(button.title).toBe("Save");
    expect(button.hasAttribute("disabled")).toBe(false);
    state.busy = true;
    state.hidden = true;
    await tick();
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.hidden).toBe(true);
  });

  it("supports @hidden and @visible toggles", async () => {
    root.innerHTML = '<div @hidden="closed"></div><p @visible="open"></p>';
    const state = await helium({ closed: true, open: false });
    expect([...root.children].every(element => element.hidden)).toBe(true);
    state.closed = false;
    state.open = true;
    await tick();
    expect([...root.children].every(element => !element.hidden)).toBe(true);
  });

  it("reconciles object classes while preserving static classes", async () => {
    root.innerHTML = '<div class="base" :class="classes"></div>';
    const state = await helium({ classes: { active: true, stale: true } });
    const element = root.firstElementChild;
    state.classes = { current: true };
    await tick();
    expect(element.className.split(" ").sort()).toEqual(["base", "current"]);
  });

  it("applies object styles", async () => {
    root.innerHTML = '<div :style="styles"></div>';
    const state = await helium({ styles: { color: "red" } });
    expect(root.firstElementChild.style.color).toBe("red");
    state.styles = { color: "blue" };
    await tick();
    expect(root.firstElementChild.style.color).toBe("blue");
  });

  it("runs event expressions", async () => {
    root.innerHTML = '<button @click="count++"></button><span @text="count"></span>';
    await helium({ count: 0 });
    root.querySelector("button").click();
    await tick();
    expect(root.querySelector("span").textContent).toBe("1");
  });

  it("supports prevent, stop, self and once", async () => {
    root.innerHTML = '<div @click.self="outer++"><button @click.prevent.stop.once="inner++"></button></div>';
    const state = await helium({ outer: 0, inner: 0 });
    const button = root.querySelector("button");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    button.click();
    expect(event.defaultPrevented).toBe(true);
    expect(state).toMatchObject({ outer: 0, inner: 1 });
    root.firstElementChild.click();
    expect(state.outer).toBe(1);
  });

  it("supports common key modifiers", async () => {
    root.innerHTML = '<input @keydown.enter="submitted++">';
    const state = await helium({ submitted: 0 });
    const input = root.querySelector("input");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(state.submitted).toBe(1);
  });

  it("supports data-he-* aliases", async () => {
    root.innerHTML = '<button data-he-click="open = !open"></button><span data-he-text="open"></span>';
    await helium({ open: false });
    root.querySelector("button").click();
    await tick();
    expect(root.querySelector("span").textContent).toBe("true");
  });

  it("provides singular @ref references", async () => {
    root.innerHTML = '<output @ref="$result"></output><button @click="$result.textContent = \'Done\'"></button>';
    await helium();
    root.querySelector("button").click();
    expect(root.querySelector("output").textContent).toBe("Done");
  });

  it("runs synchronous @init setup and cleanup", async () => {
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    root.innerHTML = '<section @init="setup($el)"></section>';
    await helium({ setup });
    const section = root.querySelector("section");
    expect(setup).toHaveBeenCalledWith(section);
    section.remove();
    await tick();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("initializes directives added as child content", async () => {
    const state = await helium({ count: 2 });
    root.insertAdjacentHTML("beforeend", '<span @text="count"></span>');
    await tick();
    expect(root.textContent).toBe("2");
    state.count = 3;
    await tick();
    expect(root.textContent).toBe("3");
  });

  it("stops listeners and bindings after teardown", async () => {
    root.innerHTML = '<button @click="count++"></button><span @text="count"></span>';
    const state = await helium({ count: 0 });
    heliumTeardown();
    root.querySelector("button").click();
    state.count++;
    await tick();
    expect(root.querySelector("span").textContent).toBe("0");
  });

  it("does not expose Standard-only mounting APIs", () => {
    expect(helium.mount).toBeUndefined();
  });
});
