const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;

	const content = fs.readFileSync(filePath, 'utf8');

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const separatorIndex = line.indexOf('=');
		if (separatorIndex === -1) continue;

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();

		if (key && process.env[key] === undefined) {
			process.env[key] = value.replace(/^["']|["']$/g, '');
		}
	}
}

const appName = process.env.APP_NAME || 'filmboom-vps-proxy';
const appDir = __dirname;

loadEnvFile(path.join(appDir, '.env'));

function pickBunInterpreter() {
	const candidates = [
		process.env.BUN_BIN,
		path.join(process.env.HOME || '', '.bun/bin/bun'),
		'/home/linux/.bun/bin/bun',
		'/root/.bun/bin/bun'
	].filter(Boolean);

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return 'bun';
}

module.exports = {
	apps: [
		{
			name: appName,
			cwd: appDir,
			script: path.join(appDir, 'server.js'),
			interpreter: pickBunInterpreter(),
			exec_mode: 'fork',
			instances: 1,
			watch: false,
			max_memory_restart: process.env.MAX_MEMORY_RESTART || '256M',
			env: {
				NODE_ENV: 'production',
				HOST: process.env.HOST || '0.0.0.0',
				PORT: process.env.PORT || '8787',
				ALLOWED_ORIGINS:
					process.env.ALLOWED_ORIGINS ||
					'https://film.meongplod.my.id,http://localhost:5173,http://localhost:4173',
				PROXY_SHARED_SECRET: process.env.PROXY_SHARED_SECRET || '',
				FETCH_TIMEOUT_MS: process.env.FETCH_TIMEOUT_MS || '15000'
			}
		}
	]
};
