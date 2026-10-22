import {beforeEach, describe, expect, it, vi} from 'vitest';
import {homebrewExec} from '../src/lib/homebrew';
const mock = vi.hoisted(() => ({call: vi.fn()}));
vi.mock('../src/lib/luna', () => ({lunaCall: mock.call}));
beforeEach(() => { mock.call.mockReset(); });
describe('shared Homebrew execution queue', () => {
	it('serializes commands across features to protect the TV exec service', async () => {
		let finish!: (result: object) => void;
		mock.call.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({stdoutString: 'second'});
		const first = homebrewExec('app list');
		const second = homebrewExec('wallpaper chunk');
		await Promise.resolve();
		expect(mock.call).toHaveBeenCalledTimes(1);
		finish({stdoutString: 'first'});
		expect(await first).toBe('first'); expect(await second).toBe('second');
		expect(mock.call).toHaveBeenCalledTimes(2);
	});
	it('continues after one feature fails', async () => {
		mock.call.mockRejectedValueOnce(new Error('missing image')).mockResolvedValueOnce({stdoutString: 'ready'});
		const failed = homebrewExec('wallpaper');
		const next = homebrewExec('MQTT relay');
		await expect(failed).rejects.toThrow('missing image');
		expect(await next).toBe('ready');
	});
});
