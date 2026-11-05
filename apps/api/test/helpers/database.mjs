import { mkdtemp, readFile, writeFile, copyFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@yt-equity/db/schema";

export const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/drizzle/", import.meta.url));
export const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"));

// Use the production journal and Drizzle's migration ledger, including for upgrades.
export async function testDatabase(through = journal.entries.at(-1).idx) {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  let temporary;
  try {
    let folder = migrationsFolder;
    if (through !== journal.entries.at(-1).idx) {
      temporary = folder = await mkdtemp(join(tmpdir(), "yt-equity-migrations-"));
      const entries = journal.entries.filter(entry => entry.idx <= through);
      await mkdir(join(folder, "meta"));
      await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
      await Promise.all(entries.map(entry => copyFile(join(migrationsFolder, entry.tag + ".sql"), join(folder, entry.tag + ".sql"))));
    }
    await migrate(db, { migrationsFolder: folder });
    return { pg, db, schema, upgrade: () => migrate(db, { migrationsFolder }) };
  } catch (error) {
    await pg.close();
    throw error;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
