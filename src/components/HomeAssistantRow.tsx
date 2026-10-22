import {clamp} from '../hooks/useKeys';
import {LAYOUT} from '../theme/tokens';
import type {HomeCard} from '../lib/mqttConfig';
import type {MqttStatus} from '../lib/mqtt';

interface Props {
	cards: HomeCard[];
	values: Record<string, string | null>;
	status: MqttStatus;
	focused: boolean;
	selected: number;
	busy: string | null;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
	quiet?: boolean;
}
const WIDTH = 276;
const GAP = 24;
const VIEWPORT = LAYOUT.screenWidth - 2 * LAYOUT.edgePadding;

export function HomeAssistantRow ({cards, values, status, focused, selected, busy, onSelect, onActivate, quiet = false}: Props) {
	const total = cards.length * (WIDTH + GAP) - GAP;
	const fits = total <= VIEWPORT;
	const offset = fits ? 0 : clamp(selected * (WIDTH + GAP) + WIDTH / 2 - VIEWPORT / 2, 0, total - VIEWPORT);
	return <section class={`row ha-row${quiet ? ' ha-row--quiet' : ''}${focused ? ' row--focused' : ''}`} aria-label={quiet ? 'Home Assistant' : undefined}>
		{!quiet && <div class="ha-row__heading"><h2 class="row__label">Home Assistant</h2><span class={`ha-row__status${status === 'Connected' ? ' ha-row__status--online' : ''}`}>{status}</span></div>}
		<div class="row__viewport">
			{!cards.length ? <button class={`ha-card ha-card--setup${focused ? ' ha-card--focused' : ''}`} onMouseEnter={() => onSelect(0)} onClick={() => onActivate(0)}><span class="ha-card__label">{quiet ? 'Set up Home Assistant →' : 'Your home, at a glance'}</span>{!quiet && <span class="ha-card__hint">Set up sensors and buttons →</span>}</button> :
				<div class={`ha-row__track${fits ? ' ha-row__track--centered' : ''}`} style={{transform: `translateX(${-offset}px)`}}>
					{cards.map((card, index) => {
						const stale = status !== 'Connected';
						const value = values[card.id];
						const className = `ha-card${focused && selected === index ? ' ha-card--focused' : ''}${stale ? ' ha-card--stale' : ''}`;
						const content = <>
							<span class="ha-card__label">{card.label}</span>
							{card.type === 'sensor' ? <><span class="ha-card__value">{value == null ? '—' : value}<small>{value != null && card.unit ? ' ' + card.unit : ''}</small></span>{!quiet && <span class="ha-card__hint">{stale ? 'Offline · last reading' : value == null ? 'Waiting for a reading' : 'Sensor'}</span>}</> : <><span class="ha-card__button-icon" aria-hidden="true">↗</span>{!quiet && <span class="ha-card__hint">{busy === card.id ? 'Sending…' : stale ? 'Offline' : 'Press to run'}</span>}</>}
						</>;
						return card.type === 'button' ? <button key={card.id} class={className} aria-disabled={stale || busy !== null} onMouseEnter={() => onSelect(index)} onClick={() => onActivate(index)}>{content}</button> : <div key={card.id} class={className} onMouseEnter={() => onSelect(index)}>{content}</div>;
					})}
				</div>}
		</div>
	</section>;
}
