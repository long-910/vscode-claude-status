import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	mocha: {
		// Tests that write claudeStatus.* settings wait for VS Code to persist
		// settings.json, which can exceed mocha's 2s default on CI macOS runners.
		timeout: 10000,
	},
});
