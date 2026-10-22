import {clamp} from '../hooks/useKeys';
import {LAYOUT} from '../theme/tokens';
import {Glyph} from './Glyph';
import type {TileModel} from './Tile';

interface Props {
	items: TileModel[];
	focused: boolean;
	selected: number;
	emptyText?: string;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}
const WIDTH = 236;
const GAP = 20;
const VIEWPORT = LAYOUT.screenWidth - 2 * LAYOUT.edgePadding;

/** A centered strip of source pills, with carousel navigation for longer lists. */
export function SourceBadges ({items, focused, selected, emptyText, onSelect, onActivate}: Props) {
	const total = items.length * (WIDTH + GAP) - GAP;
	const fits = total <= VIEWPORT;
	const offset = fits ? 0 : clamp(selected * (WIDTH + GAP) + WIDTH / 2 - VIEWPORT / 2, 0, total - VIEWPORT);
	return <section class="wallpaper-sources" aria-label="Sources">
		<div class="source-badges__viewport">
			{!items.length ? <div class="row__empty">{emptyText || 'No sources selected'}</div> :
				<div class={`source-badges__track${fits ? ' source-badges__track--centered' : ''}`} style={{transform: `translateX(${-offset}px)`}}>
					{items.map((item, i) => <button key={item.key} class={`source-badge${focused && selected === i ? ' source-badge--focused' : ''}`} onMouseEnter={() => onSelect(i)} onClick={() => onActivate(i)}>
						<span class="source-badge__icon" aria-hidden="true">{item.glyphImageUrl || item.imageUrl ? <img class={item.glyphImageUrl ? 'source-badge__glyph-image' : ''} src={item.glyphImageUrl || item.imageUrl} alt="" /> : item.glyph ? <Glyph name={item.glyph} /> : item.label.charAt(0)}</span>
						<span class="source-badge__name">{item.label}</span>
					</button>)}
				</div>}
		</div>
	</section>;
}
