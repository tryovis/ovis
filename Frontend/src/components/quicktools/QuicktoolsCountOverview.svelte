<script lang="ts">
	import { onMount } from 'svelte';
	import { getQuicktoolsCountOverview } from '../../graphQl/gql-quicktools';
	import { t, locale, locales } from "../../store/languageStore";
	import type { LensDataPasser } from "@samply/lens";
	import {addUserFilter} from '../../components/UserFilter'
	import { iconPath } from '$lib/path-utils';

	let dataPasser: LensDataPasser;

	$: countObject = { patient: 0, diagnosis: 0, therapy: 0, progress: 0 };

	onMount(async () => {
		await import("@samply/lens");

		let filter = JSON.stringify(dataPasser.getAstAPI());
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		
		const res = await getQuicktoolsCountOverview(filter);

		countObject = Array.isArray(res)
			? res.reduce((acc: any, it: { count: number, collection: string } | null) => {
				if (it?.collection) acc[it.collection] = it.count;
				return acc;
			}, { patient: 0, diagnosis: 0, therapy: 0, progress: 0 })
			: { patient: 0, diagnosis: 0, therapy: 0, progress: 0 };
	});


	const patientenIcon = iconPath('patient-cohort.png');
	const tumoreIcon = iconPath('diagnosis.png');
	const therapienIcon = iconPath('physiotherapy.png');
	const progressIcon = iconPath('progress.png');

</script>
<lens-data-passer bind:this={dataPasser} />
<div class="box_style box_level3">
	<div class="grid-container-count">
		<div class="patient-count">
			<img src={patientenIcon} alt="info" class="menuebar-icon" />
			{$t("patient")}
			<span class="counts">{countObject.patient}</span>
		</div>
		<div class="tumor-count">
			<img src={tumoreIcon} alt="info" class="menuebar-icon" />
			{$t("tumors")}
			<span class="counts">{countObject.diagnosis}</span>
		</div>
		<div class="therapy-count">
			<img src={therapienIcon} alt="info" class="menuebar-icon" />
			Therap.<span class="counts">{countObject.therapy}</span>
		</div>
		<div class="progress-count">
			<img src={progressIcon} alt="info" class="menuebar-icon" />
			{$t("QuicktoolsCountOverview.progress")}
			<span class="counts">{countObject.progress}</span>
		</div>
	</div>
</div>

<style>
	.counts {
		margin-right: 3px;
		float: right;
	}
	.grid-container-count {
		display: grid;
		position: relative;
		overflow: hidden;
		grid-area: grid-container-quicktools;
		grid-template-columns: 50% 50%;
		grid-template-rows: 50% 50%;
		grid-template-areas:
			'patient-count tumor-count'
			'therapy-count progress-count';
	}
	.patient-count {
		grid-area: patient-count;
	}
	.tumor-count {
		grid-area: tumor-count;
	}
	.therapy-count {
		grid-area: therapy-count;
	}
	.progress-count {
		grid-area: progress-count;
	}
</style>
