<script lang="ts">
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';

	export let titleKey: string;
</script>

{#if $userStore.currentRole !== 'user'}
	<div class="box_style box_level2 admin-placeholder">
		<h1>{$t(titleKey)}</h1>
		<p>{$t('adminTodo')}</p>
	</div>
{:else}
	As a normal "user" you do not have permission to enter this page.
{/if}

<style>
	.admin-placeholder {
		padding: 16px;
	}

	.admin-placeholder h1 {
		margin-top: 0;
	}
</style>
