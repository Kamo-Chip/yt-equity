import { normalizeChannelIdentifier } from "@yt-equity/contracts";
import { db,eq,or } from "@yt-equity/db";
import { channelAliases,channels } from "@yt-equity/db/schema";
import { inArray,sql } from "drizzle-orm";

// YouTube handles are case-insensitive; canonical UC channel IDs are not.
function identifierKey(identifier: string) {
  identifier = normalizeChannelIdentifier(identifier);
  return identifier.startsWith("UC") ? identifier : identifier.toLowerCase();
}

export async function resolveChannels(identifiers: string[]) {
  const keys = [...new Set(identifiers.map(identifierKey))];
  const [directChannels, aliasMatches] = await Promise.all([
    db.select().from(channels).where(or(
      inArray(channels.channelId, identifiers.map(normalizeChannelIdentifier)),
      inArray(sql`lower(${channels.handle})`, keys)
    )),
    db.select({ alias: channelAliases.alias, channel: channels })
      .from(channelAliases).innerJoin(channels, eq(channelAliases.channelId, channels.id))
      .where(inArray(sql`case when left(${channelAliases.alias}, 2) = 'UC' then ${channelAliases.alias} else lower(${channelAliases.alias}) end`, keys))
  ]);
  const byKey = new Map<string, typeof channels.$inferSelect>();
  for (const match of aliasMatches) byKey.set(identifierKey(match.alias), match.channel);
  // Current identifiers take precedence over historical aliases.
  for (const channel of directChannels) {
    byKey.set(channel.channelId, channel);
    if (channel.handle) byKey.set(identifierKey(channel.handle), channel);
  }
  // Keep the caller's spelling so batch responses and extension caches agree.
  return new Map(identifiers.map((identifier) => [identifier, byKey.get(identifierKey(identifier))]));
}
