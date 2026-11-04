import type { db } from "./client.js";
import { channels } from "./schema.js";

export const creatorChannel = {
  channelId: "UC4GyUVKO5_kF0eC7jP9Rjww",
  handle: "@kamoio",
  name: "Kamo IO",
  easterEgg: "creator",
};

// This channel has no financial relationship to seed.
export async function seedCreatorChannel(database: Pick<typeof db, "insert">) {
  const [channel] = await database.insert(channels).values(creatorChannel)
    .onConflictDoUpdate({
      target: channels.channelId,
      set: { handle: creatorChannel.handle, name: creatorChannel.name, easterEgg: creatorChannel.easterEgg, updatedAt: new Date() },
    }).returning();
  return channel;
}
