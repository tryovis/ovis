<script lang="ts">
	import { onMount } from 'svelte';
	import { variantStore } from '../store/variantStore.js';
	import { authStore } from '../store/authStore.js';
	import { getUser } from '../graphQl/gql-userManagement';
	import { userStore } from '../store/userStore';
	import { colorArrays } from '../components/ColorArray.js';
	import { login } from '../keyCloakHandlers/authentication.js';
	import { getUserInfo } from '../keyCloakHandlers/userManagement.js';
	import { tokenService } from '../services/tokenService.js';
	import { iconPath, publicAssetPath } from '$lib/path-utils';
	import { env } from '$env/dynamic/public';

	interface KeycloakTokens {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		timestamp: number;
	}

	let showContactInfo = false;
	let username = '';
	let password = '';
	let showChangePassword = false;
	let showAccessInfo = false;
	let oldPassword = '';
	let newPassword = '';
	let confirmNewPassword = '';
	const technicalAdminName = env.PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_NAME?.trim() || 'Local Admin';
	const technicalAdminEmail = env.PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_EMAIL?.trim() || '';
	let language = env.PUBLIC_SYSTEM_START_LANGUAGE?.trim() || 'en';
	let hasLDAP: boolean = env.PUBLIC_LDAP_ENABLED === 'true';
	let isDemo: boolean =
	env.PUBLIC_IMPORT_MODE?.trim().toUpperCase() === 'DEMO' ||
	env.PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_NAME?.trim() === 'Daniel Nasseh';
	let isLoadingAuth = true;

	let isCCP: boolean;
	let loginEnabled: boolean;

	variantStore.subscribe((value: any) => {
		({ isCCP, loginEnabled } = value);
	});

	isCCP = false;

	onMount(async () => {
		console.log('Has LDAP?', hasLDAP);
		console.log('Is CCP?', isCCP);
		console.log('Is Demo?', isDemo);
		try {
			if (!loginEnabled) {
				await autoLogin();
			}
		} catch (error) {
			console.error('Error during onMount auth check:', error);
		} finally {
			isLoadingAuth = false;
		}
	});

	async function autoLogin() {
		console.log('AUTO LOGIN');
		try {
			const users = await getUser(null, 100);
			const defaultUser = users.find((u: any) => u._id === 'ovis-root') || users[0];

			if (!defaultUser) {
				console.error('Default user not found and no users available');
				return;
			}

			const selectedPalette = colorArrays.find((p) => p.name === defaultUser.colorTheme);

			const userToStore = {
				currentUser: defaultUser._id,
				currentRole: defaultUser.role,
				currentFilter: defaultUser.userFilter?.[defaultUser.userFilter.length - 1] ?? null,
				darkMode: defaultUser.darkMode,
				pseudonymization: defaultUser.pseudonymization,
				paletteName: defaultUser.colorTheme,
				colorPalette: selectedPalette?.colors ?? [],
				primaryColor: selectedPalette?.colors?.[0] ?? '#000000',
				primaryColorRGB: hexToRgb(selectedPalette?.colors?.[0]) ?? { r: 0, g: 0, b: 0 },
				currentLanguage: language,
				currentTheme: false
			};

			userStore.set(userToStore);
			localStorage.setItem('loggedInUser', JSON.stringify(userToStore));
			authStore.set(true);
		} catch (error) {
			console.error('Auto-login error:', error);
			isLoadingAuth = false;
		}
	}

	function toggleLanguage() {
		language = language === 'en' ? 'de' : 'en';
	}

	async function handleLoginClick() {
		try {
			const authResult = (await login(username, password)) as {
				access_token: string;
				refresh_token: string;
				expires_in: number;
			};
			console.log('Keycloak Authentication Result:', authResult);

			try {
				const keycloakUserInfo = await getUserInfo(authResult.access_token);
				console.log('Keycloak User Info:', keycloakUserInfo);
			} catch (userInfoError) {
				console.error('Error fetching Keycloak user info:', userInfoError);
			}

			const users = await getUser(null, 100);
			const matchingUser = users.find((u: any) => u._id === username);

			if (!matchingUser) {
				alert('Benutzerkennung in OVIS noch nicht vorhanden.');
				return;
			}

			if (matchingUser.status !== 'active') {
				alert(
					'Benutzer wurde in OVIS angelegt, aber die Benutzung wurde noch nicht freigegeben. Bitte kontaktieren Sie Ihren lokalen OVIS-Administrator.'
				);
				return;
			}

			const selectedPalette = colorArrays.find((p) => p.name === matchingUser.colorTheme);

			const userToStore = {
				currentUser: matchingUser._id,
				currentRole: matchingUser.role,
				currentFilter: matchingUser.userFilter?.[matchingUser.userFilter.length - 1] ?? null,
				darkMode: matchingUser.darkMode,
				pseudonymization: matchingUser.pseudonymization,
				paletteName: matchingUser.colorTheme,
				colorPalette: selectedPalette?.colors ?? [],
				primaryColor: selectedPalette?.colors?.[0] ?? '#000000',
				primaryColorRGB: hexToRgb(selectedPalette?.colors?.[0]) ?? { r: 0, g: 0, b: 0 },
				currentLanguage: language,
				currentTheme: false,
				keycloakTokens: {
					access_token: authResult.access_token,
					refresh_token: authResult.refresh_token,
					expires_in: authResult.expires_in,
					timestamp: Date.now()
				}
			};

			userStore.set(userToStore);
			localStorage.setItem('loggedInUser', JSON.stringify(userToStore));
			authStore.set(true);
		} catch (error) {
			console.error('Login error:', error);
			if (error instanceof Error) {
				if (error.name === 'AuthenticationError') {
					alert(language === 'en' ? 'Invalid credentials' : 'Ungültige Anmeldedaten');
				} else {
					alert(
						language === 'en'
							? 'Login failed. Please try again.'
							: 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.'
					);
				}
			}
		}
	}

	function hexToRgb(hex: string | undefined) {
		if (!hex) return null;
		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16)
			  }
			: null;
	}
	function handleChangePasswordClick() {
		console.log('Change Password button clicked');
		console.log('Username:', username);
		console.log('Old Password:', oldPassword);
		console.log('New Password:', newPassword);
		console.log('Confirm New Password:', confirmNewPassword);
	}

	// Reaktive Download-Pfade je nach Sprache
	$: authPath =
		language === 'en'
			? publicAssetPath('/downloads/ovis_authorization_en_template.pdf')
			: publicAssetPath('/downloads/ovis_authorization_de_template.pdf');

	$: usagePath =
		language === 'en'
			? publicAssetPath('/downloads/ovis_userAgreement_en_template.pdf')
			: publicAssetPath('/downloads/ovis_userAgreement_de_template.pdf');
