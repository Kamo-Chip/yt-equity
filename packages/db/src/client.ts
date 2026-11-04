import dotenv from "dotenv";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) console.warn("DATABASE_URL is not configured; database calls will fail until it is set.");
export const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "" });
export const db = drizzle(pool, { schema });
