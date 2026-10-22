import {expect, it} from 'vitest';
import {installCompatibility} from '../src/lib/compat';
it('supplies Array.at for Chrome 79 without replacing modern implementations', () => {
	const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'at')!;
	try {
		delete (Array.prototype as unknown as {at?: unknown}).at;
		installCompatibility();
		expect([1, 2, 3].at(-1)).toBe(3);
		expect([1, 2, 3].at(0)).toBe(1);
		expect([1, 2, 3].at(1.9)).toBe(2);
		expect([1, 2, 3].at(-4)).toBeUndefined();
		expect([].at(-1)).toBeUndefined();
		expect([1].at(Infinity)).toBeUndefined();
	} finally { Object.defineProperty(Array.prototype, 'at', descriptor); }
	installCompatibility();
	expect(Array.prototype.at).toBe(descriptor.value);
});
