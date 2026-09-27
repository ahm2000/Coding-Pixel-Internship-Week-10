// Runs once, in Jest's main process, before any test file starts.
//
// W1: builds the schema in the test database by running the real
// migrations against it - the same migrations `npm run migration:run`
// applies in production, never a separate `synchronize: true` shortcut.
//
// X3: refuses to go anywhere near a database that looks like the
// development one. Comparing `.env.test` against `.env` (rather than
// hardcoding an expected name) means the guard still works if the test
// database is ever renamed, as long as it isn't *also* renamed to match
// dev.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

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
};
