// The layout owns the authenticated catalogue. Keep it in the component tree,
// so editors reuse the latest data without a global cache across sessions/SSR.
export const CATALOGUE_CONTEXT = Symbol('ovis-catalogue');
export type CatalogueReader = () => unknown[] | null;
