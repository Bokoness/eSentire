import { config } from 'dotenv';

config({ path: `${__dirname}/../.env`, quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set (copy server/.env.example to server/.env)');
}
// Never let tests touch the development database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
