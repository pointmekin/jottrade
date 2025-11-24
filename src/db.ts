// Neon
import { neon } from '@neondatabase/serverless'

let client: ReturnType<typeof neon>

export async function getClient() {
  if (!process.env.VITE_DATABASE_URL) {
    return undefined
  }
  if (!client) {
    client = neon(process.env.VITE_DATABASE_URL!)
  }
  return client
}

// Drizzle
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './db/schema';

const sql = neon(process.env.VITE_DATABASE_URL!);
export const db = drizzle(sql, { schema });
