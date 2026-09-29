import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const examplesDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(examplesDir, "..");
const port = Number(process.env.PORT || 3456);
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const sendSSE = (response, event, data, id = null) => {
  if (response.destroyed) return false;
  if (id) response.write(`id: ${id}\n`);
  if (event) response.write(`event: ${event}\n`);
  response.write(`data: ${data}\n\n`);
  return true;
};

const beginSSE = response => response.writeHead(200, {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
});

const staticPath = pathname => {
  const path = resolve(root, decodeURIComponent(pathname).replace(/^\/+/, ""));
  if (path !== root && !path.startsWith(root + sep)) return null;
  return path;
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(302, { Location: "/examples/index.html" }).end();
      return;
    }
    if (url.pathname === "/demo") {
      response.writeHead(302, { Location: "/examples/sse-demo.html" }).end();
      return;
    }

    if (url.pathname === "/api/hello-world") {
      beginSSE(response);
      const message = "Hello from Helium SSE!";
      let output = "";
      for (const character of message) {
        output += character;
        if (!sendSSE(response, null, `<span>${output}<span style="opacity:0.5">|</span></span>`)) return;
        await delay(500);
      }
      sendSSE(response, null, `<span style="color: green; font-weight: bold;">${message}</span>`);
      response.end();
      return;
    }

    if (url.pathname === "/api/count") {
      beginSSE(response);
      for (let count = 1; count <= 10; count++) {
        if (!sendSSE(response, "#counter", `<span>${count}</span>`, `count-${count}`)) return;
        await delay(300);
      }
      sendSSE(response, "#counter", '<span style="color: green;">Done!</span>');
      response.end();
      return;
    }

    if (url.pathname === "/api/dashboard") {
      beginSSE(response);
      await delay(200);
      if (!sendSSE(response, "#header", "<h3>Dashboard Loaded</h3>")) return;
      await delay(300);
      if (!sendSSE(response, "#stats", "<div>Users: 1,234</div><div>Revenue: $5,678</div>")) return;
      await delay(200);
      sendSSE(response, "#header", '<h3>Dashboard Loaded <span style="color:green;">&#10003;</span></h3>');
      response.end();
      return;
    }

    if (url.pathname === "/api/time") {
      beginSSE(response);
      sendSSE(response, "currentTime", new Date().toLocaleTimeString());
      response.end();
      return;
    }

    if (url.pathname === "/api/events") {
      beginSSE(response);
      const events = ["User logged in", "File uploaded", "Comment added", "Order placed", "Payment received"];
      for (const [index, event] of events.entries()) {
        const time = new Date().toLocaleTimeString();
        if (!sendSSE(response, "#events", `<div class="event-item">[${time}] ${event}</div>`, `event-${index}`)) return;
        await delay(800);
      }
      sendSSE(response, "#events", '<div class="event-item" style="color: gray;">[Stream ended]</div>');
      response.end();
      return;
    }

    const path = staticPath(url.pathname);
    if (!path) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const contents = await readFile(path);
    response.writeHead(200, { "Content-Type": mimeTypes.get(extname(path)) || "application/octet-stream" });
    response.end(contents);
  } catch (error) {
    if (response.headersSent) response.destroy(error);
    else response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.message);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Helium examples: http://127.0.0.1:${port}/examples/index.html`);
  console.log(`SSE examples:    http://127.0.0.1:${port}/examples/sse-demo.html`);
  console.log("Press Ctrl+C to stop");
});
