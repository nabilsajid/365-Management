// Runs tests/db/smoke.sql against a database that already has the migrations
// applied. Everything happens in one transaction that is rolled back.
//   npm run test:db
// Needs psql on PATH and DATABASE_URL (in the environment or .env.local),
// e.g. postgresql://postgres:postgres@127.0.0.1:54322/postgres for `supabase start`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Set DATABASE_URL (in the environment or .env.local) to run the database tests.');
  process.exit(1);
}

const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', 'tests/db/smoke.sql'], {
  encoding: 'utf8',
});
if (result.error) {
  console.error(`Could not run psql: ${result.error.message}`);
  process.exit(1);
}

const output = `${result.stdout}\n${result.stderr}`;
const passed = output.split('\n').filter((line) => line.includes('NOTICE:  ok - '));
for (const line of passed) console.log(line.slice(line.indexOf('ok - ')));

if (result.status !== 0) {
  console.error(output.split('\n').filter((line) => /ERROR|FAILED/.test(line)).join('\n') || output);
  process.exit(1);
}
console.log(`\n${passed.length} database checks passed.`);
