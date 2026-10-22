import './compat';
import mqtt, {type MqttClient} from 'mqtt';
import {sensorValue, validateMqttConfig, type MqttConfig} from './mqttConfig';
import {mqttTransportUrl} from './mqttBridge';

export type MqttStatus = 'Disabled' | 'Not configured' | 'Connecting' | 'Connected' | 'Reconnecting' | 'Connection error';
interface Handlers {
	status: (status: MqttStatus) => void;
	value: (id: string, value: string | null) => void;
	reset: () => void;
	error?: (message: string) => void;
}

/** Subscribes only to configured sensor topics. It exposes no TV controls to MQTT. */
export class HomeMqtt {
	private client: MqttClient | null = null;
	private stopped = false;
	private ready = false;
	private checkingBridge = false;
	private pending = new Set<(error: Error) => void>();
	constructor (private config: MqttConfig, private handlers: Handlers) {}

	async start (): Promise<void> {
		if (!this.config.enabled) { this.handlers.status('Disabled'); return; }
		if (!this.config.url) { this.handlers.status('Not configured'); return; }
		if (validateMqttConfig(this.config)) { this.handlers.status('Connection error'); return; }
		this.handlers.status('Connecting');
		try {
			const transportUrl = await mqttTransportUrl(this.config.url);
			if (this.stopped) return;
			const client = this.client = mqtt.connect(transportUrl, {
				username: this.config.username || undefined, password: this.config.password || undefined,
				clean: true, protocolVersion: 4, connectTimeout: 10000, reconnectPeriod: 5000,
				keepalive: 30, queueQoSZero: false, resubscribe: false
			});
			client.on('connect', () => {
				if (this.stopped) return;
				this.handlers.reset();
				const topics = Array.from(new Set(this.config.cards.filter((c) => c.type === 'sensor').map((c) => c.topic)));
				if (!topics.length) { this.ready = true; this.handlers.status('Connected'); return; }
				// Process retained readings immediately, even when they arrive before SUBACK.
				this.ready = true;
				client.subscribe(topics, {qos: 0}, (error, granted) => {
					if (this.stopped) return;
					if (error || !granted || granted.some((g) => Number(g.qos) > 2)) {
						console.warn('MQTT sensor subscription failed:', error ? error.message : 'Broker rejected the topic subscription.');
						this.ready = false; this.handlers.status('Connection error'); return;
					}
					this.handlers.status('Connected');
				});
			});
			client.on('reconnect', () => {
				if (this.stopped) return;
				this.handlers.status('Reconnecting');
				if (!this.checkingBridge && this.config.url.indexOf('mqtt://') === 0) {
					this.checkingBridge = true;
					mqttTransportUrl(this.config.url).catch(() => { /* retry on the next reconnect */ }).finally(() => { this.checkingBridge = false; });
				}
			});
			client.on('close', () => {
				this.ready = false;
				for (const fail of this.pending) fail(new Error('MQTT disconnected. The button was not queued.'));
				if (!this.stopped) this.handlers.status('Reconnecting');
			});
			client.on('error', (error) => {
				if (!this.stopped) { console.warn('MQTT connection error:', error.message); this.handlers.status('Connection error'); }
			});
			client.on('message', (topic, payload) => {
				if (this.stopped || !this.ready || payload.length > 65536) return;
				for (const card of this.config.cards) {
					if (card.type === 'sensor' && card.topic === topic) this.handlers.value(card.id, sensorValue(payload.toString(), card.path));
				}
			});
		} catch (error) {
			if (!this.stopped) { this.handlers.status('Connection error'); if (this.handlers.error) this.handlers.error((error as Error).message); }
		}
	}

	press (id: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const card = this.config.cards.find((c) => c.id === id && c.type === 'button');
			if (!card || card.type !== 'button') { reject(new Error('Unknown Home Assistant button.')); return; }
			if (!this.client || !this.client.connected || !this.ready || this.stopped) { reject(new Error('MQTT is not connected. Check Settings → Options → Home Assistant.')); return; }
			const finish = (error?: Error) => {
				if (!this.pending.delete(finish)) return;
				window.clearTimeout(timer);
				error ? reject(error) : resolve();
			};
			const timer = window.setTimeout(() => finish(new Error('Button send timed out.')), 3000);
			this.pending.add(finish);
			// Never retain or queue actions: reconnecting must not replay a scene or toggle.
			this.client.publish(card.topic, card.payload, {qos: 0, retain: false}, (error) => finish(error || undefined));
		});
	}

	stop (): void {
		this.stopped = true;
		this.ready = false;
		for (const fail of this.pending) fail(new Error('MQTT connection closed.'));
		if (this.client) this.client.end(true);
	}
}
