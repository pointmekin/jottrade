// import { neon } from '@neondatabase/serverless'

// let client: ReturnType<typeof neon>

// export async function getClient() {
//   if (!process.env.VITE_DATABASE_URL) {
//     return undefined
//   }
//   if (!client) {
//     client = await neon(process.env.VITE_DATABASE_URL!)
//   }
//   return client
// }

import { drizzle } from 'drizzle-orm/node-postgres';
export const db = drizzle(process.env.VITE_DATABASE_URL ?? '');
