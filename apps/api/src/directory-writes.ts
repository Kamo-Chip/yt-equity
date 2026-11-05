import { db, eq } from "@yt-equity/db";
import { channelAliases, channels, claims, firms } from "@yt-equity/db/schema";
import type { ChannelEditor, FirmEditor } from "@yt-equity/contracts";
import type { z } from "zod";
import type { channelUpdateSchema, firmUpdateSchema } from "@yt-equity/contracts";
import { audit } from "./audit.js";
import { ApiFailure } from "./errors.js";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ChannelUpdate = z.infer<typeof channelUpdateSchema>;
type FirmUpdate = z.infer<typeof firmUpdateSchema>;
async function write<T extends {
  id: string;
}>(actor: string, action: string, entity: string, metadata: unknown, mutation: (tx: Transaction) => Promise<T | undefined>): Promise<T> {
  return db.transaction(async (tx) => {
    const record = await mutation(tx);
    if (!record)
      throw new ApiFailure(404, "NOT_FOUND", "Record not found.");
    await audit(tx, actor, action, entity, record.id, metadata);
    return record;
  });
}
export function createChannel(actor: string, data: ChannelEditor) {
  return write(actor, "created", "channel", data, async (tx) => (await tx.insert(channels).values(data).returning())[0]);
}
export function updateChannel(actor: string, id: string, data: ChannelUpdate) {
  return write(actor, "updated", "channel", data, async (tx) => (await tx.update(channels).set({ ...data, updatedAt: new Date() }).where(eq(channels.id, id)).returning())[0]);
}
export function deleteChannel(actor: string, id: string) {
  return write(actor, "deleted", "channel", undefined, async (tx) => {
    if ((await tx.select({ id: claims.id }).from(claims).where(eq(claims.channelId, id)).limit(1)).length)
      throw new ApiFailure(409, "HAS_CLAIMS", "Reassign this channel’s claims first.");
    await tx.delete(channelAliases).where(eq(channelAliases.channelId, id));
    return (await tx.delete(channels).where(eq(channels.id, id)).returning())[0];
  });
}
export function createFirm(actor: string, data: FirmEditor) {
  return write(actor, "created", "firm", data, async (tx) => (await tx.insert(firms).values(data).returning())[0]);
}
export function updateFirm(actor: string, id: string, data: FirmUpdate) {
  return write(actor, "updated", "firm", data, async (tx) => (await tx.update(firms).set(data).where(eq(firms.id, id)).returning())[0]);
}
export function deleteFirm(actor: string, id: string) {
  return write(actor, "deleted", "firm", undefined, async (tx) => {
    if ((await tx.select({ id: claims.id }).from(claims).where(eq(claims.firmId, id)).limit(1)).length)
      throw new ApiFailure(409, "HAS_CLAIMS", "Reassign this firm’s claims first.");
    return (await tx.delete(firms).where(eq(firms.id, id)).returning())[0];
  });
}
export function archiveRelationship(actor: string, id: string) {
  return write(actor, "archived", "claim", undefined, async (tx) => (await tx.update(claims).set({ published: false, reviewedAt: new Date() }).where(eq(claims.id, id)).returning())[0]);
}
