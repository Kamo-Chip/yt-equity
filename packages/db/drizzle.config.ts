import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url))
});

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! }
});
