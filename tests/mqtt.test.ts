import {beforeEach, describe, expect, it, vi} from 'vitest';
import {HomeMqtt} from '../src/lib/mqtt';
import {defaultMqttConfig, type MqttConfig} from '../src/lib/mqttConfig';
const mock = vi.hoisted(() => ({connect: vi.fn()}));
vi.mock('mqtt', () => ({default: {connect: mock.connect}}));

async function setup (overrides: Partial<MqttConfig> = {}) {
	const events: Record<string, (...args: any[]) => void> = {};
	const client = {
		connected: true,
		on: vi.fn((event, handler) => { events[event] = handler; }),
		subscribe: vi.fn((_topics, _options, callback) => callback(null, [{qos: 0}])),
		publish: vi.fn((_topic, _payload, _options, callback) => callback()),
		end: vi.fn()
	};
	mock.connect.mockReturnValue(client);
	const handlers = {status: vi.fn(), value: vi.fn(), reset: vi.fn()};
	const config: MqttConfig = {...defaultMqttConfig(), enabled: true, url: 'ws://broker:9001', cards: [
		{id: 'temp', type: 'sensor', label: 'Temperature', topic: 'room/state', path: 'temperature', unit: '°C'},
		{id: 'humidity', type: 'sensor', label: 'Humidity', topic: 'room/state', path: 'humidity', unit: '%'},
		{id: 'movie', type: 'button', label: 'Movie', topic: 'home/actions', payload: 'movie'}
	], ...overrides};
	const connection = new HomeMqtt(config, handlers);
	await connection.start();
	return {connection, handlers, client, events};
}
beforeEach(() => { mock.connect.mockReset(); });
describe('Home Assistant display connection', () => {
	it('does not connect until enabled and configured', async () => {
		const {handlers} = await setup({enabled: false});
		expect(mock.connect).not.toHaveBeenCalled();
		expect(handlers.status).toHaveBeenLastCalledWith('Disabled');
		expect((await setup({url: ''})).handlers.status).toHaveBeenLastCalledWith('Not configured');
		expect(mock.connect).not.toHaveBeenCalled();
	});
	it('subscribes only to unique sensor topics and never publishes discovery or TV controls', async () => {
		const {events, client, handlers} = await setup();
		events.connect();
		expect(client.subscribe).toHaveBeenCalledWith(['room/state'], {qos: 0}, expect.any(Function));
		expect(client.publish).not.toHaveBeenCalled();
		expect(handlers.status).toHaveBeenLastCalledWith('Connected');
		events.message('room/state', {length: 40, toString: () => '{"temperature":22.5,"humidity":48}'});
		expect(handlers.value).toHaveBeenCalledWith('temp', '22.5');
		expect(handlers.value).toHaveBeenCalledWith('humidity', '48');
	});
	it('ignores unconfigured topics, invalid JSON and oversized payloads', async () => {
		const {events, handlers} = await setup(); events.connect();
		events.message('launcher/launch/set', {length: 1, toString: () => 'netflix'});
		events.message('room/state', {length: 65537, toString: () => '{}'});
		expect(handlers.value).not.toHaveBeenCalled();
		events.message('room/state', {length: 1, toString: () => '?'});
		expect(handlers.value).toHaveBeenCalledWith('temp', null);
	});
	it('publishes a configured button once without retaining or offline queueing', async () => {
		const {connection, events, client} = await setup(); events.connect();
		await connection.press('movie');
		expect(client.publish).toHaveBeenCalledExactlyOnceWith('home/actions', 'movie', {qos: 0, retain: false}, expect.any(Function));
		expect(mock.connect.mock.calls[0][1].queueQoSZero).toBe(false);
		client.connected = false; events.close();
		await expect(connection.press('movie')).rejects.toThrow('not connected');
		await expect(connection.press('temp')).rejects.toThrow('Unknown');
		expect(client.publish).toHaveBeenCalledTimes(1);
	});
	it('resubscribes and resets readings after reconnect; ignores callbacks after stop', async () => {
		const {connection, events, client, handlers} = await setup();
		events.connect(); events.close(); events.reconnect(); events.connect();
		expect(client.subscribe).toHaveBeenCalledTimes(2);
		expect(handlers.reset).toHaveBeenCalledTimes(2);
		connection.stop();
		expect(client.end).toHaveBeenCalledWith(true);
		handlers.value.mockClear(); handlers.status.mockClear();
		events.message('room/state', {length: 5, toString: () => '{}'}); events.connect(); events.close();
		expect(handlers.value).not.toHaveBeenCalled(); expect(handlers.status).not.toHaveBeenCalled();
	});
	it('reports broker ACL subscription failures', async () => {
		const {events, client, handlers} = await setup();
		client.subscribe.mockImplementation((_t, _o, callback) => callback(null, [{qos: 128}]));
		events.connect();
		expect(handlers.status).toHaveBeenLastCalledWith('Connection error');
	});
});
