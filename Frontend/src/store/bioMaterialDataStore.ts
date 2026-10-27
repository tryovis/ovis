import { writable } from 'svelte/store';
import { getTableCount } from '../graphQl/table-page';

/** Whether the bioMaterial collection holds any records; CCP sites without biomaterial hide the module. */
export const bioMaterialDataStore = writable(false);

let request: Promise<void> | undefined;

export function loadBioMaterialData(): Promise<void> {
	request ??= getTableCount('bioMaterial', null, [])
		.then((count) => bioMaterialDataStore.set(count > 0))
		.catch(() => {
			request = undefined;
		});
	return request;
}