</script>

{#if !isLoadingAuth && !$authStore && loginEnabled}
	<div
		class="background"
		style="background-image: url('{publicAssetPath('/loginBackground.png')}')"
	>
		<div class="language-switch" on:click={toggleLanguage}>
			<img src={iconPath(`${language === 'de' ? 'en' : 'de'}.png`)} alt="Language Flag" />
		</div>
		<div class="login-container">
			<img src={publicAssetPath('/Ovis_logo.svg')} alt="Ovis Logo" class="logo" />

			{#if showContactInfo}
				<div class="contact-info" role="dialog" aria-labelledby="contact-info-title">
					<h3 id="contact-info-title">
						{language === 'en' ? 'Technical Site Coordinator' : 'Technischer Standortkoordinator'}
					</h3>
					<p>
						{language === 'en'
							? 'Responsible for user logins and access management.'
							: 'Verantwortlich für Benutzer-Logins und Freischaltungen.'}
					</p>
					<p><strong>{technicalAdminName}</strong></p>
					<p>Email: {technicalAdminEmail}</p>
					<br />
					<h3>
						{language === 'en'
							? 'Responsible for Website Development'
							: 'Verantwortlicher: Webseiten Entwicklung'}
					</h3>
					<p>Dr. Daniel Nasseh (Entwicklung)</p>
					<p>Email: daniel.nasseh@med.uni-muenchen.de</p>
					<div class="change-password" on:click={() => (showContactInfo = false)}>
						{language === 'en' ? 'Back' : 'Zurück'}
					</div>
				</div>
			{:else if showChangePassword && !hasLDAP && !isCCP}
				<h2>{language === 'en' ? 'Change Password' : 'Passwort ändern'}</h2>
				<input
					type="text"
					placeholder={language === 'en' ? 'Username' : 'Benutzername'}
					bind:value={username}
				/>
				<input
					type="password"
					placeholder={language === 'en' ? 'Old Password' : 'Altes Passwort'}
					bind:value={oldPassword}
				/>
				<input
					type="password"
					placeholder={language === 'en' ? 'New Password' : 'Neues Passwort'}
					bind:value={newPassword}
				/>
				<input
					type="password"
					placeholder={language === 'en' ? 'Confirm New Password' : 'Neues Passwort bestätigen'}
					bind:value={confirmNewPassword}
				/>
				<button on:click={handleChangePasswordClick}
					>{language === 'en' ? 'Confirm' : 'Bestätigen'}</button
				>
				{#if !isCCP}
					<div class="change-password" on:click={() => (showChangePassword = false)}>
						{language === 'en' ? 'Back' : 'Zurück'}
					</div>
				{/if}
			{:else if showAccessInfo || isCCP}
				<h2>{language === 'en' ? 'Access Authorization' : 'Zugangsberechtigung'}</h2>
				<p style="max-width: 400px; margin: auto; margin-bottom: 1rem;">
					{language === 'en'
						? 'To log into OVIS, you must obtain authorization according to site requirements and confirm that you have read the usage agreement.'
						: 'Um sich in OVIS einzuloggen, müssen Sie eine Berechtigung nach den Vorgaben des Standorts einholen und bestätigen, dass Sie die Nutzungsordnung gelesen haben.'}
				</p>

				<a href={authPath} download={authPath.split('/').pop()}>
					{language === 'en' ? 'Obtain Authorization' : 'Berechtigung einholen'}
				</a>
				|
				<a href={usagePath} download={usagePath.split('/').pop()}>
					{language === 'en' ? 'Usage Agreement' : 'Nutzungsordnung'}
				</a>

				<p>
					{language === 'en'
						? 'Technically, the requirements can then be implemented by your site admin.'
						: 'Technisch können die Vorgaben dann von Ihrem Standort-Admin umgesetzt werden.'}
				</p>
				<a href="#" on:click|preventDefault={() => (showContactInfo = true)}
					>{language === 'en' ? 'Contact Details' : 'Kontaktdaten'}</a
				>
				{#if !isCCP}
					<div class="change-password" on:click={() => (showAccessInfo = false)}>
						{language === 'en' ? 'Back' : 'Zurück'}
					</div>
				{/if}
			{:else if !isCCP}
				<h2>{language === 'en' ? 'Login' : 'Anmelden'}</h2>

				{#if isDemo}
					<div class="demo-credentials">
						{#if language === 'en'}
							Demo credentials: user: <strong>test</strong>, pw: <strong>test</strong>
						{:else}
							Demo-Zugang: User: <strong>test</strong>, PW: <strong>test</strong>
						{/if}
					</div>
				{/if}

				<input
					type="text"
					placeholder={language === 'en' ? 'Username' : 'Benutzername'}
					bind:value={username}
				/>
				<input
					type="password"
					placeholder={language === 'en' ? 'Password' : 'Passwort'}
					bind:value={password}
				/>
				<button on:click={handleLoginClick}>{language === 'en' ? 'Login' : 'Anmelden'}</button>
				{#if !hasLDAP && !isCCP}
					<div class="change-password" on:click={() => (showChangePassword = true)}>
						{language === 'en' ? 'Change Password' : 'Passwort ändern'}
					</div>
				{/if}
			{/if}

			<div class="extra-info">
				{#if !showAccessInfo && !showChangePassword && !showContactInfo && !isCCP}
					<a href="#" on:click|preventDefault={() => (showAccessInfo = true)}
						>{language === 'en' ? 'How to gain access?' : 'Zugang erhalten?'}</a
					>
					|
					<a href="#" on:click|preventDefault={() => (showContactInfo = true)}
						>{language === 'en' ? 'Contact Details' : 'Kontaktdaten'}</a
					>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.background {
		width: 100vw;
		height: 100vh;
		background: url('/loginBackground.png') no-repeat center center;
		background-size: cover;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.language-switch {
		position: absolute;
		top: 20px;
		right: 20px;
		cursor: pointer;
	}
	.language-switch img {
		width: 30px;
		height: auto;
	}
	.login-container {
		background: rgba(255, 255, 255, 0.8);
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
		text-align: center;
	}

	.login-container input {
		display: block;
		width: 100%;
		margin: 0.5rem 0;
		padding: 0.5rem;
	}
	.logo {
		width: 150px;
		margin-bottom: 1rem;
	}
	.extra-info {
		margin-top: 1rem;
	}
	.change-password,
	.extra-info a {
		color: blue;
		cursor: pointer;
		text-decoration: none;
		margin-top: 1rem;
	}
	.demo-credentials {
		margin: 0.75rem 0 1rem 0;
		padding: 0.75rem 1rem;
		border: 1px solid #d00;
		border-radius: 6px;
		background: rgba(255, 0, 0, 0.08);
		color: #b00000;
		font-weight: 600;
	}
</style>
