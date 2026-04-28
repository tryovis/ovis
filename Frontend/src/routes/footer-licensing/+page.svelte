<script lang="ts">
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';
	import { onDestroy } from 'svelte';

	let primaryColor = '';

	const unsubscribe = userStore.subscribe((v: any) => {
		primaryColor = v?.primaryColor ?? '';
	});

	onDestroy(unsubscribe);
</script>

<div class="box_style box_level2 footer-content-box" style="--linkColor: {primaryColor}">
	<h1>{$t('licenseInformation')}</h1>

	<!-- Übersetzungsblock (enthält <section> mit .translated-link im Lizenz-Link) -->
	{@html $t('licenseInformationFull')}

	<!-- Zusätzliche Listen -->
	<section>
		<h3>{$t('dataSources')}</h3>
		<ul>
			<li>
				<a
					href="https://seer.cancer.gov/seerstat/variables/seer/raresiterecode/"
					target="_blank"
					rel="noopener noreferrer"
					>https://seer.cancer.gov/seerstat/variables/seer/raresiterecode/</a
				>
			</li>
			<li>
				<a
					href="https://www.suche-postleitzahl.org/downloads"
					target="_blank"
					rel="noopener noreferrer">https://www.suche-postleitzahl.org/downloads</a
				>
			</li>
			<li>
				<a href="https://www.bfarm.de/DE/Home/_node.html" target="_blank" rel="noopener noreferrer"
					>OPS / ICD10 / ICDO</a
				>
			</li>
		</ul>

		<h3>Icons</h3>
		<ul>
			<li>
				<a href="https://www.flaticon.com" target="_blank" rel="noopener noreferrer"
					>www.flaticon.com</a
				>
			</li>
			<li>
				<a href="https://icon-sets.iconify.design" target="_blank" rel="noopener noreferrer"
					>https://icon-sets.iconify.design</a
				>
			</li>
		</ul>
		<!--
       <h3>{$t("images")}</h3>
    <ul>
      <li>
        <a
          href="https://www.flaticon.com"
          target="_blank"
          rel="noopener noreferrer"
          >www.flaticon.com</a
        >
      </li>
      <li>
        <a
          href="https://icon-sets.iconify.design"
          target="_blank"
          rel="noopener noreferrer"
          >https://icon-sets.iconify.design</a
        >
      </li>
    </ul>
  -->
	</section>
</div>

<style global>
	/* Links in diesem Block (inkl. {@html}-Inhalt) einfärben */
	.footer-content-box a,
	.footer-content-box .translated-link {
		color: var(--linkColor) !important;
		text-decoration: none;
	}

	.footer-content-box a:hover,
	.footer-content-box .translated-link:hover {
		text-decoration: underline;
	}
</style>
