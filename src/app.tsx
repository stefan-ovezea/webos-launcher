import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Home, type HomeRow} from './screens/Home';
import {Settings, type SettingsTab} from './screens/Settings';
import type {OptionItem} from './components/OptionList';
import {Toast, type ToastMessage} from './components/Toast';
import type {TileModel} from './components/Tile';
import {listApps, type AppEntry} from './lib/apps';
import {listInputs, MOCK_INPUTS, type InputSource} from './lib/inputs';
import {launchApp, launchLgHome} from './lib/launch';
import {isWebOS} from './lib/luna';
import {hidePointerOnForeground} from './lib/pointer';
import {loadConfig, saveConfig, toggleId, type UserConfig} from './lib/storage';
import {appTile, inputTile, pickInOrder} from './lib/tiles';
import {TIMING} from './config/constants';
import {MqttSettings} from './screens/MqttSettings';
import {HomeMqtt, type MqttStatus} from './lib/mqtt';
import type {MqttConfig} from './lib/mqttConfig';
import {WALLPAPER_DIRECTORY} from './lib/wallpaper';

type Screen = 'home' | 'settings' | 'mqtt';

const ROW = {apps: 'apps', sources: 'sources', misc: 'misc', homeAssistant: 'homeassistant'} as const;
const MISC = {lgHome: 'lg-home', settings: 'settings'} as const;
const OPTION = {useHomebrew: 'use-homebrew', wallpaper: 'wallpaper', homeAssistant: 'homeassistant', mqtt: 'mqtt'} as const;

const MISC_TILES: TileModel[] = [
	{key: MISC.lgHome, label: 'LG Home', glyph: 'house'},
	{key: MISC.settings, label: 'Settings', glyph: 'gear'}
];

