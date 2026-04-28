<script lang="ts">
	import { userStore } from '../../store/userStore';
	import { authStore } from '../../store/authStore';
	import { tokenService } from '../../services/tokenService.js';
	import { appPath, iconPath } from '$lib/path-utils';

	let currentUser = '';
	let currentRole = '';
	let primaryColor = '';
	userStore.subscribe((value: any) => {
		({ currentUser, currentRole, primaryColor } = value);
	});

	const logoutIcon = iconPath('sign-out.svg');
	const settingsIcon = iconPath('cog.svg');

	async function handleLogout() {
		try {
			// Get current tokens for logout
			const userData = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
			if (userData.keycloakTokens?.refresh_token) {
				// Import logout function dynamically to avoid circular dependencies
				const { logout } = await import('../../keyCloakHandlers/authentication.js');
				await logout(userData.keycloakTokens.refresh_token);
			}
		} catch (error) {
			console.error('Error during logout:', error);
		} finally {
			// Always clear local data and redirect
			tokenService.handleLogout();
			window.location.reload();
		}
	}
</script>

    <div style="display: flex;">
        <div class="user-info" style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; space-between;">
            <a href={appPath('/settings')} style="color:{primaryColor}">
                <img src={settingsIcon} alt="user" class="menuebar-icon" />
                {currentUser} </a>&nbsp;({currentRole})
        </div>
        <img src={logoutIcon} alt="logout" class="menuebar-icon" on:click={handleLogout} style="cursor: pointer;" />

    </div>
