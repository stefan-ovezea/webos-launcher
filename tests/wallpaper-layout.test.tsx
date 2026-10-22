import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'preact';
import {act} from 'preact/test-utils';
import {Home, type HomeRow} from '../src/screens/Home';
import {Clock} from '../src/components/Clock';

vi.mock('../src/components/Wallpaper', () => ({Wallpaper: () => null}));
let root: HTMLDivElement;
beforeEach(() => { root = document.createElement('div'); document.body.append(root); });
afterEach(() => { act(() => render(null, root)); root.remove(); });
const rows: HomeRow[] = [
	{id: 'apps', label: 'Apps', items: [{key: 'youtube', label: 'YouTube', imageUrl: 'youtube.png'}, {key: 'plex', label: 'Plex', imageUrl: 'plex.png'}]},
	{id: 'sources', label: 'Sources', items: [{key: 'tv', label: 'Live TV', glyphImageUrl: 'tv.png'}, {key: 'hdmi', label: 'Game console', glyphImageUrl: 'hdmi.png'}]},
	{id: 'misc', label: 'More', items: [{key: 'home', label: 'LG Home', glyph: 'house'}, {key: 'settings', label: 'Settings', glyph: 'gear'}]},
	{id: 'homeassistant', label: 'Home Assistant', kind: 'homeassistant', items: [{key: 'temp', label: 'Living'}, {key: 'bath', label: 'Bathroom'}]}
];
const assistant = {
	cards: [
		{id: 'temp', type: 'sensor' as const, label: 'Living', topic: 'room/state', path: 'temperature', unit: '°C'},
		{id: 'bath', type: 'sensor' as const, label: 'Bathroom', topic: 'bath/state', path: '', unit: '°C'}
	], values: {temp: '21.2'}, status: 'Connected' as const, busy: null
};
const key = async (keyCode: number) => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', {keyCode, cancelable: true})); }); };
const show = async (wallpaper: boolean, onActivate = vi.fn(), withAssistant = true) => {
	await act(async () => render(<Home rows={withAssistant ? rows : rows.slice(0, 3)} wallpaper={wallpaper} active onActivate={onActivate} onWallpaperError={vi.fn()} homeAssistant={withAssistant ? assistant : undefined} />, root));
};

describe('wallpaper-only home layout', () => {
	it('shows icon-only utilities and apps, source pills, quiet sensors and a compact clock', async () => {
		await show(true);
		expect(root.querySelector('.home--wallpaper')).toBeTruthy();
		expect(root.querySelector('.header')).toBeNull();
		expect(root.querySelectorAll('.row__label, .tile__label, .ha-row__status, .ha-card__hint')).toHaveLength(0);
		expect(Array.from(root.querySelectorAll('.wallpaper-utility')).map(el=>el.getAttribute('aria-label'))).toEqual(['LG Home', 'Settings']);
		expect(root.querySelector('.wallpaper-utility svg path')).toBeTruthy();
		expect(root.querySelectorAll('.clock--compact')).toHaveLength(1);
		expect(root.querySelectorAll('.clock__line')).toHaveLength(0);
		expect(root.querySelector('.wallpaper-assistant')!.textContent).toContain('21.2 °C');
		expect(root.querySelector('.wallpaper-assistant')!.textContent).not.toMatch(/Sensor|Waiting|Connected/);
		expect(Array.from(root.querySelectorAll('.source-badge')).map(el=>el.textContent)).toEqual(['Live TV', 'Game console']);
		expect(root.querySelector('.source-badge img')!.getAttribute('src')).toBe('tv.png');
		expect(Array.from(root.querySelectorAll('.wallpaper-apps .tile')).map(el=>el.getAttribute('aria-label'))).toEqual(['YouTube', 'Plex']);
		expect(root.querySelectorAll('.wallpaper-apps .tile__image')).toHaveLength(2);
	});
	it('moves up from apps through sources, sensors and utilities, preserving each selection', async () => {
		const activate = vi.fn(); await show(true, activate);
		await key(38); await key(39); // sources: Game console
		expect(root.querySelector('.source-badge--focused')!.textContent).toBe('Game console');
		await key(38); expect(root.querySelector('.ha-card--focused')!.textContent).toContain('Living');
		await key(38); await key(39); await key(13);
		expect(activate).toHaveBeenLastCalledWith('misc', expect.objectContaining({key: 'settings'}));
		await key(40); await key(40); await key(13);
		expect(activate).toHaveBeenLastCalledWith('sources', expect.objectContaining({key: 'hdmi'}));
		await key(40); await key(39); await key(13);
		expect(activate).toHaveBeenLastCalledWith('apps', expect.objectContaining({key: 'plex'}));
	});
	it('skips Home Assistant when disabled and keeps normal mode labels, status and navigation', async () => {
		const activate = vi.fn(); await show(true, activate, false);
		await key(38); await key(38);
		expect(root.querySelector('.wallpaper-utility--focused')!.getAttribute('aria-label')).toBe('LG Home');
		expect(root.querySelector('.wallpaper-assistant')).toBeNull();
		await show(false, activate);
		expect(root.querySelector('.home--wallpaper')).toBeNull();
		expect(root.querySelector('.header')).toBeTruthy();
		expect(Array.from(root.querySelectorAll('.row__label')).map(el=>el.textContent)).toEqual(['Apps', 'Sources', 'More', 'Home Assistant']);
		expect(root.querySelector('.ha-row__status')!.textContent).toBe('Connected');
		expect(root.textContent).toContain('Waiting for a reading');
		expect(root.querySelectorAll('.tile__label')).toHaveLength(6);
		await key(13); expect(activate).toHaveBeenLastCalledWith('misc', expect.objectContaining({key: 'home'}));
		await key(40); expect(root.querySelector('.ha-card--focused')).toBeTruthy();
	});
	it('keeps selected apps when switching between layouts', async () => {
		await show(false); await key(39);
		await show(true);
		expect(root.querySelector('.wallpaper-apps .tile--focused')!.getAttribute('aria-label')).toBe('Plex');
		await show(false);
		expect(root.querySelector('.tile--focused .tile__label')!.textContent).toBe('Plex');
	});
	it('keeps the TV 12/24-hour format in the compact clock', () => {
		const now = new Date(2026, 9, 22, 21, 7);
		act(() => render(<Clock now={now} format="12h" compact />, root));
		expect(root.textContent).toBe('Thursday, 22 October·9:07 PM');
		act(() => render(<Clock now={now} format="24h" compact />, root));
		expect(root.textContent).toBe('Thursday, 22 October·21:07');
	});
});
