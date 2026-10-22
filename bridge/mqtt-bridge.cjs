// A localhost-only WebSocket → TCP relay for rooted TVs (Node 8 compatible).
// It carries MQTT bytes; credentials stay in the browser's MQTT CONNECT packet.
// No startup hooks or Luna services are installed. Exit after 90 seconds without clients.
'use strict';
const http = require('http');
const net = require('net');
const URL = require('url').URL;
const WS = require('ws');
const PORT = 18783;
const IDLE_MS = 90000;

function target(request) {
  let parsed;
  try { parsed = new URL(request.url, 'http://127.0.0.1'); } catch (error) { return null; }
  const host = parsed.searchParams.get('host');
  const port = Number(parsed.searchParams.get('port'));
  if (parsed.pathname !== '/mqtt' || typeof host !== 'string' || host.length > 253 ||
      !(net.isIP(host) || /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) ||
      !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {host: host, port: port};
}

function start(port) {
  let idle;
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const origin = req.headers.origin === 'file://' ? 'file://' : 'null';
      res.writeHead(200, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': origin});
      res.end('webos-launcher-mqtt-bridge-v1');
    } else { res.writeHead(404); res.end(); }
  });
  const wss = new WS.Server({
    noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false,
    handleProtocols: function(protocols) { return (protocols.has ? protocols.has('mqtt') : protocols.includes('mqtt')) ? 'mqtt' : false; }
  });
  function scheduleExit() {
    clearTimeout(idle);
    if (!wss.clients.size) idle = setTimeout(function() { wss.close(); server.close(); }, IDLE_MS);
  }
  server.on('upgrade', function(req, socket, head) {
    // webOS 6 sends file://; standard browsers use null for local-file apps.
    if (!['null', 'file://'].includes(req.headers.origin) || !target(req)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, function(ws) { wss.emit('connection', ws, req); });
  });
  wss.on('connection', function(ws, request) {
    clearTimeout(idle);
    const address = target(request);
    const tcp = net.connect(address.port, address.host);
    const stream = WS.createWebSocketStream(ws, {encoding: null});
    const timeout = setTimeout(function() { tcp.destroy(); ws.terminate(); }, 10000);
    tcp.once('connect', function() { clearTimeout(timeout); });
    tcp.pipe(stream).pipe(tcp);
    const close = function() { clearTimeout(timeout); tcp.destroy(); stream.destroy(); if (ws.readyState !== WS.CLOSED) ws.terminate(); };
    tcp.on('error', close); stream.on('error', close); ws.on('error', close);
    tcp.on('close', close);
    ws.on('close', function() { close(); scheduleExit(); });
  });
  server.on('error', function(error) {
    // Another launcher instance has already started the shared relay.
    if (error.code === 'EADDRINUSE') process.exitCode = 0;
    else { console.error('MQTT relay could not start:', error.code); process.exitCode = 1; }
  });
  server.on('close', function() { clearTimeout(idle); });
  server.listen(port === undefined ? PORT : port, '127.0.0.1', scheduleExit);
  return {server: server, wss: wss};
}
if (require.main === module) start();
module.exports = {target: target, start: start};
