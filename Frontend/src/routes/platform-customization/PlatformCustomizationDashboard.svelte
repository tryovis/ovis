<script lang="ts">
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { colorArrays } from '../../components/ColorArray.js';
	import {
		updatePlatformConfiguration,
		uploadPlatformDocument,
		type PlatformDocumentType,
		type PlatformLanguage
	} from '../../graphQl/gql-platformCustomization';
	import { t } from '../../store/languageStore';
	import {
		applyPlatformConfiguration,
		loadPlatformConfiguration,
		platformConfigStore,
		platformDocumentUrl
	} from '../../store/platformConfigStore';
	import { userStore } from '../../store/userStore';
	import { iconPath } from '$lib/path-utils';

	const MAX_DOCUMENT_SIZE = 8 * 1024 * 1024;
	const settingsIcon = iconPath('cog.svg');
	const backIcon = iconPath('back.svg');
	const infoIcon = iconPath('info-outlined.svg');
	const documentTypes: { type: PlatformDocumentType; titleKey: string; tooltipKey: string }[] = [
		{
			type: 'USER_AGREEMENT',
			titleKey: 'platformUsageAgreement',
			tooltipKey: 'platformUsageAgreementTooltip'
		},
		{
			type: 'DATA_ACCESS',
			titleKey: 'platformDataAccessDocument',
			tooltipKey: 'platformDataAccessDocumentTooltip'
		}
	];
	const languages: { value: PlatformLanguage; label: string; icon: string }[] = [
		{ value: 'de', label: 'Deutsch', icon: iconPath('de.png') },
		{ value: 'en', label: 'English', icon: iconPath('en.png') }
	];

	const initialConfiguration = get(platformConfigStore);
	let selectedPaletteName = initialConfiguration.colorTheme;
	let selectedPalette: string[] = [...initialConfiguration.colorPalette];
	let systemLanguage: PlatformLanguage = initialConfiguration.systemLanguage;
	let saving = false;
	let saveError = '';
	let uploadingSlot = '';
	let documentMessage = '';
	let documentError = '';

	onMount(async () => {
		const configuration = await loadPlatformConfiguration();
		selectedPaletteName = configuration.colorTheme;
		selectedPalette = [...configuration.colorPalette];
		systemLanguage = configuration.systemLanguage;
	});

	async function choosePalette(name: string, colors: string[]) {
		if (saving || name === selectedPaletteName) return;
		const previousName = selectedPaletteName;
		const previousPalette = [...selectedPalette];
		selectedPaletteName = name;
		selectedPalette = [...colors];
		if (!(await saveConfiguration())) {
			selectedPaletteName = previousName;
			selectedPalette = previousPalette;
		}
	}

	async function chooseLanguage(language: PlatformLanguage) {
		if (saving || language === systemLanguage) return;
		const previousLanguage = systemLanguage;
		systemLanguage = language;
		if (!(await saveConfiguration())) systemLanguage = previousLanguage;
	}

	function goBack() {
		window.history.back();
	}

	async function saveConfiguration(): Promise<boolean> {
		saving = true;
		saveError = '';
		try {
			const configuration = await updatePlatformConfiguration({
				colorTheme: selectedPaletteName,
				colorPalette: selectedPalette,
				systemLanguage,
				updatedBy: get(userStore).currentUser
			});
			applyPlatformConfiguration(configuration);
			return true;
		} catch (error) {
			saveError = error instanceof Error ? error.message : $t('platformSettingsSaveError');
			return false;
		} finally {
			saving = false;
		}
	}

	const slotKey = (type: PlatformDocumentType, language: PlatformLanguage) => `${type}:${language}`;

	async function selectDocument(
		type: PlatformDocumentType,
		language: PlatformLanguage,
		event: Event
	) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		documentMessage = '';
		documentError = '';
		try {
			await uploadDocument(type, language, file);
		} finally {
			input.value = '';
		}
	}

	async function uploadDocument(
		type: PlatformDocumentType,
		language: PlatformLanguage,
		file: File
	) {
		const key = slotKey(type, language);
		documentMessage = '';
		documentError = '';
		if ((file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf')) {
			documentError = $t('platformDocumentPdfOnly');
			return;
		}
		if (file.size > MAX_DOCUMENT_SIZE) {
			documentError = $t('platformDocumentTooLarge');
			return;
		}

		uploadingSlot = key;
		try {
			await uploadPlatformDocument({
				type,
				language,
				filename: file.name,
				contentType: 'application/pdf',
				dataBase64: await fileToBase64(file),
				updatedBy: get(userStore).currentUser
			});
			await loadPlatformConfiguration(true);
			documentMessage = $t('platformDocumentUploaded');
		} catch (error) {
			documentError = error instanceof Error ? error.message : $t('platformDocumentUploadError');
		} finally {
			uploadingSlot = '';
		}
	}

	function documentFor(type: PlatformDocumentType, language: PlatformLanguage) {
		return $platformConfigStore.documents.find(
			(document) => document.type === type && document.language === language
		);
	}

	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error($t('platformDocumentUploadError')));
			reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
			reader.readAsDataURL(file);
		});
	}

	function formatSize(size: number) {
		return `${(size / 1024).toFixed(0)} KB`;
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleString(systemLanguage === 'de' ? 'de-DE' : 'en-GB');
	}
