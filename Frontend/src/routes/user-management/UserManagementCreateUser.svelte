<script lang="ts">
	import Headline from '../../components/Headline.svelte';
	import { createUser } from '../../graphQl/gql-userManagement';
	import { userStore } from '../../store/userStore';

	let currentUser = '';

	userStore.subscribe((value: { currentUser: string }) => {
		({ currentUser } = value);
	});

	let identifier = '';

	async function createNewUser() {
		console.log('Input Value:', identifier);

		// Aufruf der createUser-Funktion mit der Benutzer-ID
		let creator = currentUser;
		try {
			const response = await createUser(identifier, 'user', null, null, null, creator);
			// Handle response if needed
			console.log('Response:', response);
			// Emit an event globally to inform the other component
			window.dispatchEvent(new CustomEvent('userCreated'));
		} catch (error) {
			// Handle error if needed
			console.error('Error:', error);
		}
	}
</script>

<Headline
	headlineTitle={'Create User'}
	headlineTooltip={'TOOLTIP'}
	headlineMaximize={null}
	headlineShowChart={null}
	headlineIsChart={null}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={null}
	headlineChartJSElement={null}
	headlineD3Element={null}
/>

<input bind:value={identifier} placeholder="enter user ID..." />

<button on:click={createNewUser}>Submit</button>
