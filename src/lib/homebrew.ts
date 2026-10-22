import {LUNA} from '../config/constants';
import {lunaCall, type LunaResponse} from './luna';

interface ExecResponse extends LunaResponse { stdoutString?: string; }
let pending: Promise<void> = Promise.resolve();

/** The TV's Homebrew exec service can kill overlapping child processes. Share one
 * queue across app icons, wallpaper chunks and the MQTT relay startup command. */
export function homebrewExec (command: string, timeoutMs = 8000): Promise<string> {
	const result = pending.then(() => lunaCall<ExecResponse>(LUNA.homebrewExec, {command}, timeoutMs))
		.then((response) => response.stdoutString || '');
	pending = result.then(() => undefined, () => undefined);
	return result;
}
