export interface SensorCard {
	id: string;
	type: 'sensor';
	label: string;
	topic: string;
	/** Optional dot-separated field in a JSON payload, e.g. temperature or room.value. */
	path: string;
	unit: string;
}
export interface ButtonCard {
	id: string;
	type: 'button';
	label: string;
	topic: string;
	payload: string;
}
export type HomeCard = SensorCard | ButtonCard;
export interface MqttConfig {
	enabled: boolean;
	url: string;
	username: string;
	password: string;
	cards: HomeCard[];
}

/** Chrome 79 treats mqtt: as an opaque URL, so parse its authority as HTTP. */
export function parseBrokerUrl (value: string): {url: URL; tcp: boolean; port: number} {
	const tcp = value.indexOf('mqtt://') === 0;
	const url = new URL(tcp ? value.replace(/^mqtt:/, 'http:') : value);
	if ((!tcp && !/^wss?:$/.test(url.protocol)) || !url.hostname || url.username || url.password || url.hash) throw new Error('Invalid broker URL');
	if (tcp && ((url.pathname && url.pathname !== '/') || url.search)) throw new Error('Invalid MQTT address');
	const explicitPort = tcp && /:(\d+)\/?$/.exec(value);
	const port = tcp ? (explicitPort ? Number(explicitPort[1]) : 1883) : Number(url.port || (url.protocol === 'wss:' ? 443 : 80));
	if (port < 1 || port > 65535) throw new Error('Invalid MQTT port');
	return {url, tcp, port};
}

export function defaultMqttConfig (): MqttConfig {
	return {enabled: false, url: '', username: '', password: '', cards: []};
}

export function newCard (type: HomeCard['type']): HomeCard {
	const shared = {id: 'card_' + Math.random().toString(36).slice(2, 12), type, label: '', topic: ''};
	return type === 'sensor' ? {...shared, type, path: '', unit: ''} : {...shared, type, payload: 'PRESS'};
}

function validTopic (topic: string): boolean {
	return topic.length > 0 && topic.length <= 256 && !/[+#\u0000-\u001f\u007f]/.test(topic);
}

export function validateCard (card: HomeCard): string | null {
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(card.id)) return 'Invalid card ID.';
	if (!card.label.trim() || card.label.length > 60) return 'Enter a label of up to 60 characters.';
	if (!validTopic(card.topic)) return 'Enter an MQTT topic without wildcards or control characters (up to 256 characters).';
	if (card.type === 'sensor') {
		if (card.path && !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(card.path)) return 'JSON field: use a name or dot-separated path, such as temperature or room.value.';
		if (card.path.length > 128 || card.unit.length > 16) return 'Keep the JSON field under 129 characters and unit under 17 characters.';
	} else if (!card.payload || card.payload.length > 1024) return 'Enter a button payload of up to 1024 characters.';
	return null;
}

export function normalizeMqttConfig (value: unknown): MqttConfig {
	const defaults = defaultMqttConfig();
	if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
	const input = value as Record<string, unknown>;
	const result = {...defaults, enabled: input.enabled === true};
	for (const key of ['url', 'username', 'password'] as const) {
		if (typeof input[key] === 'string') result[key] = input[key] as string;
	}
	if (Array.isArray(input.cards)) {
		const seen = new Set<string>();
		for (const item of input.cards) {
			if (!item || typeof item !== 'object' || !['sensor', 'button'].includes(item.type)) continue;
			if (!['id', 'label', 'topic'].every((key) => typeof item[key] === 'string')) continue;
			let card: HomeCard;
			if (item.type === 'sensor') {
				if (typeof item.path !== 'string' || typeof item.unit !== 'string') continue;
				card = {id: item.id, type: 'sensor', label: item.label, topic: item.topic, path: item.path, unit: item.unit};
			} else {
				if (typeof item.payload !== 'string') continue;
				card = {id: item.id, type: 'button', label: item.label, topic: item.topic, payload: item.payload};
			}
			if (validateCard(card) || seen.has(card.id)) continue;
			seen.add(card.id);
			result.cards.push(card);
			if (result.cards.length === 12) break;
		}
	}
	return result;
}

export function validateMqttConfig (config: MqttConfig): string | null {
	if (!config.url) return 'Enter the broker URL, such as mqtt://192.0.2.20:1883.';
	try {
		parseBrokerUrl(config.url);
	} catch { return 'Use mqtt:// (rooted TV), ws:// or wss://, with credentials in the separate fields.'; }
	if (config.cards.length > 12) return 'Add up to 12 sensor and button cards.';
	const ids = new Set<string>();
	for (const card of config.cards) {
		const error = validateCard(card);
		if (error) return error;
		if (ids.has(card.id)) return 'Each card needs a unique ID.';
		ids.add(card.id);
	}
	return null;
}

/** Payloads are text or JSON scalars. Never evaluate a template or render HTML. */
export function sensorValue (payload: string, path: string): string | null {
	let value: unknown = payload.trim();
	if (path) {
		try {
			value = JSON.parse(payload);
			for (const key of path.split('.')) {
				if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return null;
				value = (value as Record<string, unknown>)[key];
			}
		} catch { return null; }
	}
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
	const text = String(value).trim();
	return text ? text.slice(0, 80) : null;
}