export function App () {
	const [screen, setScreen] = useState<Screen>('home');
	const [config, setConfig] = useState<UserConfig>(loadConfig);
	const [apps, setApps] = useState<AppEntry[]>([]);
	const [inputs, setInputs] = useState<InputSource[]>([]);
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastTimer = useRef(0);
	const mqtt = useRef<HomeMqtt | null>(null);
	const [mqttStatus, setMqttStatus] = useState<MqttStatus>('Disabled');
	const [sensorValues, setSensorValues] = useState<Record<string, string | null>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const sending = useRef(false);

	const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info') => {
		window.clearTimeout(toastTimer.current);
		setToast({text, kind});
		toastTimer.current = window.setTimeout(() => setToast(null), TIMING.toastMs);
	}, []);
	const wallpaperError = useCallback((message: string) => showToast(message, 'error'), [showToast]);

	useEffect(() => {
		setSensorValues({});
		const connection = new HomeMqtt(config.mqtt, {
			status: setMqttStatus,
			value: (id, value) => setSensorValues((values) => ({...values, [id]: value})),
			reset: () => setSensorValues({}),
			error: (message) => showToast(message, 'error')
		});
		mqtt.current = connection;
		connection.start();
		return () => { connection.stop(); mqtt.current = null; };
	}, [config.mqtt, showToast]);

	// Start in remote (5-way) mode: hide the Magic Remote pointer whenever we come to the
	// front. Shaking the remote still brings it back.
	useEffect(() => hidePointerOnForeground(), []);

	// Load apps at start and whenever the Homebrew option changes; refresh inputs whenever
	// the app comes back to the foreground (labels or connections may have changed).
	useEffect(() => {
		listApps(config.useHomebrew)
			.then(({apps: list, source}) => {
				setApps(list);
				if (config.useHomebrew && source !== 'homebrew') showToast('Homebrew Channel not available, using the built-in app list', 'error');
			})
			.catch(() => showToast('Could not read the app list', 'error'));
	}, [config.useHomebrew, showToast]);

	useEffect(() => {
		const refresh = () => {
			if (!isWebOS()) { setInputs(MOCK_INPUTS); return; }
			listInputs().then(setInputs).catch(() => showToast('Could not read the inputs', 'error'));
		};
		refresh();
		const onVisibility = () => { if (!document.hidden) refresh(); };
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, [showToast]);

	const updateConfig = (next: UserConfig) => { setConfig(next); saveConfig(next); };

	// ----- derived rows -----
	const shownApps = useMemo(() => pickInOrder(apps, config.appIds, (a) => a.id), [apps, config.appIds]);
	const shownInputs = useMemo(
		() => (config.sourceIds ? pickInOrder(inputs, config.sourceIds, (s) => s.appId) : inputs),
		[inputs, config.sourceIds]
	);

	const rows: HomeRow[] = useMemo(() => {
		const result: HomeRow[] = [
		{id: ROW.apps, label: 'Apps', items: shownApps.map(appTile), emptyText: 'No apps selected — add some in Settings'},
		{id: ROW.sources, label: 'Sources', items: shownInputs.map(inputTile), emptyText: 'No sources selected'},
		{id: ROW.misc, label: 'More', items: MISC_TILES}
		];
		if (config.mqtt.enabled) result.push({
			id: ROW.homeAssistant, label: 'Home Assistant', kind: 'homeassistant',
			items: config.mqtt.cards.length ? config.mqtt.cards.map((card) => ({key: card.id, label: card.label})) : [{key: 'ha-setup', label: 'Set up Home Assistant'}]
		});
		return result;
	}, [shownApps, shownInputs, config.mqtt]);

	const tabs: SettingsTab[] = useMemo(() => [
		{id: ROW.apps, label: 'Apps', noun: 'apps', items: apps.map(appTile), shown: shownApps.map(appTile)},
		{id: ROW.sources, label: 'Sources', noun: 'sources', items: inputs.map(inputTile), shown: shownInputs.map(inputTile)}
	], [apps, inputs, shownApps, shownInputs]);

	const options: OptionItem[] = useMemo(() => {
		const result: OptionItem[] = [
		{
			id: OPTION.useHomebrew,
			label: 'Live app list via Homebrew Channel',
			description: 'Rooted TVs only. Lists every installed app with its real icon, using the Homebrew Channel, which runs commands as root. When off, the built-in app catalogue is used.',
			value: config.useHomebrew
		},
		{id: OPTION.wallpaper, label: 'Wallpaper', description: `Read wallpaper.jpg, .jpeg, .png or .webp from ${WALLPAPER_DIRECTORY}/ (up to 4 MB). Requires the Homebrew Channel. Refreshes when you return to the launcher.`, value: config.wallpaper},
		{id: OPTION.homeAssistant, label: 'Home Assistant', description: 'Show a fourth home screen section with MQTT sensor readings and buttons. Turn on to reveal configuration.', value: config.mqtt.enabled}
		];
		if (config.mqtt.enabled) result.push({id: OPTION.mqtt, label: 'Home Assistant configuration', description: `Broker, sensors and buttons · ${mqttStatus}`, actionLabel: 'Configure'});
		return result;
	}, [config.useHomebrew, config.wallpaper, config.mqtt.enabled, mqttStatus]);

	// ----- actions -----
	const open = (id: string, label: string) => {
		launchApp(id).catch(() => showToast(`Couldn't open ${label}`, 'error'));
	};

	const onActivate = useCallback((rowId: string, item: TileModel) => {
		if (rowId === ROW.homeAssistant) {
			if (item.key === 'ha-setup') { setScreen('mqtt'); return; }
			const card = config.mqtt.cards.find((c) => c.id === item.key);
			if (!card || card.type !== 'button' || sending.current || !mqtt.current) return;
			sending.current = true;
			setBusy(card.id);
			mqtt.current.press(card.id).then(() => showToast(`Sent: ${card.label}`))
				.catch((error: Error) => showToast(error.message, 'error'))
				.finally(() => { sending.current = false; setBusy(null); });
			return;
		}
		if (rowId === ROW.misc) {
			if (item.key === MISC.settings) setScreen('settings');
			else if (item.key === MISC.lgHome) launchLgHome().catch(() => showToast("Couldn't open LG Home", 'error'));
			return;
		}
		open(item.key, item.label);
	}, [showToast, config.mqtt]);

	const onToggle = useCallback((tabId: string, key: string) => {
		if (tabId === ROW.apps) {
			updateConfig({...config, appIds: toggleId(config.appIds, key)});
		} else {
			const current = config.sourceIds || inputs.map((s) => s.appId);
			updateConfig({...config, sourceIds: toggleId(current, key)});
		}
	}, [config, inputs]);

	const onOption = useCallback((optionId: string) => {
		if (optionId === OPTION.useHomebrew) updateConfig({...config, useHomebrew: !config.useHomebrew});
		else if (optionId === OPTION.wallpaper) updateConfig({...config, wallpaper: !config.wallpaper});
		else if (optionId === OPTION.homeAssistant) updateConfig({...config, mqtt: {...config.mqtt, enabled: !config.mqtt.enabled}});
		else if (optionId === OPTION.mqtt) setScreen('mqtt');
	}, [config]);
	const saveMqtt = (next: MqttConfig) => { updateConfig({...config, mqtt: next}); setScreen('settings'); showToast('Home Assistant configuration saved'); };

	/** Replace a row's order with `keys` (the full list of what's shown). */
	const onReorder = useCallback((tabId: string, keys: string[]) => {
		if (tabId === ROW.apps) updateConfig({...config, appIds: keys});
		else updateConfig({...config, sourceIds: keys});
	}, [config]);

	return (
		<>
			{/* Home stays mounted under Settings so it keeps its focus position. */}
			<Home rows={rows} active={screen === 'home'} onActivate={onActivate} wallpaper={config.wallpaper} onWallpaperError={wallpaperError}
				homeAssistant={config.mqtt.enabled ? {cards: config.mqtt.cards, values: sensorValues, status: mqttStatus, busy} : undefined} />
			{screen !== 'home' && <Settings tabs={tabs} options={options} active={screen === 'settings'} onToggle={onToggle} onReorder={onReorder} onOption={onOption} onClose={() => setScreen('home')} />}
			{screen === 'mqtt' && <MqttSettings config={config.mqtt} status={mqttStatus} onSave={saveMqtt} onClose={() => setScreen('settings')} />}
			<Toast message={toast} />
		</>
	);
}
