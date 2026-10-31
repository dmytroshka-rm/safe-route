import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as { pool?: Pool };

const connectionString = process.env.DATABASE_URL ?? "postgresql://saferoute:saferoute_dev@localhost:5433/saferoute";

export const db = globalForDatabase.pool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") globalForDatabase.pool = db;
