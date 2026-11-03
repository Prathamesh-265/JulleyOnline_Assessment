// Usage: npm test   (the API must already be running; see tests/README.md)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from './helpers/api.js';
import { buildWorld, destroyWorld } from './helpers/world.js';

const here = dirname(fileURLToPath(import.meta.url));

try {
  const res = await fetch(`${API}/api/health`);
  if (!res.ok) throw new Error(`health returned ${res.status}`);
} catch (e) {
  console.error(`Cannot reach the API at ${API} (${e.message}).\nStart it first with "npm run dev" in another terminal.`);
  process.exit(1);
}

console.log('Creating test organizations and users...');
const world = await buildWorld();
let code = 1;
try {
  const files = readdirSync(here).filter((f) => f.endsWith('.test.js')).sort().map((f) => join(here, f));
  const only = process.argv[2]; // npm test -- 06   runs just the files whose name contains "06"
  const picked = only ? files.filter((f) => f.includes(only)) : files;
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...picked], {
    stdio: 'inherit',
    env: { ...process.env, TEST_WORLD: JSON.stringify(world) },
  });
  code = run.status ?? 1;
} finally {
  console.log('Cleaning up test organizations...');
  await destroyWorld(world);
}
process.exit(code);
