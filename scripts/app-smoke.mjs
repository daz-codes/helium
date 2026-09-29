// Runs the packed release candidate through a small Rails-style application:
// import-map pins, Turbo Drive navigation and caching, plain and Helium forms,
// server validation, CSRF, Turbo Frames and Streams, morph refreshes,
// permanent elements, and imported behaviors, in Chromium, Firefox and WebKit.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assets = join(root, "test-fixtures/app");
const CSRF = "app-smoke-token";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const esc = value => String(value)
  .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const data = value => esc(JSON.stringify(value));

// ---------------------------------------------------------------- the app --

let db;
const resetDb = () => {
  db = {
    nextId: 100,
    projects: [
      { id: 1, title: "Alpha", tasks: [{ id: 11, text: "Write spec", done: false }, { id: 12, text: "Review", done: false }] },
      { id: 2, title: "Beta", tasks: [] },
      { id: 3, title: "Gamma", tasks: [{ id: 31, text: "Ship", done: true }] },
    ],
    comments: { 1: ["First!"] },
    renames: [],
    frameLoads: 0,
  };
};

const layout = ({ title, body, refresh = false }) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="csrf-token" content="${CSRF}">
${refresh ? '<meta name="turbo-refresh-method" content="morph"><meta name="turbo-refresh-scroll" content="preserve">' : ""}
<script type="importmap">${JSON.stringify({ imports: {
  "@hotwired/turbo": "/vendor/turbo.js",
  "@daz4126/helium/turbo": "/vendor/helium/dist/helium-turbo.min.js",
  "char-counter": "/assets/char-counter-7d1e2f.js",
  "task-shortcuts": "/assets/task-shortcuts-9a0b1c.js",
} })}</script>
<script type="module" src="/assets/application-3c4d5e.js"></script>
</head><body>
<nav><a id="nav-home" href="/">Projects</a> <a id="nav-new" href="/projects/new">New project</a></nav>
<aside id="notes" data-turbo-permanent @data="{ note: '' }">
  <textarea id="note" @bind="note"></textarea>
  <span id="note-length" @text="note.length"></span>
</aside>
${body}
</body></html>`;

const indexPage = () => layout({ title: "Projects", body: `
<main id="projects-page" @data="${data({ projects: db.projects.map(({ id, title }) => ({ id, title })), query: "", visible: [] })}">
  <h1>Projects</h1>
  <input id="search" @bind="query" placeholder="Filter projects">
  <span hidden @calculate:visible="projects.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()))"></span>
  <p id="visible-count" @text="visible.length + ' of ' + projects.length"></p>
  <ul id="project-list">
    <template @for="project in visible" :key="project.id">
      <li class="project"><a :href="'/projects/' + project.id" @text="project.title"></a></li>
    </template>
  </ul>
</main>` });

const projectPage = project => layout({ title: project.title, refresh: true, body: `
<main id="project-page" @data="${data({ project, newTask: "", status: "" })}" @import="task-shortcuts">
  <h1 id="project-title" @text="project.title"></h1>
  <label>Rename
    <input id="rename" name="project[title]" value="${esc(project.title)}"
      @post.debounce:50="/projects/${project.id}/rename"
      @success="project.title = $response.title, status = 'Saved'">
  </label>
  <span id="status" @text="status"></span>
  <p id="remaining" @text="formatCount(project.tasks.filter(t => !t.done).length)"></p>
  <ul id="tasks">
    <template @for="task in project.tasks" :key="task.id">
      <li class="task">
        <label><input type="checkbox" class="task-done" @bind="task.done"> <span class="task-text" @text="task.text"></span></label>
        <button class="task-delete" @click="$delete('/projects/${project.id}/tasks/' + task.id).then(() => project.tasks = project.tasks.filter(t => t.id !== task.id))">Delete</button>
      </li>
    </template>
  </ul>
  <form id="task-form" @post.prevent="/projects/${project.id}/tasks" @params="{ text: newTask }"
    @success="project.tasks = [...project.tasks, $response], newTask = ''">
    <input id="new-task" @ref="newTask" @bind="newTask" placeholder="New task" autocomplete="off">
    <button id="add-task" :disabled="!newTask.trim()">Add</button>
  </form>
  <button id="sync" @click="Turbo.visit(location.href, { action: 'replace' })">Sync</button>
  <turbo-frame id="comments" src="/projects/${project.id}/comments" refresh="morph"></turbo-frame>
