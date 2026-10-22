// Inline SVG line icons used by the Misc row and the settings badge.

export type GlyphName = 'house' | 'gear';

export function Glyph ({name}: {name: GlyphName}) {
	return (
		<svg class="tile__glyph" viewBox="0 0 24 24" aria-hidden="true">
			{name === 'house'
				? <path d="M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8M10 20v-6h4v6" />
				: <>
					<circle cx="12" cy="12" r="3.2" />
					<path d="M9.36 5.63 L10.57 5.25 L10.09 3 L13.91 3 L13.43 5.25 L14.64 5.63 L15.76 6.21 L17.01 4.28 L19.72 6.99 L17.79 8.24 L18.37 9.36 L18.75 10.57 L21 10.09 L21 13.91 L18.75 13.43 L18.37 14.64 L17.79 15.76 L19.72 17.01 L17.01 19.72 L15.76 17.79 L14.64 18.37 L13.43 18.75 L13.91 21 L10.09 21 L10.57 18.75 L9.36 18.37 L8.24 17.79 L6.99 19.72 L4.28 17.01 L6.21 15.76 L5.63 14.64 L5.25 13.43 L3 13.91 L3 10.09 L5.25 10.57 L5.63 9.36 L6.21 8.24 L4.28 6.99 L6.99 4.28 L8.24 6.21 Z" />
				</>}
		</svg>
	);
}

export function CheckMark () {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		</svg>
	);
}
