<script>
	import QuicktoolsActiveFilters from './QuicktoolsActiveFilters.svelte';
	import QuicktoolsCountOverview from './QuicktoolsCountOverview.svelte';
	import QuicktoolsCurrentRoute from './QuicktoolsCurrentRoute.svelte';
	import QuicktoolsCatalogues from './QuicktoolsCatalogues.svelte';
	import QuicktoolsCohortImport from './QuicktoolsCohortImport.svelte';
	import QuicktoolsQuickSelect from './QuicktoolsQuickSelect.svelte';
	import QuicktoolsUserPanel from './QuicktoolsUserPanel.svelte';
	import QuicktoolsLogo from './QuicktoolsLogo.svelte';
	import { reloadStore, reloadFilter } from '../../store/reloadStore';
	// import {filterActiveStore} from '../../store/filterActiveStore';

	/*
    filterActiveStore.subscribe((value) => {
     ({ filterActive } = value);
    });*/
</script>

<div>

    <div class="user_panel box_style box_level2">
        <QuicktoolsLogo />
    </div>

        <div class="user_panel box_style box_level2">
            <QuicktoolsUserPanel />
        </div>

        <div class="navigation box_style box_level2">
            <QuicktoolsCurrentRoute />
        </div>
        {#if $reloadStore}
            {#if $reloadFilter}
                    <div class="filter-view box_style box_level2">
                        <QuicktoolsActiveFilters />
                    </div>
                    <div class="quicktools box_style box_level2">

                        <QuicktoolsCountOverview />

                    </div>
            {/if}
        {/if}
        {#if $reloadStore}


            <div class="date-area box_style box_level2">
                <QuicktoolsQuickSelect />
            </div>
            <div class="date-area box_style box_level2">
                <QuicktoolsCohortImport/>
            </div>
            <div class="date-area box_style box_level2">
                <QuicktoolsCatalogues/>
            </div>
        {/if}

</div>