</main>` });

const commentsFrame = project => `<!doctype html><html><body>
<turbo-frame id="comments">
  <section id="comment-box" @data="{ draft: '' }">
    <span id="comments-version">${++db.frameLoads}</span>
    <ul id="comment-list">${(db.comments[project.id] || []).map(body => `<li class="comment">${esc(body)}</li>`).join("")}</ul>
    <form id="comment-form" @post.prevent="/projects/${project.id}/comments" @params="{ body: draft }" @success="draft = ''">
      <textarea id="comment-draft" @bind="draft"></textarea>
      <span id="comment-length" @text="draft.length"></span>
      <button id="post-comment" :disabled="!draft.trim()">Post</button>
    </form>
  </section>
</turbo-frame></body></html>`;

const newPage = (title = "", error = "") => layout({ title: "New project", body: `
<main id="new-page" @data="${data({ title })}">
  <h1>New project</h1>
  <form id="project-form" action="/projects" method="post">
    <input id="title" name="title" @bind="title" maxlength="40" autocomplete="off">
    <small id="title-count" @import="char-counter" data-limit="40"></small>
    ${error ? `<p id="title-error">${esc(error)}</p>` : ""}
    <button id="create" :disabled="title.trim().length < 3">Create</button>
  </form>
</main>` });

const readBody = req => new Promise((resolveBody, reject) => {
  let raw = "";
  req.on("data", chunk => raw += chunk);
  req.on("end", () => {
    const type = req.headers["content-type"] || "";
    try {
      resolveBody(type.includes("json") ? JSON.parse(raw || "{}")
        : Object.fromEntries(new URLSearchParams(raw)));
    } catch (error) { reject(error); }
  });
});

const send = (res, status, body, type = "text/html; charset=utf-8", headers = {}) => {
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(body);
};

async function handleApp(req, res, url) {
  const { pathname } = url;
  const method = req.method;
  if (method !== "GET" && req.headers["x-csrf-token"] !== CSRF) {
    return send(res, 403, "Invalid authenticity token", "text/plain");
  }
  const match = pathname.match(/^\/projects\/(\d+)(\/.*)?$/);
  const project = match && db.projects.find(p => p.id === Number(match[1]));
  const rest = match?.[2] || "";

  if (method === "GET" && pathname === "/") return send(res, 200, indexPage());
  if (method === "GET" && pathname === "/projects/new") return send(res, 200, newPage());
  if (method === "POST" && pathname === "/projects") {
    const title = String((await readBody(req)).title || "").trim();
    const error = title.length < 3 ? "Title is too short"
      : db.projects.some(p => p.title.toLowerCase() === title.toLowerCase()) ? "Title has already been taken" : "";
    if (error) return send(res, 422, newPage(title, error));
    const created = { id: db.nextId++, title, tasks: [] };
    db.projects.push(created);
    return send(res, 303, "", "text/plain", { Location: `/projects/${created.id}` });
  }
  if (!project) return send(res, 404, "Not found", "text/plain");

  if (method === "GET" && rest === "") return send(res, 200, projectPage(project));
  if (method === "GET" && rest === "/comments") return send(res, 200, commentsFrame(project));
  if (method === "POST" && rest === "/rename") {
    const body = await readBody(req);
    db.renames.push(body);
    project.title = body.project.title;
    return send(res, 200, JSON.stringify({ title: project.title }), "application/json");
  }
  if (method === "POST" && rest === "/tasks") {
    const task = { id: db.nextId++, text: String((await readBody(req)).text), done: false };
    project.tasks.push(task);
    return send(res, 201, JSON.stringify(task), "application/json");
  }
  const taskMatch = rest.match(/^\/tasks\/(\d+)$/);
  if (method === "DELETE" && taskMatch) {
    project.tasks = project.tasks.filter(t => t.id !== Number(taskMatch[1]));
    return send(res, 204, "", "text/plain");
  }
  if (method === "POST" && rest === "/comments") {
    const text = String((await readBody(req)).body);
    (db.comments[project.id] ||= []).push(text);
    return send(res, 200,
      `<turbo-stream action="append" target="comment-list"><template><li class="comment">${esc(text)}</li></template></turbo-stream>`,
      "text/vnd.turbo-stream.html; charset=utf-8");
  }
  return send(res, 404, "Not found", "text/plain");
}

// -------------------------------------------------------------- the server --

async function serveFile(res, base, relative) {
  const path = resolve(base, relative);
  if (path !== base && !path.startsWith(base + sep)) return send(res, 403, "Forbidden", "text/plain");
  const type = { ".js": "text/javascript; charset=utf-8", ".json": "application/json" }[extname(path)] || "text/plain";
  send(res, 200, await readFile(path), type);
}

function startServer(packageDir) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/vendor/turbo.js") {
        return await serveFile(res, root, "node_modules/@hotwired/turbo/dist/turbo.es2017-esm.js");
      }
      if (url.pathname.startsWith("/vendor/helium/")) {
        return await serveFile(res, packageDir, url.pathname.slice("/vendor/helium/".length));
      }
      if (url.pathname.startsWith("/assets/")) {
        // Digested names, as Propshaft serves them: name-abc123.js -> name.js
        return await serveFile(res, assets, url.pathname.slice(8).replace(/-[0-9a-f]{6}\.js$/, ".js"));
      }
      if (url.pathname === "/favicon.ico") return send(res, 404, "", "text/plain");
      await handleApp(req, res, url);
    } catch (error) {
      send(res, error.code === "ENOENT" ? 404 : 500, error.stack || String(error), "text/plain");
    }
  });
  return new Promise(resolveServer => server.listen(0, "127.0.0.1", () => resolveServer(server)));
}

// ------------------------------------------------------------ the scenario --

const texts = (page, selector) => page.locator(selector).allTextContents();
const expectText = (page, selector, expected) => page.waitForFunction(
  ({ selector, expected }) => document.querySelector(selector)?.textContent.trim() === expected,
  { selector, expected },
);
const settle = page => page.waitForTimeout(150);

async function scenario(page, baseUrl) {
  await page.goto(baseUrl + "/");
  await page.waitForFunction(() => window.appReady === true);
  await expectText(page, "#visible-count", "3 of 3");

  // Permanent widget: state must outlive every navigation below.
  await page.locator("#note").fill("remember me");
  await expectText(page, "#note-length", "11");

  // Local @calculate + @for filtering.
  await page.locator("#search").fill("a");
  await expectText(page, "#visible-count", "3 of 3");
  await page.locator("#search").fill("be");
  await expectText(page, "#visible-count", "1 of 3");
  assert((await texts(page, ".project")).join() === "Beta", "Filtering did not narrow the list");
  await page.locator("#search").fill("");
  await expectText(page, "#visible-count", "3 of 3");

  // Turbo Drive navigation through a Helium-rendered link.
  await page.locator(".project a", { hasText: "Alpha" }).click();
  await expectText(page, "#project-title", "Alpha");
  await expectText(page, "#remaining", "2 remaining");
  assert(await page.evaluate(() => window.appLog.setups) === 1, "task-shortcuts behavior did not start once");

  // Imported behavior with refs and a signal-bound document listener.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("n");
  assert(await page.evaluate(() => document.activeElement?.id) === "new-task", "Shortcut did not focus the new-task ref");

  // Lazy Turbo Frame with its own local state.
  await page.locator("#comment-draft").waitFor();
  await expectText(page, ".comment", "First!");

  // Morph refresh with unchanged server data keeps client-only state.
  await page.locator(".task-done").first().check();
  await expectText(page, "#remaining", "1 remaining");
  await page.locator("#comment-draft").fill("half written");
  const frameVersion = await page.locator("#comments-version").textContent();
  await page.locator("#sync").click();
  await page.waitForFunction(v => document.querySelector("#comments-version")?.textContent !== v, frameVersion);
  await settle(page);
  assert(await page.locator(".task-done").first().isChecked(), "Morph refresh lost a local checkbox");
  await expectText(page, "#remaining", "1 remaining");
  assert(await page.locator("#comment-draft").inputValue() === "half written", "Frame morph lost the comment draft");
  assert((await texts(page, ".task")).length === 2, "Morph refresh duplicated or lost task rows");

  // A teammate changes the project; the next sync shows it.
  await page.evaluate(async () => {
    await fetch(location.pathname + "/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name=csrf-token]").content },
      body: JSON.stringify({ text: "From teammate" }),
    });
  });
  await page.locator("#sync").click();
  await page.waitForFunction(() => document.querySelectorAll(".task").length === 3);
  assert((await texts(page, ".task-text")).join() === "Write spec,Review,From teammate", "Server change did not arrive by morph");

  // Turbo Stream response to a Helium form, inside the frame.
  await page.locator("#comment-draft").fill("Looks good");
  await page.locator("#post-comment").click();
  await page.waitForFunction(() => document.querySelectorAll(".comment").length === 2);
  await expectText(page, "#comment-length", "0");

  // Helium JSON form: add, then delete via $delete.
  await page.locator("#new-task").fill("Deploy");
  await page.locator("#add-task").click();
  await page.waitForFunction(() => document.querySelectorAll(".task").length === 4);
  assert(await page.locator("#new-task").inputValue() === "", "Add-task form did not reset");
  await page.locator(".task", { hasText: "Review" }).locator(".task-delete").click();
  await page.waitForFunction(() => document.querySelectorAll(".task").length === 3);

  // Name-derived autosave params: input is data, never code.
  const hostile = "x' + (window.__pwned = 1) + '";
  await page.locator("#rename").fill(hostile);
  await expectText(page, "#status", "Saved");
  assert(await page.evaluate(() => window.__pwned) === undefined, "Autosave input executed as code");
  await page.locator("#rename").fill("Alpha Prime");
  await expectText(page, "#project-title", "Alpha Prime");

  // Plain Turbo form: client-side enablement, 422 re-render, redirect.
  await page.locator("#nav-new").click();
  await page.locator("#title").waitFor();
  await expectText(page, "#title-count", "0/40");
  await page.locator("#title").fill("be");
  await expectText(page, "#title-count", "2/40");
  assert(await page.locator("#create").isDisabled(), "Create should be disabled below 3 characters");
  await page.locator("#title").fill("Beta");
  await page.locator("#create").click();
  await expectText(page, "#title-error", "Title has already been taken");
  assert(await page.locator("#title").inputValue() === "Beta", "Rejected value was not kept");
  await expectText(page, "#title-count", "4/40");
  await page.locator("#title").fill("Delta");
  await page.locator("#create").click();
  await expectText(page, "#project-title", "Delta");
  await expectText(page, "#remaining", "0 remaining");

  // Home, then back and forward through Turbo's cache: no duplicated output.
  await page.locator("#nav-home").click();
  await expectText(page, "#visible-count", "4 of 4");
  await page.goBack();
  await expectText(page, "#project-title", "Delta");
  await settle(page);
  assert((await texts(page, ".task")).length === 0, "Restored project page duplicated rows");
  await page.goForward();
  await expectText(page, "#visible-count", "4 of 4");
  await settle(page);
  assert((await texts(page, ".project")).length === 4, "Restored index duplicated project rows");

  // Behaviors are cleaned up with their pages; the permanent note survived.
  const log = await page.evaluate(() => window.appLog);
  assert(log.setups > 0 && log.setups === log.cleanups,
    `Imported behaviors leaked across navigations (${JSON.stringify(log)})`);
  assert(await page.locator("#note").inputValue() === "remember me", "Permanent note lost its state");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("n");
  assert(await page.evaluate(() => document.activeElement?.id) !== "new-task", "Shortcut listener outlived its page");

  const renames = db.renames.map(body => body.project.title);
  assert(renames.includes(hostile), `Autosave did not send the literal value: ${JSON.stringify(renames)}`);
}

// ------------------------------------------------------------------ runner --

const work = await mkdtemp(join(tmpdir(), "helium-app-"));
const npmOptions = cwd => ({ cwd, env: { ...process.env, npm_config_cache: join(work, ".npm") } });
let server;
try {
  const { stdout } = await exec("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", work], npmOptions(root));
  const [{ filename }] = JSON.parse(stdout);
  const consumer = join(work, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true }));
  await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(work, filename)], npmOptions(consumer));
  const packageDir = join(consumer, "node_modules/@daz4126/helium");
  const { version } = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));

  server = await startServer(packageDir);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
    resetDb();
    const browser = await browserType.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      // The browser logs the deliberate 422 validation response as an error.
      if (message.type() === "error" && !/status of 422/.test(message.text())) errors.push(message.text());
    });
    try {
      await scenario(page, baseUrl);
      assert(errors.length === 0, `Browser errors:\n${errors.join("\n")}`);
      console.log(`${name}: application scenario passed against @daz4126/helium@${version}.`);
    } catch (error) {
      error.message = `${name}: ${error.message}${errors.length ? `\nBrowser errors:\n${errors.join("\n")}` : ""}`;
      throw error;
    } finally {
      await browser.close();
    }
  }
} finally {
  server?.close();
  await rm(work, { recursive: true, force: true });
}
