import { get } from 'svelte/store';
import { t } from '../store/languageStore';
import { showToast } from '../store/toastStore';

// HTTP installations may not expose navigator.clipboard. Use the browser's copy
// event there so the table or picker keeps its current focus and selection.
function copyWithEvent(text: string): boolean {
	let copied = false;
	const onCopy = (event: ClipboardEvent) => {
		if (!event.clipboardData) return;
		event.clipboardData.setData('text/plain', text);
		event.preventDefault();
		copied = true;
	};
	document.addEventListener('copy', onCopy);
	try {
		return document.execCommand('copy') && copied;
	} finally {
		document.removeEventListener('copy', onCopy);
	}
}

let latestClick = 0;

export async function copyFilterValue(value: unknown): Promise<void> {
	const click = ++latestClick;
	const raw = Array.isArray(value) ? value.join(', ') : String(value ?? '');
	const text = raw.trim() ? raw : '-';
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
		} else if (!copyWithEvent(text)) {
			throw new Error('Copy unavailable');
		}
	} catch {
		if (click === latestClick) showToast(get(t)('filterValueCopyError'));
		return;
	}
	if (click === latestClick) {
		const preview = text.length > 80 ? text.slice(0, 79) + '…' : text;
		showToast(`${get(t)('copiedToClipboard')} · ${preview}`);
	}
}
