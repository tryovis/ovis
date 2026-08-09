<script lang="ts">
	import AnalyticsDashboard from './AnalyticsDashboard.svelte';
	import { userStore } from '../../store/userStore';
</script>

{#if $userStore.currentRole !== 'user'}
	<AnalyticsDashboard />
{:else}
	As a normal "user" you do not have permission to enter this page.
{/if}
