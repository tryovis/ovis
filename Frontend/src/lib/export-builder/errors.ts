export type ExportErrorVariables = Readonly<Record<string, string | number>>;

/** Keep errors translatable when the user changes language after a failed request. */
export class ExportError extends Error {
	readonly key: string;
	readonly vars: ExportErrorVariables;

	constructor(key: string, vars: ExportErrorVariables = {}, message = key) {
		super(message);
		this.name = 'ExportError';
		this.key = key;
		this.vars = Object.freeze({ ...vars });
	}
}
