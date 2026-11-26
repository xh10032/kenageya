#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(0, '127.0.0.1', () => {
  console.log(`Sketch of Sakura -> http://127.0.0.1:${server.address().port}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
