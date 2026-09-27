// Loaded via Jest's `setupFiles` before any test module (including
// ConfigModule) reads process.env. dotenv.config() never overrides an
// already-set variable, so this - not .env - wins for the whole suite,
// while `npm run start` still gets the strong production values from
// .env. See auth.service.ts's argonOptions() for where this is read.
process.env.ARGON2_MEMORY_COST ??= '1024';
process.env.ARGON2_TIME_COST ??= '2';
