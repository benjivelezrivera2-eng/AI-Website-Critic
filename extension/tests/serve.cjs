// Local test-only server. Explicit allowlist: never serves backend files or .env.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const allowed = new Set(['/tests/browser-harness.html','/tests/harness-setup.js','/tests/browser-harness.js','/tests/panel-mock.js','/content.js','/grading.js','/reporting.js','/sidepanel.js','/sidepanel.css']);
http.createServer((req,res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname;
  if (name === '/tests/panel.html') {
    const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.html'), 'utf8').replaceAll('src="', 'src="/').replace('href="sidepanel.css"','href="/sidepanel.css"').replace('<script src="/sidepanel.js">','<script src="/tests/panel-mock.js"></script><script src="/sidepanel.js">');
    return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  }
  if (!allowed.has(name)) return res.writeHead(404).end();
  res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/javascript; charset=utf-8');
  res.end(fs.readFileSync(path.join(__dirname, '..', name)));
}).listen(8788,'127.0.0.1');
