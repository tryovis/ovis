/// <reference types="@sveltejs/kit" />

declare module '$env/dynamic/public' {
	export const env: Record<string, string | undefined>;
}
