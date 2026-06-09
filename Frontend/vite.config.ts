import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [sveltekit()],
    optimizeDeps: {
        exclude: ["@samply/lens"]
    },
    server: command === 'serve' ? {
        watch: {
            // Only use polling in development mode (when vite dev server is running)
            usePolling: true,
            interval: 2000,
            
            // Comprehensive ignore list for maximum performance
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/.svelte-kit/**',
                '**/dist/**',
                '**/build/**',
                '**/.vite/**',
                '**/coverage/**',
                '**/.idea/**',
                '**/.vscode/**',
                '**/__pycache__/**',
                '**/.cache/**',
                '**/.temp/**',
                '**/.tmp/**',
                '**/*.swp',
                '**/*.swo',
                '**/.DS_Store',
                '**/Thumbs.db',
                '**/*.log',
                '**/.eslintcache',
                '**/.prettierignore',
                '**/.dockerignore',
                '**/.gitignore',
                '**/README.md',
                '**/*.test.js',
                '**/*.spec.js'
            ]
        },
        // Configure headers for development mode
        middlewareMode: false,
        headers: {
            // Prevent caching of API endpoints in development
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    } : {}
}));
