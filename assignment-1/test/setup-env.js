// Runs per test file, before that file's imports (including AppModule ->
// ConfigModule.forRoot()) ever execute. dotenv.config() never overrides a
// variable already present in process.env, so setting these here first is
// what makes the app under test connect to the *test* database rather than
// whatever `.env` (loaded later, inside ConfigModule) points at.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

process.env.ARGON2_MEMORY_COST ??= '1024';
process.env.ARGON2_TIME_COST ??= '2';
