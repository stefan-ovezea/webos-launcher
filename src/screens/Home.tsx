import {useCallback, useState} from 'preact/hooks';
import {Header} from '../components/Header';
import {Clock} from '../components/Clock';
import {Row} from '../components/Row';
import {Glyph} from '../components/Glyph';
import type {TileModel} from '../components/Tile';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useClock} from '../hooks/useClock';
import {useTimeFormat} from '../hooks/useTimeFormat';
import {Wallpaper} from '../components/Wallpaper';
import {HomeAssistantRow} from '../components/HomeAssistantRow';
import {SourceBadges} from '../components/SourceBadges';
import type {HomeCard} from '../lib/mqttConfig';
import type {MqttStatus} from '../lib/mqtt';

export interface HomeRow {
	id: string;
	label: string;
	items: TileModel[];
	emptyText?: string;
	kind?: 'homeassistant';
}

interface Props {
	rows: HomeRow[];
	active: boolean;
	onActivate: (rowId: string, item: TileModel) => void;
	wallpaper: boolean;
	onWallpaperError: (message: string) => void;
	homeAssistant?: {cards: HomeCard[]; values: Record<string, string | null>; status: MqttStatus; busy: string | null};
}

const WALLPAPER_ORDER: Record<string, number> = {misc: 0, homeassistant: 1, sources: 2, apps: 3};

/** Both layouts share focus memory, but arrows follow each layout's visual order. */
export function Home ({rows, active, onActivate, wallpaper, onWallpaperError, homeAssistant}: Props) {
	const now = useClock();
	const timeFormat = useTimeFormat();
	const [rowIndex, setRowIndex] = useState(0);
	const [columns, setColumns] = useState<Record<string, number>>({});
	const logicalRow = rows[clamp(rowIndex, 0, rows.length - 1)];
	const visualRows = wallpaper ? rows.slice().sort((a, b) => WALLPAPER_ORDER[a.id] - WALLPAPER_ORDER[b.id]) : rows;
	const currentRow = Math.max(0, visualRows.indexOf(logicalRow));
	const focused = (row: HomeRow) => row === visualRows[currentRow];
	const columnOf = (row: HomeRow) => clamp(columns[row.id] || 0, 0, Math.max(0, row.items.length - 1));
	const setColumn = (rowId: string, col: number) => setColumns((c) => ({...c, [rowId]: col}));
	const select = (row: HomeRow, col: number) => { setRowIndex(rows.indexOf(row)); setColumn(row.id, col); };
	const activate = (row: HomeRow, col: number) => { select(row, col); if (row.items[col]) onActivate(row.id, row.items[col]); };

	const handleKey = useCallback((key: NavKey): boolean => {
		const row = visualRows[currentRow];
		if (!row) return false;
		switch (key) {
			case 'up': setRowIndex(rows.indexOf(visualRows[clamp(currentRow - 1, 0, visualRows.length - 1)])); return true;
			case 'down': setRowIndex(rows.indexOf(visualRows[clamp(currentRow + 1, 0, visualRows.length - 1)])); return true;
			case 'left': setColumn(row.id, clamp(columnOf(row) - 1, 0, row.items.length - 1)); return true;
			case 'right': setColumn(row.id, clamp(columnOf(row) + 1, 0, row.items.length - 1)); return true;
			case 'enter': {
				const item = row.items[columnOf(row)];
				if (item) onActivate(row.id, item);
				return true;
			}
			case 'back': return true;
		}
	}, [rows, visualRows, currentRow, columns, onActivate]);
	useKeys(handleKey, active);

	const assistantRow = (row: HomeRow, quiet = false) => homeAssistant && <HomeAssistantRow key={row.id} {...homeAssistant} quiet={quiet}
		focused={focused(row)} selected={columnOf(row)} onSelect={(col) => select(row, col)} onActivate={(col) => activate(row, col)} />;
	const appRow = (row: HomeRow, quiet = false) => <Row key={row.id} label={row.label} items={row.items} emptyText={row.emptyText}
		focused={focused(row)} tileSize={quiet ? 128 : homeAssistant ? 112 : undefined} quiet={quiet} selected={columnOf(row)}
		onSelect={(col) => select(row, col)} onActivate={(col) => activate(row, col)} />;
	const misc = rows.find((row) => row.id === 'misc');
	const assistant = rows.find((row) => row.kind === 'homeassistant');
	const sources = rows.find((row) => row.id === 'sources');
	const apps = rows.find((row) => row.id === 'apps');

	return <div class={`screen home${homeAssistant ? ' home--with-ha' : ''}${wallpaper ? ' home--wallpaper' : ''}`}>
		<Wallpaper enabled={wallpaper} onError={onWallpaperError} />
		{wallpaper ? <>
			<div class="wallpaper-topbar">
				<nav class="wallpaper-utilities" aria-label="More">
					{misc && misc.items.map((item, i) => <button key={item.key} aria-label={item.label}
						class={`wallpaper-utility${focused(misc) && columnOf(misc) === i ? ' wallpaper-utility--focused' : ''}`}
						onMouseEnter={() => select(misc, i)} onClick={() => activate(misc, i)}>
						{item.glyph ? <Glyph name={item.glyph} /> : item.label.charAt(0)}
					</button>)}
				</nav>
				<Clock now={now} format={timeFormat} compact />
			</div>
			{assistant && <div class="wallpaper-assistant">{assistantRow(assistant, true)}</div>}
			<div class="wallpaper-dock">
				{sources && <SourceBadges items={sources.items} focused={focused(sources)} selected={columnOf(sources)} emptyText={sources.emptyText}
					onSelect={(col) => select(sources, col)} onActivate={(col) => activate(sources, col)} />}
				{apps && <div class="wallpaper-apps">{appRow(apps, true)}</div>}
			</div>
		</> : <>
			<Header now={now} />
			<Clock now={now} format={timeFormat} />
			<div class="rows">{rows.map((row) => row.kind === 'homeassistant' ? assistantRow(row) : appRow(row))}</div>
		</>}
	</div>;
}
