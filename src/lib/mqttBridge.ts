import {APP_ID} from '../config/constants';
import {isWebOS} from './luna';
import {parseBrokerUrl} from './mqttConfig';
import {homebrewExec} from './homebrew';

const LOCAL_BRIDGE = 'http://127.0.0.1:18783';
const BRIDGE_ID = 'webos-launcher-mqtt-bridge-v1';
// Fixed command: broker addresses, topics, payloads and credentials never reach the shell.
export const START_MQTT_BRIDGE = `/usr/bin/node /media/developer/apps/usr/palm/applications/${APP_ID}/bridge/mqtt-bridge.cjs </dev/null >/tmp/webos-launcher-mqtt-bridge.log 2>&1 &`;

async function healthy (): Promise<boolean> {
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), 800);
	try {
		const response = await fetch(LOCAL_BRIDGE + '/health', {signal: controller.signal});
		return response.ok && await response.text() === BRIDGE_ID;
	} catch { return false; }
	finally { window.clearTimeout(timer); }
}

export async function mqttTransportUrl (url: string): Promise<string> {
	const parsed = parseBrokerUrl(url);
	if (!parsed.tcp) return url;
	if (!isWebOS()) throw new Error('Plain MQTT requires a rooted TV with the Homebrew Channel. Use ws:// or wss:// for browser previews.');
	if (!await healthy()) {
		await homebrewExec(START_MQTT_BRIDGE, 8000);
		let ready = false;
		for (let attempt = 0; attempt < 12; attempt++) {
			if (await healthy()) { ready = true; break; }
			await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
		}
		if (!ready) throw new Error('Could not start the local MQTT relay. Check that the Homebrew Channel is installed.');
	}
	return `ws://127.0.0.1:18783/mqtt?host=${encodeURIComponent(parsed.url.hostname.replace(/^\[|\]$/g, ''))}&port=${parsed.port}`;
}
