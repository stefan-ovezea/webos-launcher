import {isWebOS} from './luna';
import {homebrewExec} from './homebrew';

export const WALLPAPER_DIRECTORY = '/media/internal/webos-launcher';
const MAX_BYTES = 4 * 1024 * 1024;
// Homebrew exec has a ~200 KiB stdout limit. Each chunk encodes to 128 KiB;
// its byte count is divisible by three so base64 chunks concatenate correctly.
const CHUNK_BYTES = 3 * 32768;

// Only fixed filenames reach the root shell. Probe size and checksum to detect replacement
// while reading; skip images outside the supported size range before transferring data.
export const WALLPAPER_COMMAND = `for ext in jpg jpeg png webp; do f="${WALLPAPER_DIRECTORY}/wallpaper.$ext"; if [ -f "$f" ]; then size=$(wc -c < "$f"); if [ "$size" -gt 0 ] && [ "$size" -le ${MAX_BYTES} ]; then checksum=$(md5sum "$f"); set -- $checksum; printf '%s %s %s\\n' "$ext" "$size" "$1"; exit; fi; fi; done`;

export function parseWallpaper (output: string): string {
	const newline = output.indexOf('\n');
	const ext = output.slice(0, newline).trim();
	const encoded = output.slice(newline + 1).replace(/\s/g, '');
	if (newline < 0 || !/^(jpg|jpeg|png|webp)$/.test(ext) || !encoded ||
		encoded.length > Math.ceil(MAX_BYTES / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
		throw new Error('Add wallpaper.jpg, .jpeg, .png or .webp (up to 4 MB) to ' + WALLPAPER_DIRECTORY);
	}
	return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${encoded}`;
}

async function exec (command: string): Promise<string> {
	try {
		return await homebrewExec(command, 15000);
	} catch { throw new Error('Could not read the wallpaper through the Homebrew Channel. Try reopening the launcher.'); }
}

export async function loadWallpaper (cancelled: () => boolean = () => false): Promise<string> {
	if (!isWebOS()) throw new Error('Wallpaper files require a TV with the Homebrew Channel.');
	const metadata = (await exec(WALLPAPER_COMMAND)).trim();
	const match = /^(jpg|jpeg|png|webp) ([1-9][0-9]*) ([a-fA-F0-9]{32})$/.exec(metadata);
	if (!match || Number(match[2]) > MAX_BYTES) throw new Error('Add a wallpaper image (up to 4 MB) to ' + WALLPAPER_DIRECTORY);
	const size = Number(match[2]);
	const count = Math.ceil(size / CHUNK_BYTES);
	const chunks: string[] = new Array(count);
	let next = 0;
	let failed = false;
	const worker = async () => {
		try {
			while (next < count && !failed) {
				if (cancelled()) throw new Error('Wallpaper read cancelled');
				const index = next++;
				// Extension comes from the allow-list above; index is an internal integer.
				const chunk = (await exec(`dd if=${WALLPAPER_DIRECTORY}/wallpaper.${match[1]} bs=${CHUNK_BYTES} skip=${index} count=1 2>/dev/null | base64`)).replace(/\s/g, '');
				const expected = Math.ceil(Math.min(CHUNK_BYTES, size - index * CHUNK_BYTES) / 3) * 4;
				if (chunk.length !== expected || !/^[A-Za-z0-9+/]+={0,2}$/.test(chunk)) throw new Error('Could not read the wallpaper. Try reopening the launcher.');
				chunks[index] = chunk;
			}
		} catch (error) { failed = true; throw error; }
	};
	// The TV's exec service can terminate simultaneous readers; serialize the chunks.
	await worker();
	if (cancelled()) throw new Error('Wallpaper read cancelled');
	if ((await exec(WALLPAPER_COMMAND)).trim() !== metadata) throw new Error('Wallpaper changed while reading. Reopen the launcher to try again.');
	return parseWallpaper(match[1] + '\n' + chunks.join(''));
}
