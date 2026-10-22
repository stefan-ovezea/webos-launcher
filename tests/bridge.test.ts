// @vitest-environment node
import {afterEach, describe, expect, it} from 'vitest';
import {createRequire} from 'node:module';
import net from 'node:net';
import {once} from 'node:events';
const require = createRequire(import.meta.url);
const bridge = require('../bridge/mqtt-bridge.cjs');
const WS = require('ws');
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach((close) => close()); });
describe('TV localhost MQTT relay', () => {
	it('only accepts the fixed MQTT path and valid network targets', () => {
		expect(bridge.target({url:'/mqtt?host=192.0.2.20&port=1883'})).toEqual({host:'192.0.2.20',port:1883});
		for (const url of ['/other?host=broker&port=1883','/mqtt?host=broker;id&port=1883','/mqtt?host=broker&port=0','/mqtt?host=broker&port=65536','/mqtt?host=broker&port=abc']) expect(bridge.target({url})).toBeNull();
	});
	it('relays binary bytes to TCP on loopback and rejects web page origins', async () => {
		const tcp = net.createServer((socket) => socket.pipe(socket));
		tcp.listen(0, '127.0.0.1'); await once(tcp, 'listening'); cleanup.push(() => tcp.close());
		const {server,wss} = bridge.start(0);
		await once(server, 'listening'); cleanup.push(() => { wss.clients.forEach((client:any)=>client.terminate()); wss.close(); server.close(); });
		const relayPort = (server.address() as net.AddressInfo).port;
		const tcpPort = (tcp.address() as net.AddressInfo).port;
		const url = `ws://127.0.0.1:${relayPort}/mqtt?host=127.0.0.1&port=${tcpPort}`;
		expect(server.address().address).toBe('127.0.0.1');
		const ws = new WS(url, 'mqtt', {origin: 'null'}); cleanup.push(() => ws.terminate());
		await once(ws, 'open');
		const response = once(ws, 'message'); ws.send(Buffer.from([0x10, 0x02, 0x00, 0xff]));
		expect((await response)[0]).toEqual(Buffer.from([0x10, 0x02, 0x00, 0xff]));
		const denied = new WS(url, 'mqtt', {origin: 'https://example.com'}); cleanup.push(() => denied.terminate());
		expect(await new Promise<boolean>((resolve) => { denied.on('open',()=>resolve(false)); denied.on('error',()=>resolve(true)); })).toBe(true);
	});
});
