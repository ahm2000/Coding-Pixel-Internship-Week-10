// Runs once, in Jest's main process, before the journey test starts.
//
// W1: builds the schema in the test database by running the real
// migrations - the same migrations `npm run migration:run` applies in
// production.
//
// X3 (guard): refuses to go anywhere near a database that looks like the
// development one, by comparing `.env.test` against `.env` directly
// rather than hardcoding an expected name.
//
// X3 (repeatability): the journey is one continuous, order-dependent
// story ("register this exact user, then log in as them..."), so unlike
// assignment-1's per-test truncation this truncates *once*, right here,
// before the single test file runs - every invocation of `npm test`
// starts from a genuinely empty database, whether or not the previous
// invocation finished cleanly. That's what makes "run it five times in a
// row" produce five identical green runs instead of the second run
// failing on a duplicate email.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');

function readEnvFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};
  return dotenv.parse(fs.readFileSync(filePath));
}

module.exports = async function globalSetup() {
  const devEnv = readEnvFile('.env');
  const testEnv = readEnvFile('.env.test');

  const pointsAtSameDatabase =
    !!testEnv.DB_NAME &&
    devEnv.DB_HOST === testEnv.DB_HOST &&
    devEnv.DB_PORT === testEnv.DB_PORT &&
    devEnv.DB_NAME === testEnv.DB_NAME;

  if (pointsAtSameDatabase) {
    throw new Error(
      `Refusing to run the e2e suite: .env.test points at the same database as .env ` +
        `(${testEnv.DB_HOST}:${testEnv.DB_PORT}/${testEnv.DB_NAME}). Point .env.test at a ` +
        `separate, disposable database before running the suite again.`,
    );
  }

  if (!testEnv.DB_NAME || !testEnv.DB_NAME.toLowerCase().endsWith('_test')) {
    throw new Error(
      `Refusing to run the e2e suite: DB_NAME in .env.test is "${testEnv.DB_NAME}", which ` +
        `doesn't look like a test database (expected a name ending in "_test").`,
    );
  }

  execSync('npm run migration:run:test', { cwd: ROOT, stdio: 'inherit' });

  const client = new Client({
    host: testEnv.DB_HOST,
    port: Number(testEnv.DB_PORT),
    user: testEnv.DB_USERNAME,
    password: testEnv.DB_PASSWORD,
    database: testEnv.DB_NAME,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
};
