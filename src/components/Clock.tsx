import {dateText, dayName, timeParts, type TimeFormat} from '../lib/clock';

export function Clock ({now, format, compact = false}: {now: Date; format: TimeFormat; compact?: boolean}) {
	const {time, period} = timeParts(now, format);
	if (compact) return <div class="clock clock--compact">
		<span>{dayName(now)}, {dateText(now)}</span>
		<span class="clock__separator" aria-hidden="true">·</span>
		<span>{time}{period && <span class="clock__compact-period"> {period}</span>}</span>
	</div>;
	return (
		<div class="clock">
			<div class="clock__line">{dayName(now)}</div>
			<div class="clock__line">{dateText(now)}</div>
			<div class="clock__time">
				{time}
				{period && <span class="clock__period">{period}</span>}
			</div>
		</div>
	);
}
