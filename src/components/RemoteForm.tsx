import {useEffect, useRef, useState} from 'preact/hooks';
import {clamp, useKeys} from '../hooks/useKeys';

export interface FormField {
	id: string;
	label: string;
	help?: string;
	value?: string;
	placeholder?: string;
	password?: boolean;
	multiline?: boolean;
	onInput?: (value: string) => void;
	onActivate?: () => void;
}

/** Native text entry when editing, five-way navigation everywhere else. */
export function RemoteForm ({fields, onBack}: {fields: FormField[]; onBack: () => void}) {
	const [selected, setSelected] = useState(0);
	const [editing, setEditing] = useState(false);
	const elements = useRef<(HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null)[]>([]);
	useEffect(() => {
		const element = elements.current[selected];
		if (!element) return;
		if ('readOnly' in element) element.readOnly = !editing;
		if (editing) element.blur(); // re-focus editable fields to open the TV keyboard
		element.focus();
		element.scrollIntoView({block: 'nearest'});
	}, [selected, editing]);
	useKeys((key) => {
		if (editing) {
			if (key === 'back' || (key === 'enter' && !fields[selected].multiline)) {
				setEditing(false);
				const element = elements.current[selected];
				if (element) element.blur();
				return true;
			}
			return false;
		}
		if (key === 'back') { onBack(); return true; }
		if (key === 'up' || key === 'down') { setSelected(clamp(selected + (key === 'down' ? 1 : -1), 0, fields.length - 1)); return true; }
		if (key === 'enter') {
			const field = fields[selected];
			if (field.onActivate) field.onActivate();
			else setEditing(true);
		}
		return true;
	});
	return <div class="remote-form">
		{fields.map((field, index) => {
			const className = `mqtt-field${selected === index ? ' mqtt-field--focused' : ''}${editing && selected === index ? ' mqtt-field--editing' : ''}`;
			const select = () => { setSelected(index); setEditing(false); };
			if (field.onActivate) return <button key={field.id} ref={(el) => { elements.current[index] = el; }} class={className} onFocus={select} onClick={field.onActivate}>
				<span>{field.label}{field.help && <small>{field.help}</small>}</span><span aria-hidden="true">→</span>
			</button>;
			const props = {
				value: field.value || '', placeholder: field.placeholder, readOnly: !editing || selected !== index,
				autoComplete: 'off', spellcheck: false,
				onFocus: () => setSelected(index),
				onClick: () => { setSelected(index); setEditing(true); },
				onInput: (event: Event) => field.onInput && field.onInput((event.currentTarget as HTMLInputElement).value)
			};
			return <label key={field.id} class={className}>
				<span>{field.label}{field.help && <small>{field.help}</small>}</span>
				{field.multiline ? <textarea {...props} rows={3} ref={(el) => { elements.current[index] = el; }} /> : <input {...props} type={field.password ? 'password' : 'text'} ref={(el) => { elements.current[index] = el; }} />}
			</label>;
		})}
	</div>;
}