</script>

<div class="platform-settings">
	<div class="box_style box_level2 table-chart">
		<h1 style="padding-left:10px">
			{$t('platformCustomization')}
			<img
				src={settingsIcon}
				alt="admin"
				style="height:40px;vertical-align: text-bottom;"
				class="menuebar-icon"
			/>
			<button type="button" class="iconRoundButton tooltip settings-info">
				<span class="tooltiptext">{@html $t('platformAppearanceTooltip')}</span>
				<img src={infoIcon} alt="info" class="iconRound" />
			</button>
			<button on:click={goBack} class="iconRoundButton">
				<img src={backIcon} alt="back" class="iconRound" />
			</button>
		</h1>
	</div>

	<div class="box_style box_level2 settings-section">
		<div class="labeldiv"><strong>{$t('platformSystemColorTheme')}:</strong></div>

		{#each colorArrays as { name, colors }}
			<label class:selected={selectedPaletteName === name} class="palette-option">
				<input
					type="radio"
					name="platform-palette"
					checked={selectedPaletteName === name}
					disabled={saving}
					on:change={() => choosePalette(name, colors)}
				/>
				<span class="swatches" aria-label={name}>
					{#each colors as color}
						<span class="color-point" style:background-color={color} />
					{/each}
				</span>
				<strong>{name}</strong>
			</label>
		{/each}

		{#if !colorArrays.some((palette) => palette.name === selectedPaletteName)}
			<label class="palette-option selected custom-preview">
				<input type="radio" name="platform-palette" checked disabled />
				<span class="swatches" aria-label={selectedPaletteName}>
					{#each selectedPalette as color}
						<span class="color-point" style:background-color={color} />
					{/each}
				</span>
				<strong>{selectedPaletteName}</strong>
			</label>
		{/if}
	</div>

	<div class="box_style box_level2 table-chart settings-section">
		<div class="labeldiv">
			<strong id="system-language-label">{$t('platformSystemLanguage')}:</strong>
		</div>

		<div role="group" aria-labelledby="system-language-label">
			{#each languages as language}
				<label class="language-option">
					<input
						type="radio"
						name="system-language"
						value={language.value}
						checked={systemLanguage === language.value}
						disabled={saving}
						on:change={() => chooseLanguage(language.value)}
					/>
					<span>{language.label}</span>
					<img src={language.icon} class="language-flag menuebar-icon no-invert" alt={language.label} />
				</label>
			{/each}
		</div>

	</div>

	{#each documentTypes as documentType}
		<div class="box_style box_level2 table-chart settings-section">
			<div class="labeldiv">
				<strong title={$t(documentType.tooltipKey)}>{$t(documentType.titleKey)}:</strong>
			</div>

			<div class="document-list">
				{#each languages as language}
					{@const existingDocument = documentFor(documentType.type, language.value)}
					{@const key = slotKey(documentType.type, language.value)}
					<div class="document-row">
						<div class="document-language">
							<img src={language.icon} class="language-flag menuebar-icon no-invert" alt="" />
							<strong>{language.label}</strong>
						</div>

						<div class="document-current">
							{#if existingDocument}
								<a
									class="document-link"
									href={platformDocumentUrl($platformConfigStore, documentType.type, language.value)}
								>
									{existingDocument.filename} · {formatSize(existingDocument.size)}
								</a>
								<small>{formatDate(existingDocument.updatedAt)}</small>
							{:else}
								<a
									class="document-link"
									href={platformDocumentUrl($platformConfigStore, documentType.type, language.value)}
								>
									{$t('platformOpenFallback')}
								</a>
								<small>{$t('platformEnvironmentFallback')}</small>
							{/if}
						</div>

						<div class="document-upload">
							<input
								id={`document-${key}`}
								type="file"
								accept="application/pdf,.pdf"
								disabled={uploadingSlot !== ''}
								on:change={(event) => selectDocument(documentType.type, language.value, event)}
							/>
							{#if uploadingSlot === key}<span>{$t('platformUploading')}</span>{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	{#if documentMessage}<p class="floating-message message success">{documentMessage}</p>{/if}
	{#if documentError}<p class="floating-message message error">{documentError}</p>{/if}
	{#if saveError}<p class="floating-message message error">{saveError}</p>{/if}
</div>

<style>
	.platform-settings {
		position: relative;
		min-height: 100%;
	}

	.settings-section {
		min-width: 0;
	}

	.settings-info {
		vertical-align: middle;
	}

	.settings-info .tooltiptext {
		font-size: 14px;
		font-weight: 400;
	}

	.labeldiv,
	.palette-option,
	.language-option,
	.swatches,
	.document-language,
	.document-upload {
		display: flex;
		align-items: center;
	}

	.palette-option,
	.language-option {
		gap: 10px;
		margin-left: 100px;
		cursor: pointer;
	}

	.palette-option {
		min-height: 32px;
	}

	.palette-option.selected {
		color: var(--link-color, #017c40);
	}

	.palette-option input,
	.language-option input {
		margin: 0;
	}

	.custom-preview {
		cursor: default;
	}

	.swatches {
		width: min(360px, 55vw);
	}

	.color-point {
		min-width: 8px;
		height: 22px;
		border: 1px solid rgba(0, 0, 0, 0.2);
		flex: 1 1 0;
	}

	.language-flag {
		width: 20px;
		height: 20px;
		object-fit: contain;
	}

	.document-list {
		display: flex;
		gap: 8px;
		margin: 8px 0 6px 100px;
		flex-direction: column;
	}

	.document-row {
		display: grid;
		align-items: center;
		gap: 12px;
		min-width: 0;
		justify-content: start;
		grid-template-columns: 110px minmax(280px, 400px) max-content;
	}

	.document-language {
		gap: 8px;
	}

	.document-current {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}

	.document-current small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.75;
	}

	.document-link {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.document-upload {
		gap: 8px;
		min-width: 0;
	}

	.document-upload input {
		width: min(340px, 38vw);
	}

	.message {
		font-weight: 600;
	}

	.success {
		color: #19733a;
	}

	.error {
		color: #b42318;
	}

	.floating-message {
		position: fixed;
		right: 18px;
		bottom: 12px;
		z-index: 2;
		padding: 8px 12px;
		border-radius: 5px;
		background: #fff;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
	}

	@media (max-width: 900px) {
		.document-row {
			align-items: flex-start;
			grid-template-columns: 110px minmax(0, 1fr);
		}

		.document-upload {
			grid-column: 2;
		}
	}

	@media (max-width: 650px) {
		.palette-option,
		.language-option,
		.document-list {
			margin-left: 32px;
		}

		.swatches {
			width: min(280px, 60vw);
		}

		.document-row {
			display: flex;
			align-items: flex-start;
			flex-direction: column;
		}

		.document-upload {
			width: 100%;
		}
	}
</style>
