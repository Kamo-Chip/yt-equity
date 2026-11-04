import { db, pool } from "./client.js";
import { seedCreatorChannel } from "./creator-channel.js";

try {
  const channel = await seedCreatorChannel(db);
  console.log(`Creator channel ready: ${channel.name} (${channel.handle}). No financial claims created.`);
} catch (cause) {
  console.error("Creator seed failed:", cause);
  process.exitCode = 1;
} finally {
  await pool.end();
}
