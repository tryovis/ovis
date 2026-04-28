<script lang="ts">
	import UserManagementTable from './UserManagementTable.svelte';
	import UserManagementCreateUser from './UserManagementCreateUser.svelte';
	import { userStore } from '../../store/userStore';

	let currentRole = '';

	userStore.subscribe((value: any) => {
		({ currentRole } = value);
	});
</script>

{#if currentRole !== 'user'}
	<div class="um-layout">
		<div class="box_style box_level2 um-table-area">
			<UserManagementTable />
		</div>

		<div class="box_style box_level2 um-actions">
			<UserManagementCreateUser />
		</div>
	</div>
{:else}
	As a normal "user" you do not have permission to enter this page.
{/if}

<style>
	.um-layout {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		min-width: 0; /* verhindert horizontales Überlaufen im Flex-Container */
	}

	.um-table-area {
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0; /* wichtig gegen horizontale Scrollbalken */
		overflow-y: auto; /* nur vertikal scrollen */
		overflow-x: hidden; /* horizontal ausblenden */
	}

	.um-actions {
		flex: 0 0 auto;
	}

	/* Helfer: Tabelle soll nicht breiter werden als der Container */
	.um-table-area table {
		width: 100%;
		table-layout: fixed; /* erlaubt sauberes Umbrechen */
		border-collapse: collapse;
	}

	/* Zellinhalte umbrechen statt horizontalen Scroll zu erzwingen */
	.um-table-area th,
	.um-table-area td {
		white-space: normal;
		overflow-wrap: anywhere; /* bricht auch lange Tokens/UUIDs */
		word-break: break-word;
	}

	/* Falls du einzelne Spalten NICHT umbrechen willst, gib ihnen eine Klasse */
	/* .no-wrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } */
</style>
