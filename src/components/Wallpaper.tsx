import {useEffect, useState} from 'preact/hooks';
import {loadWallpaper} from '../lib/wallpaper';

export function Wallpaper ({enabled, onError}: {enabled: boolean; onError: (message: string) => void}) {
	const [url, setUrl] = useState('');
	useEffect(() => {
		let alive = true;
		let request = 0;
		setUrl('');
		if (!enabled) return;
		const refresh = () => {
			const current = ++request;
			loadWallpaper(() => !alive || current !== request).then((image) => {
				if (alive && current === request) setUrl(image);
			}).catch((error: Error) => {
				if (alive && current === request) { setUrl(''); onError(error.message); }
			});
		};
		refresh();
		const visible = () => { if (!document.hidden) refresh(); };
		document.addEventListener('visibilitychange', visible);
		return () => { alive = false; document.removeEventListener('visibilitychange', visible); };
	}, [enabled, onError]);
	if (!enabled || !url) return null;
	return <div class="wallpaper" aria-hidden="true"><img src={url} alt="" onError={() => { setUrl(''); onError('Could not decode the wallpaper image. Try a smaller JPEG or PNG.'); }} /><div class="wallpaper__shade" /></div>;
}
