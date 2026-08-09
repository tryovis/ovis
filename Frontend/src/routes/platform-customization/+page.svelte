<script lang="ts">
	import PlatformCustomizationDashboard from './PlatformCustomizationDashboard.svelte';
	import { userStore } from '../../store/userStore';
</script>

{#if $userStore.currentRole !== 'user'}
	<PlatformCustomizationDashboard />
{:else}
	As a normal "user" you do not have permission to enter this page.
{/if}
