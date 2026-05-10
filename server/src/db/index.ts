import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is required to start the API server');
}

const pool = new Pool({ connectionString });
let configuredSessionTimeZone = 'UTC';

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

const applySessionTimeZone = async (client: Pool | PoolClient, timezone: string) => {
    await client.query(`SET TIME ZONE '${escapeSqlLiteral(timezone)}'`);
};

pool.on('connect', (client) => {
    void applySessionTimeZone(client, configuredSessionTimeZone).catch((error) => {
        console.error('[DB] failed to apply session time zone:', error);
    });
});

export const db = drizzle(pool, { schema });
export const setDatabaseSessionTimeZone = async (timezone: string) => {
    configuredSessionTimeZone = timezone;
    await applySessionTimeZone(pool, timezone);
};

export const getDatabaseSessionTimeZone = () => configuredSessionTimeZone;
