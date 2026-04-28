<script lang="ts">
    import QuicktoolsDateArea from './QuicktoolsDateArea.svelte';
    import QuicktoolsCertification from './QuicktoolsCertification.svelte';
    import QuicktoolsBasics from './QuicktoolsBasics.svelte';

    import { variantStore } from '../../store/variantStore.js';
    import { t, locale, locales } from "../../store/languageStore";
    import { iconPath } from '$lib/path-utils';

    let isCCP: boolean;
    variantStore.subscribe((value: any) => {
        ({ isCCP } = value);
    });
    const infoIcon = iconPath('info-outlined.svg');
</script>

<div class="quicktool-label-container">
    <b>{$t("quickSelect")}:</b>
    <button class="iconRoundButton tooltip">
        <span class="tooltiptext">{@html $t("tooltip_QuicktoolsQuickSelect")}</span>
        <img src={infoIcon} alt="info" class="iconRound" />
    </button>
  </div>

    <div class="date-area box_style box_level3">
        <QuicktoolsBasics />
    </div>
    <div class="date-area box_style box_level3">
        <QuicktoolsDateArea/>
    </div>
    {#if !isCCP}
    <div class="date-area box_style box_level3">
        <QuicktoolsCertification/>
    </div>
    {/if}
