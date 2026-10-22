import {useState} from 'preact/hooks';
import {RemoteForm, type FormField} from '../components/RemoteForm';
import {newCard, validateCard, validateMqttConfig, type HomeCard, type MqttConfig} from '../lib/mqttConfig';
import type {MqttStatus} from '../lib/mqtt';

interface Props { config: MqttConfig; status: MqttStatus; onSave: (config: MqttConfig) => void; onClose: () => void; }

export function MqttSettings ({config, status, onSave, onClose}: Props) {
	const [draft, setDraft] = useState({...config, cards: config.cards.slice()});
	const [card, setCard] = useState<HomeCard | null>(null);
	const [error, setError] = useState('');
	const closeCard = () => { setCard(null); setError(''); };
	const editCard = (next: HomeCard) => { setCard({...next}); setError(''); };
	const save = () => {
		const next = {...draft, url: draft.url.trim()};
		const invalid = validateMqttConfig(next);
		if (invalid) { setError(invalid); return; }
		onSave(next);
	};
	const saveCard = () => {
		if (!card) return;
		const next = {...card, label: card.label.trim(), topic: card.topic.trim()};
		const invalid = validateCard(next);
		if (invalid) { setError(invalid); return; }
		const exists = draft.cards.some((item) => item.id === next.id);
		setDraft({...draft, cards: exists ? draft.cards.map((item) => item.id === next.id ? next : item) : draft.cards.concat(next)});
		closeCard();
	};
	let fields: FormField[];
	if (card) {
		fields = [
			{id: 'label', label: 'Label', value: card.label, onInput: (label) => setCard({...card, label})},
			{id: 'topic', label: card.type === 'sensor' ? 'State topic' : 'Command topic', value: card.topic, placeholder: card.type === 'sensor' ? 'homeassistant/sensor/living_room_temperature/state' : 'launcher/actions/movie', onInput: (topic) => setCard({...card, topic})}
		];
		if (card.type === 'sensor') fields.push(
			{id: 'path', label: 'JSON field (optional)', help: 'Leave empty for plain text; e.g. temperature or room.value for JSON.', value: card.path, onInput: (path) => setCard({...card, path})},
			{id: 'unit', label: 'Unit (optional)', value: card.unit, placeholder: '°C', onInput: (unit) => setCard({...card, unit})}
		);
		else fields.push({id: 'payload', label: 'Payload to send', help: 'Sent once when pressed. Can be text or JSON.', value: card.payload, multiline: true, onInput: (payload) => setCard({...card, payload})});
		fields.push({id: 'save-card', label: 'Keep card', onActivate: saveCard});
		if (draft.cards.some((item) => item.id === card.id)) {
			const index = draft.cards.findIndex((item) => item.id === card.id);
			if (index > 0) fields.push({id: 'move', label: 'Move card earlier', onActivate: () => {
				const cards = draft.cards.slice();
				[cards[index - 1], cards[index]] = [cards[index], cards[index - 1]];
				setDraft({...draft, cards}); closeCard();
			}});
			fields.push({id: 'remove', label: 'Remove card', onActivate: () => { setDraft({...draft, cards: draft.cards.filter((item) => item.id !== card.id)}); closeCard(); }});
		}
		fields.push({id: 'cancel-card', label: 'Cancel', onActivate: closeCard});
	} else {
		fields = [
			{id: 'url', label: 'Broker URL', help: 'mqtt:// for rooted TVs; ws:// or wss:// for WebSockets.', value: draft.url, placeholder: 'mqtt://192.0.2.20:1883', onInput: (url) => setDraft({...draft, url})},
			{id: 'username', label: 'Username (optional)', value: draft.username, onInput: (username) => setDraft({...draft, username})},
			{id: 'password', label: 'Password (optional)', password: true, value: draft.password, onInput: (password) => setDraft({...draft, password})},
			...draft.cards.map((item): FormField => ({id: item.id, label: item.label, help: item.type === 'sensor' ? 'Sensor · ' + item.topic : 'Button · ' + item.topic, onActivate: () => editCard(item)}))
		];
		if (draft.cards.length < 12) fields.push(
			{id: 'add-sensor', label: '+ Add sensor', onActivate: () => editCard(newCard('sensor'))},
			{id: 'add-button', label: '+ Add button', onActivate: () => editCard(newCard('button'))}
		);
		fields.push({id: 'save', label: 'Save configuration', onActivate: save}, {id: 'cancel', label: 'Cancel', onActivate: onClose});
	}
	return <div class="screen"><div class="settings mqtt-settings">
		<h1 class="settings__title">{card ? (card.type === 'sensor' ? 'Sensor card' : 'Button card') : 'Home Assistant · MQTT'}</h1>
		<p class="settings__hint">{status} · ↑ ↓ moves · OK edits · Back finishes editing or cancels</p>
		<p class="mqtt-settings__intro">{card ? 'Choose what appears in the Home Assistant row. Keep the card, then save the configuration.' : 'Connect to your MQTT broker. Add up to 12 sensors and buttons; they appear in order on your home screen.'}</p>
		{error && <p class="mqtt-settings__error" role="alert">{error}</p>}
		<RemoteForm key={card ? card.id : 'connection'} fields={fields} onBack={card ? closeCard : onClose} />
		<p class="mqtt-settings__footnote">{card ? 'Sensor values must be published to MQTT. Buttons can trigger Home Assistant automations or send directly to MQTT devices.' : 'Credentials stay in local storage on this TV. Sensor data refreshes while the launcher is running. Use a dedicated broker account.'}</p>
	</div></div>;
}
