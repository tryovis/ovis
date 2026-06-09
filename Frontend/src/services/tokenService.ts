import { introspectToken, refreshToken, isTokenExpired, ensureValidToken } from '../keyCloakHandlers/authentication.js';
import { authStore } from '../store/authStore.js';
import { userStore } from '../store/userStore.js';
import { get } from 'svelte/store';

interface KeycloakTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  timestamp: number;
}

interface UserData {
  currentUser: string;
  currentRole: string;
  currentLanguage: string;
  currentTheme: boolean;
  primaryColorRGB: any;
  primaryColor: string;
  colorPalette: string[];
  paletteName: string;
  darkMode: boolean;
  pseudonymization: boolean;
  currentFilter: string;
  keycloakTokens?: KeycloakTokens;
}

interface IntrospectionResult {
  active: boolean;
  [key: string]: any;
}

/**
 * Token validation and refresh service
 * Handles automatic token validation and refresh on page reload
 */
class TokenService {
  private isValidating: boolean = false;

  /**
   * Initialize token validation on app startup
   * This should be called when the app loads
   */
  async initializeTokenValidation(): Promise<void> {
    if (this.isValidating) {
      console.log('Token validation already in progress');
      return;
    }

    this.isValidating = true;
    
    try {
      // Check if user is logged in via localStorage
      const loggedInUser = localStorage.getItem('loggedInUser');
      
      if (!loggedInUser) {
        console.log('No stored user found, user needs to login');
        this.handleLogout();
        return;
      }

      let userData: UserData;
      try {
        userData = JSON.parse(loggedInUser);
      } catch (parseError) {
        console.error('Failed to parse stored user data:', parseError);
        this.handleLogout();
        return;
      }
      
      if (!userData.keycloakTokens) {
        console.log('No Keycloak tokens found in stored user data');
        this.handleLogout();
        return;
      }

      const tokens = userData.keycloakTokens;
      
      // Check if token is expired
      if (isTokenExpired(tokens)) {
        console.log('Stored token is expired, attempting refresh');
        
        if (!tokens.refresh_token) {
          console.log('No refresh token available');
          this.handleLogout();
          return;
        }

        try {
          // Attempt to refresh the token
          const newTokens = await refreshToken(tokens.refresh_token);
          
          // Update stored tokens
          const updatedUserData: UserData = {
            ...userData,
            keycloakTokens: {
              ...newTokens,
              timestamp: Date.now()
            }
          };
          
          // Update localStorage and stores
          localStorage.setItem('loggedInUser', JSON.stringify(updatedUserData));
          userStore.set(updatedUserData);
          authStore.set(true);
          
          console.log('Token refreshed successfully');
          
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          this.handleLogout();
          return;
        }
      } else {
        // Token is still valid, verify it with the server
        try {
          const introspectionResult = await introspectToken(tokens.access_token) as IntrospectionResult;
          
          if (introspectionResult.active) {
            console.log('Token is valid, restoring session');
            
            // Restore user session
            userStore.set(userData);
            authStore.set(true);
          } else {
            console.log('Token introspection shows token is not active');
            this.handleLogout();
          }
        } catch (introspectError) {
          console.error('Token introspection failed:', introspectError);
          // If introspection fails, try refresh as fallback
          if (tokens.refresh_token) {
            try {
              console.log('Attempting token refresh as fallback');
              const newTokens = await refreshToken(tokens.refresh_token);
              
              const updatedUserData: UserData = {
                ...userData,
                keycloakTokens: {
                  ...newTokens,
                  timestamp: Date.now()
                }
              };
              
              localStorage.setItem('loggedInUser', JSON.stringify(updatedUserData));
              userStore.set(updatedUserData);
              authStore.set(true);
              
              console.log('Token refreshed successfully as fallback');
            } catch (fallbackError) {
              console.error('Fallback token refresh also failed:', fallbackError);
              this.handleLogout();
            }
          } else {
            this.handleLogout();
          }
        }
      }
      
    } catch (error) {
      console.error('Token validation error:', error);
      this.handleLogout();
    } finally {
      this.isValidating = false;
    }
  }

  /**
   * Handle logout by clearing all stored data
   */
  handleLogout(): void {
    console.log('Handling logout - clearing stored data');
    
    // Clear localStorage
    localStorage.removeItem('loggedInUser');
    
    // Reset stores
    authStore.set(false);
    userStore.set({
      currentUser: "",
      currentRole: "user",
      currentLanguage: "de",
      currentTheme: false,
      primaryColorRGB: {},
      primaryColor: "#000000",
      colorPalette: ["#000000", "#000000"],
      paletteName: "CCCMunich",
      darkMode: false,
      pseudonymization: false,
      currentFilter: ""
    });
  }

  /**
   * Get current valid tokens, refreshing if necessary
   * @returns {Promise<KeycloakTokens>} Valid token data
   */
  async getValidTokens(): Promise<KeycloakTokens> {
    const userData = get(userStore) as UserData;
    
    if (!userData.keycloakTokens) {
      throw new Error('No tokens available');
    }

    try {
      const validTokens = await ensureValidToken(userData.keycloakTokens);
      
      // If tokens were refreshed, update storage
      if (validTokens !== userData.keycloakTokens) {
        const updatedUserData: UserData = {
          ...userData,
          keycloakTokens: {
            ...validTokens,
            timestamp: Date.now()
          }
        };
        
        localStorage.setItem('loggedInUser', JSON.stringify(updatedUserData));
        userStore.set(updatedUserData);
      }
      
      return validTokens as KeycloakTokens;
    } catch (error) {
      console.error('Failed to get valid tokens:', error);
      this.handleLogout();
      throw error;
    }
  }

  /**
   * Check if user is currently authenticated
   * @returns {boolean} True if user is authenticated
   */
  isAuthenticated(): boolean {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser) return false;
    
    try {
      const userData: UserData = JSON.parse(loggedInUser);
      return !!(userData.keycloakTokens && !isTokenExpired(userData.keycloakTokens));
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const tokenService = new TokenService(); 