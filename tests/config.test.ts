import {beforeEach, describe, expect, it} from 'vitest';
import {loadConfig, saveConfig} from '../src/lib/storage';
import {defaultMqttConfig, normalizeMqttConfig, parseBrokerUrl, sensorValue, validateCard, validateMqttConfig} from '../src/lib/mqttConfig';
import {STORAGE_KEY} from '../src/config/constants';
import {parseWallpaper, WALLPAPER_COMMAND} from '../src/lib/wallpaper';

beforeEach(() => localStorage.clear());
describe('saved settings', () => {
	it('preserves an existing TV configuration and defaults both features off', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({appIds: ['netflix'], sourceIds: [], useHomebrew: true}));
		expect(loadConfig()).toMatchObject({appIds: ['netflix'], sourceIds: [], useHomebrew: true, wallpaper: false, mqtt: {enabled: false, cards: []}});
	});
	it('round trips optional features without sharing mutable default cards', () => {
		const config = loadConfig();
		config.wallpaper = true;
		config.mqtt = {...defaultMqttConfig(), enabled: true, url: 'ws://broker:9001', cards: [{id: 'temp', type: 'sensor', label: 'Room', topic: 'room/state', path: 'temperature', unit: '°C'}]};
		saveConfig(config);
		expect(loadConfig()).toEqual(config);
		localStorage.clear();
		expect(loadConfig().mqtt.cards).toEqual([]);
	});
	it.each(['null', '{bad', '[]'])('recovers from malformed saved settings: %s', (raw) => {
		localStorage.setItem(STORAGE_KEY, raw);
		expect(loadConfig().mqtt.enabled).toBe(false);
	});
	it('discards malformed, wildcard and duplicate cards', () => {
		const good = {id: 'button', type: 'button', label: 'Scene', topic: 'home/scene', payload: 'movie'};
		expect(normalizeMqttConfig({cards: [null, {}, good, good, {...good, id: 'wildcard', topic: 'home/#'}]}).cards).toEqual([good]);
	});
});

describe('MQTT data validation', () => {
	it('accepts TCP or WebSocket URLs with credentials in separate fields', () => {
		const config = {...defaultMqttConfig(), enabled: true};
		expect(validateMqttConfig({...config, url: 'mqtt://broker:1883'})).toBeNull();
		expect(validateMqttConfig({...config, url: 'mqtt://broker:1883/path'})).toBeTruthy();
		expect(validateMqttConfig({...config, url: 'ws://user:pass@broker:9001'})).toBeTruthy();
		expect(validateMqttConfig({...config, url: 'wss://broker/mqtt'})).toBeNull();
		expect(validateCard({id: 'a', type: 'button', label: 'A', topic: 'home/+/set', payload: 'ON'})).toBeTruthy();
	});
	it('parses MQTT with an HTTP authority for Chrome 79, including explicit port 80', () => {
		expect(parseBrokerUrl('mqtt://192.0.2.20:1883').url.hostname).toBe('192.0.2.20');
		expect(parseBrokerUrl('mqtt://broker:80').port).toBe(80);
		expect(parseBrokerUrl('mqtt://broker').port).toBe(1883);
		expect(() => parseBrokerUrl('mqtt://broker:0')).toThrow();
	});
	it('reads text, nested JSON, zero and false without evaluating templates', () => {
		expect(sensorValue(' 23.4 ', '')).toBe('23.4');
		expect(sensorValue('{"room":{"temperature":0}}', 'room.temperature')).toBe('0');
		expect(sensorValue('{"on":false}', 'on')).toBe('false');
		expect(sensorValue('{"room":{}}', 'room.value')).toBeNull();
		expect(sensorValue('{}', '__proto__')).toBeNull();
		expect(sensorValue('invalid JSON', 'value')).toBeNull();
		expect(sensorValue('null', 'value')).toBeNull();
		expect(sensorValue('', '')).toBeNull();
	});
});

describe('wallpaper files', () => {
	it('accepts BusyBox base64 output without requiring GNU flags', () => {
		expect(parseWallpaper('jpg\nYWJj\nZA==\n')).toBe('data:image/jpeg;base64,YWJjZA==');
		expect(WALLPAPER_COMMAND).toContain('/media/internal/webos-launcher/wallpaper.$ext');
		expect(WALLPAPER_COMMAND).toContain('4194304');
	});
	it.each(['', 'svg\nYWJj', 'png\n', 'png\n$(touch /tmp/test)', 'png\n' + 'A'.repeat(5592409)])('rejects missing, invalid or oversized output', (output) => {
		expect(() => parseWallpaper(output)).toThrow();
	});
});
