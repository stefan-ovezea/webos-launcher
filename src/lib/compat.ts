// The MQTT client's SUBACK handling uses Array.at, added after the TV's Chrome 79.
// Syntax transpilation cannot supply missing built-ins.
export function installCompatibility (): void {
	const prototype = Array.prototype as unknown as {at?: (index: number) => unknown};
	if (!prototype.at) Object.defineProperty(Array.prototype, 'at', {
		configurable: true, writable: true,
		value: function <T> (this: T[], index: number): T | undefined {
			const offset = Math.trunc(Number(index) || 0);
			const position = offset < 0 ? this.length + offset : offset;
			return position < 0 || position >= this.length ? undefined : this[position];
		}
	});
}
installCompatibility();
