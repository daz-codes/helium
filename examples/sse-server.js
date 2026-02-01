import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;

// Helper to send SSE events
const sendSSE = (res, event, data, id = null) => {
  if (id) res.write(`id: ${id}\n`);
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
};

// Delay helper
const delay = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve static files
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'sse-simple.html')));
    return;
  }

  if (url.pathname === '/demo') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'sse-demo.html')));
    return;
  }

  if (url.pathname === '/helium.js' || url.pathname === '/../helium.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(path.join(__dirname, '..', 'helium.js')));
    return;
  }

  // SSE Endpoints
  if (url.pathname === '/api/hello-world') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Stream letters one at a time with 500ms delay
    // Just send data - target comes from @target attribute on the button
    const message = 'Hello from Helium SSE!';
    let output = '';
    for (const char of message) {
      output += char;
      sendSSE(res, null, `<span>${output}<span style="opacity:0.5">|</span></span>`);
      await delay(500);
    }
    // Final message without cursor
    sendSSE(res, null, `<span style="color: green; font-weight: bold;">${message}</span>`);
    res.end();
    return;
  }

  if (url.pathname === '/api/count') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    for (let i = 1; i <= 10; i++) {
      sendSSE(res, '#counter', `<span>${i}</span>`, `count-${i}`);
      await delay(300);
    }
    sendSSE(res, '#counter', `<span style="color: green;">Done!</span>`);
    res.end();
    return;
  }

  if (url.pathname === '/api/dashboard') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send to different targets using event: field
    await delay(200);
    sendSSE(res, '#header', '<h3>Dashboard Loaded</h3>');
    await delay(300);
    sendSSE(res, '#stats', `<div>Users: 1,234</div><div>Revenue: $5,678</div>`);
    await delay(200);
    sendSSE(res, '#header', '<h3>Dashboard Loaded <span style="color:green;">&#10003;</span></h3>');
    res.end();
    return;
  }

  if (url.pathname === '/api/time') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // This updates state.currentTime (not a DOM element)
    sendSSE(res, 'currentTime', new Date().toLocaleTimeString());
    res.end();
    return;
  }

  if (url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const events = ['User logged in', 'File uploaded', 'Comment added', 'Order placed', 'Payment received'];

    for (let i = 0; i < events.length; i++) {
      const time = new Date().toLocaleTimeString();
      sendSSE(res, '#events', `<div class="event-item">[${time}] ${events[i]}</div>`, `event-${i}`);
      await delay(800);
    }
    sendSSE(res, '#events', `<div class="event-item" style="color: gray;">[Stream ended]</div>`);
    res.end();
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`SSE Demo server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
