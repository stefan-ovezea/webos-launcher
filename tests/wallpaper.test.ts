import {beforeEach, describe, expect, it, vi} from 'vitest';
import {loadWallpaper, WALLPAPER_COMMAND} from '../src/lib/wallpaper';
const mock = vi.hoisted(() => ({call: vi.fn()}));
vi.mock('../src/lib/luna', () => ({isWebOS: () => true, lunaCall: mock.call}));
beforeEach(() => { mock.call.mockReset(); });
describe('wallpaper transfer through Homebrew exec', () => {
	it('reads a 1 MiB image in bounded chunks instead of exceeding stdout maxBuffer', async () => {
		const bytes = Buffer.alloc(1024 * 1024, 42);
		mock.call.mockImplementation(async (_uri, {command}) => {
			if (command === WALLPAPER_COMMAND) return {stdoutString: `png ${bytes.length} ${'a'.repeat(32)}\n`};
			const index = Number(/skip=(\d+)/.exec(command)![1]);
			const chunk = bytes.subarray(index * 98304, (index + 1) * 98304).toString('base64');
			expect(chunk.length).toBeLessThanOrEqual(131072);
			return {stdoutString: chunk};
		});
		expect(await loadWallpaper()).toBe('data:image/png;base64,' + bytes.toString('base64'));
		expect(mock.call).toHaveBeenCalledTimes(13); // probe, 11 chunks, verify checksum
	});
	it('rejects a file replaced during transfer and cancels before reading chunks', async () => {
		let probes = 0;
		mock.call.mockImplementation(async (_uri, {command}) => ({stdoutString: command === WALLPAPER_COMMAND ? `png 3 ${String(++probes).repeat(32)}` : 'YWJj'}));
		await expect(loadWallpaper()).rejects.toThrow('changed while reading');
		mock.call.mockClear();
		await expect(loadWallpaper(() => true)).rejects.toThrow('cancelled');
		expect(mock.call).toHaveBeenCalledTimes(1);
	});
});
