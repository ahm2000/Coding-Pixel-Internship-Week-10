// Loaded via Jest's `setupFiles`, before any test file's imports run - in
// particular, before AppConfigModule's ConfigModule.forRoot() ever reads
// process.env. dotenv.config() never overrides an already-set variable,
// so this - not `.env` - wins for the whole suite, while `npm run start`
// still gets the real values from `.env`.
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
