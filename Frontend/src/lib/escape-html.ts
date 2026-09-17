/** Escape text before inserting it into an HTML string or quoted attribute. */
export function escapeHtml(value: unknown): string {
	return String(value ?? '').replace(/[&<>"']/g, (character) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	}[character]!));
}
