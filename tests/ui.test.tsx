import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'preact';
import {act} from 'preact/test-utils';
import {App} from '../src/app';
import {MqttSettings} from '../src/screens/MqttSettings';
import {defaultMqttConfig} from '../src/lib/mqttConfig';
import {STORAGE_KEY} from '../src/config/constants';

let root: HTMLDivElement;
beforeEach(() => {
	localStorage.clear();
	root = document.createElement('div'); document.body.append(root);
	Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { act(() => render(null, root)); root.remove(); });
const clickText = async (selector: string, text: string) => {
	const el = Array.from(root.querySelectorAll(selector)).find((item) => item.textContent === text);
	expect(el, text).toBeTruthy();
	await act(async () => { el!.dispatchEvent(new MouseEvent('click', {bubbles: true})); });
};
const key = async (code: number) => {
	await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', {keyCode: code, bubbles: true, cancelable: true})); });
	await act(async () => { window.dispatchEvent(new KeyboardEvent('keyup', {keyCode: code, bubbles: true, cancelable: true})); });
};
const input = async (index: number, value: string) => {
	await act(async () => {
		const el = root.querySelectorAll('input')[index];
		el.value = value; el.dispatchEvent(new Event('input', {bubbles: true}));
	});
};
describe('feature toggles and home layout', () => {
	it('reveals configuration and a fourth section only when enabled, preserving settings focus', async () => {
		await act(async () => render(<App />, root));
		expect(root.querySelectorAll('.home .row')).toHaveLength(3);
		await clickText('.tile__label', 'Settings');
		const optionsTab = Array.from(root.querySelectorAll('.tab')).find((el) => el.textContent === 'Options')!;
		await act(async () => { optionsTab.dispatchEvent(new MouseEvent('mouseover', {bubbles: true})); });
		// Remote navigation also works without pointer hover.
		await key(39); await key(39);
		expect(root.querySelectorAll('.option')).toHaveLength(3);
		expect(root.textContent).not.toContain('Home Assistant configuration');
		await clickText('.option__label', 'Home Assistant');
		expect(root.querySelectorAll('.home .row')).toHaveLength(4);
		expect(root.querySelector('.home--with-ha')).toBeTruthy();
		expect(root.querySelectorAll('.option')).toHaveLength(4);
		await clickText('.option__label', 'Home Assistant configuration');
		expect(root.querySelector('.mqtt-settings')).toBeTruthy();
		await key(27);
		expect(root.querySelector('.mqtt-settings')).toBeNull();
		expect(root.querySelector('.tab--active')?.textContent).toBe('Options');
		await clickText('.option__label', 'Home Assistant');
		expect(root.querySelectorAll('.home .row')).toHaveLength(3);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mqtt.enabled).toBe(false);
	});
});
describe('MQTT card configuration', () => {
	it('adds a sensor and a button with separate state and command topics', async () => {
		const save = vi.fn();
		await act(async () => render(<MqttSettings config={{...defaultMqttConfig(), enabled: true}} status="Not configured" onSave={save} onClose={vi.fn()} />, root));
		await input(0, 'ws://broker:9001');
		await clickText('button span', '+ Add sensor');
		await input(0, 'Room temperature'); await input(1, 'room/state'); await input(2, 'temperature'); await input(3, '°C');
		await clickText('button span', 'Keep card');
		await clickText('button span', '+ Add button');
		await input(0, 'Movie'); await input(1, 'home/scene/set');
		await act(async () => { const el = root.querySelector('textarea')!; el.value = 'movie'; el.dispatchEvent(new Event('input', {bubbles: true})); });
		await clickText('button span', 'Keep card');
		await clickText('button span', 'Save configuration');
		expect(save).toHaveBeenCalledWith(expect.objectContaining({url: 'ws://broker:9001', cards: [
			expect.objectContaining({type: 'sensor', label: 'Room temperature', topic: 'room/state', path: 'temperature', unit: '°C'}),
			expect.objectContaining({type: 'button', label: 'Movie', topic: 'home/scene/set', payload: 'movie'})
		]}));
	});
	it('uses Back to leave editing before canceling and keeps invalid settings unsaved', async () => {
		const save = vi.fn(), close = vi.fn();
		await act(async () => render(<MqttSettings config={{...defaultMqttConfig(), enabled: true}} status="Not configured" onSave={save} onClose={close} />, root));
		await key(13);
		expect(root.querySelector('input')!.readOnly).toBe(false);
		await key(27); expect(close).not.toHaveBeenCalled();
		expect(root.querySelector('input')!.readOnly).toBe(true);
		await clickText('button span', 'Save configuration');
		expect(save).not.toHaveBeenCalled();
		expect(root.querySelector('[role="alert"]')?.textContent).toContain('broker URL');
		await key(27); expect(close).toHaveBeenCalledTimes(1);
	});
});
