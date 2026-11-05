import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const claimType = pgEnum("claim_type", ["funding", "acquisition"]);
export const claimStatus = pgEnum("claim_status", ["confirmed", "provisional", "disputed", "rejected"]);
export const evidenceTier = pgEnum("evidence_tier", ["official", "reputable", "community"]);
export const submissionStatus = pgEnum("submission_status", ["pending", "approved", "rejected"]);
export const workspaceRole = pgEnum("workspace_role", ["moderator", "admin"]);

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  handle: text("handle").unique(),
  name: text("name").notNull(),
  profilePictureUrl: text("profile_picture_url"),
  easterEgg: text("easter_egg"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
export const channelAliases = pgTable("channel_aliases", {
  id: uuid("id").defaultRandom().primaryKey(), channelId: uuid("channel_id").notNull().references(() => channels.id), alias: text("alias").notNull().unique()
});

export const firms = pgTable("firms", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull().unique(), website: text("website"),
  profilePictureUrl: text("profile_picture_url"), profilePictureBackground: text("profile_picture_background")
});

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(), channelId: uuid("channel_id").notNull().references(() => channels.id), firmId: uuid("firm_id").references(() => firms.id),
  type: claimType("type").notNull(), status: claimStatus("status").notNull().default("provisional"), confidence: integer("confidence").notNull().default(0), announcedAt: timestamp("announced_at", { withTimezone: true }), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), published: boolean("published").notNull().default(false), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const evidence = pgTable("evidence", {
  id: uuid("id").defaultRandom().primaryKey(), claimId: uuid("claim_id").notNull().references(() => claims.id), url: text("url").notNull(), title: text("title"), publisher: text("publisher"), tier: evidenceTier("tier").notNull(), notes: text("notes"), publishedAt: timestamp("published_at", { withTimezone: true })
}, (table) => [index("evidence_claim_id_idx").on(table.claimId)]);

export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(), kind: text("kind").notNull().default("correction"), channelId: text("channel_id"), payload: jsonb("payload").notNull(), status: submissionStatus("status").notNull().default("pending"), contactEmail: text("contact_email"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("submissions_pending_queue_idx").on(table.status, table.createdAt, table.id)]);
export const moderationDecisions = pgTable("moderation_decisions", {
  id: uuid("id").defaultRandom().primaryKey(), submissionId: uuid("submission_id").notNull().references(() => submissions.id), moderatorId: text("moderator_id").notNull(), decision: submissionStatus("decision").notNull(), note: text("note"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(), actorId: text("actor_id"), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), metadata: jsonb("metadata"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
export const moderatorInvitations = pgTable("moderator_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: text("invited_by").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// Better Auth's Drizzle adapter uses these tables by their default names.
export const user = pgTable("user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(), role: workspaceRole("role"), emailVerified: boolean("email_verified").notNull().default(false), image: text("image"), createdAt: timestamp("created_at").notNull(), updatedAt: timestamp("updated_at").notNull()
});
export const session = pgTable("session", {
  id: text("id").primaryKey(), expiresAt: timestamp("expires_at").notNull(), token: text("token").notNull().unique(), createdAt: timestamp("created_at").notNull(), updatedAt: timestamp("updated_at").notNull(), ipAddress: text("ip_address"), userAgent: text("user_agent"), userId: text("user_id").notNull().references(() => user.id)
});
export const account = pgTable("account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(), userId: text("user_id").notNull().references(() => user.id), accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"), accessTokenExpiresAt: timestamp("access_token_expires_at"), refreshTokenExpiresAt: timestamp("refresh_token_expires_at"), scope: text("scope"), password: text("password"), createdAt: timestamp("created_at").notNull(), updatedAt: timestamp("updated_at").notNull()
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(), expiresAt: timestamp("expires_at").notNull(), createdAt: timestamp("created_at"), updatedAt: timestamp("updated_at")
});
