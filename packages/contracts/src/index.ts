import { z } from "zod";

export const claimTypeSchema = z.enum(["funding", "acquisition"]);
export const claimStatusSchema = z.enum([
  "confirmed",
  "provisional",
  "disputed",
]);
export const evidenceTierSchema = z.enum([
  "official",
  "reputable",
  "community",
]);
export const submissionKindSchema = z.enum([
  "new_channel",
  "correction",
  "dispute",
  "source",
]);
export function normalizeChannelIdentifier(value: string) {
  try { return decodeURIComponent(value).trim().normalize("NFC"); }
  catch { return value.trim().normalize("NFC"); }
}
export const channelIdentifierSchema = z.preprocess(
  value => typeof value === "string" ? normalizeChannelIdentifier(value) : value,
  z.string().min(1).max(120).regex(/^(UC[a-zA-Z0-9_-]+|@?[\p{L}\p{M}\p{N}._-]+)$/u),
);

export const channelHandleSchema = z.preprocess(
  value => typeof value === "string" ? normalizeChannelIdentifier(value) : value,
  z.string().min(1).max(120).regex(/^@[\p{L}\p{M}\p{N}._-]+$/u),
);

export const sourceSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().max(240).optional(),
  publisher: z.string().trim().max(160).optional(),
  publishedAt: z.string().datetime().optional(),
  tier: evidenceTierSchema,
  notes: z.string().trim().max(2000).optional(),
});
export const submissionSchema = z.object({
  kind: submissionKindSchema.default("correction"),
  channelId: channelIdentifierSchema,
  claimId: z.string().uuid().optional(),
  channelHandle: z.string().trim().max(120).optional(),
  type: claimTypeSchema.optional(),
  explanation: z.string().trim().min(10).max(4000),
  sources: z.array(z.string().url().max(2048)).min(1).max(5),
  contactEmail: z.string().email().max(320).optional(),
});
export const reportSchema = z.object({
  explanation: z
    .string()
    .trim()
    .min(10, "Describe the issue in at least 10 characters.")
    .max(4000, "Use 4,000 characters or fewer."),
  contactEmail: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(320)
    .optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const ownershipGraphQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  evidenceTier: evidenceTierSchema.optional(),
  status: claimStatusSchema.optional(),
  type: claimTypeSchema.optional(),
});
export const channelLookupRequestSchema = z
  .object({
    identifiers: z.array(z.string().max(480)).min(1).max(100),
  })
  .transform(({ identifiers }) => ({ identifiers: [...new Set(identifiers)] }));
export const moderationDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(4000).optional(),
});
export const channelEditorSchema = z.object({
  channelId: channelIdentifierSchema,
  handle: channelHandleSchema.optional(),
  name: z.string().trim().min(1).max(240),
  profilePictureUrl: z.string().url().optional(),
});
export const firmEditorSchema = z.object({
  profilePictureUrl: z.string().url().optional(),
  profilePictureBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color").optional(),
  name: z.string().trim().min(1).max(240),
  website: z.string().url().optional(),
});
export const channelUpdateSchema = channelEditorSchema.partial().extend({
  handle: channelEditorSchema.shape.handle.nullable(),
  profilePictureUrl: channelEditorSchema.shape.profilePictureUrl.nullable(),
});
export const firmUpdateSchema = firmEditorSchema
  .partial()
  .extend({ website: firmEditorSchema.shape.website.nullable(), profilePictureUrl: firmEditorSchema.shape.profilePictureUrl.nullable(), profilePictureBackground: firmEditorSchema.shape.profilePictureBackground.nullable() });
export type ClaimType = z.infer<typeof claimTypeSchema>;
export type ClaimStatus = z.infer<typeof claimStatusSchema>;
export type EvidenceTier = z.infer<typeof evidenceTierSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type SubmissionInput = z.infer<typeof submissionSchema>;
export type OwnershipGraphQuery = z.infer<typeof ownershipGraphQuerySchema>;
export type ChannelLookupRequest = z.infer<typeof channelLookupRequestSchema>;
export type ModerationDecision = z.infer<typeof moderationDecisionSchema>;
export type ChannelEditor = z.infer<typeof channelEditorSchema>;
export type FirmEditor = z.infer<typeof firmEditorSchema>;
export type ChannelEasterEgg = { emoji: string; message: string };
export type PublicChannel = {
  easterEgg?: ChannelEasterEgg;
  channelId: string;
  handle?: string;
  aliases: string[];
  name: string;
  profilePictureUrl?: string;
  claims: Array<{
    id: string;
    type: ClaimType;
    status: ClaimStatus;
    firm?: { id: string; name: string; website?: string; profilePictureUrl?: string; profilePictureBackground?: string };
    announcedAt?: string;
    confidence: number;
    sources: Source[];
  }>;
  reviewedAt?: string;
};
export type ChannelOwnershipSummary = {
  easterEgg?: ChannelEasterEgg;
  channelId: string;
  handle?: string;
  name: string;
  claims: Array<{
    id: string;
    type: ClaimType;
    status: ClaimStatus;
    firm?: { id: string; name: string };
  }>;
};
export type ChannelLookupResponse = {
  results: Array<{
    identifier: string;
    channel: ChannelOwnershipSummary | null;
    error?: { code: "INVALID_IDENTIFIER" };
  }>;
};
export type PublicFirm = {
  profilePictureUrl?: string;
  profilePictureBackground?: string;
  id: string;
  name: string;
  website?: string;
  claims: Array<{
    id: string;
    type: ClaimType;
    status: ClaimStatus;
    channel: { channelId: string; name: string; handle?: string };
    announcedAt?: string;
    confidence: number;
    sources: Source[];
  }>;
};
export type OwnershipGraph = {
  nodes: Array<
    | {
        id: string;
        kind: "firm";
        name: string;
        website?: string;
        profilePictureUrl?: string;
        profilePictureBackground?: string;
        undisclosed?: boolean;
        channelCount: number;
      }
    | {
        id: string;
        kind: "channel";
        channelId: string;
        name: string;
        handle?: string;
        profilePictureUrl?: string;
      }
  >;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: ClaimType;
    status: ClaimStatus;
    confidence: number;
    announcedAt?: string;
    evidenceTiers: EvidenceTier[];
    sources: Source[];
  }>;
};
export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export const relationshipEditorSchema = z
  .object({
    channel: z.union([
      z.object({ id: z.string().uuid() }),
      channelEditorSchema,
    ]),
    firm: z
      .union([z.object({ id: z.string().uuid() }), firmEditorSchema])
      .nullable(),
    type: claimTypeSchema,
    status: z.enum(["confirmed", "provisional", "disputed", "rejected"]),
    confidence: z.number().int().min(0).max(100).default(0),
    announcedAt: z.string().datetime().nullable().optional(),
    published: z.boolean().default(false),
    sources: z.array(sourceSchema).max(50),
  })
  .refine((data) => !data.published || data.status === "confirmed", {
    path: ["status"],
    message: "Only confirmed relationships can be published.",
  });
export type RelationshipEditor = z.infer<typeof relationshipEditorSchema>;
export type ModeratorChannel = ChannelEditor & { id: string };
export type ModeratorFirm = FirmEditor & { id: string };
export type ModeratorRelationship = {
  id: string;
  channel: ModeratorChannel;
  firm: ModeratorFirm | null;
  type: ClaimType;
  status: RelationshipEditor["status"];
  confidence: number;
  announcedAt: string | null;
  published: boolean;
  sources: Source[];
};

export const moderatorListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).default(""),
});
export const moderatorInboxQuerySchema = moderatorListQuerySchema.extend({
  kind: z.enum(["all", "reports", "disputes", "feedback"]).default("all"),
});
export const moderatorDirectoryQuerySchema = moderatorListQuerySchema.extend({
  sort: z.enum(["name", "details", "status"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  resource: z
    .enum(["relationships", "channels", "firms"])
    .default("relationships"),
  type: z.enum(["all", "funding", "acquisition"]).default("all"),
  status: z
    .enum(["all", "confirmed", "provisional", "disputed", "rejected"])
    .default("all"),
  publication: z.enum(["all", "published", "draft"]).default("all"),
});
export type ModeratorInboxQuery = z.infer<typeof moderatorInboxQuerySchema>;
export type ModeratorDirectoryQuery = z.infer<
  typeof moderatorDirectoryQuerySchema
>;
export type ModeratorSubmission = {
  id: string;
  kind: string;
  channelId: string | null;
  status: "pending" | "approved" | "rejected";
  payload: {
    explanation?: string;
    sources?: string[];
    type?: ClaimType;
    claimId?: string;
    channelHandle?: string;
  };
  contactEmail?: string | null;
  createdAt: string;
};
export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type ModeratorInbox = PageResult<ModeratorSubmission> & {
  counts: Record<"all" | "reports" | "disputes" | "feedback", number>;
};
export type ModeratorRelationshipSummary = Omit<
  ModeratorRelationship,
  "sources"
>;
export type ModeratorDirectory =
  | (PageResult<ModeratorRelationshipSummary> & { resource: "relationships" })
  | (PageResult<ModeratorChannel> & { resource: "channels" })
  | (PageResult<ModeratorFirm> & { resource: "firms" });
export type SubmissionContext = {
  submission: ModeratorSubmission;
  channel: ModeratorChannel | null;
  relationships: ModeratorRelationshipSummary[];
};
export type WorkspaceSession = { role: "moderator" | "admin" };

export const adminUsersQuerySchema = moderatorListQuerySchema.extend({
  sort: z.enum(["email", "createdAt"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export const adminInvitationStatusSchema = z.enum(["pending", "accepted", "expired", "revoked"]);
export const adminInvitationsQuerySchema = moderatorListQuerySchema.extend({
  status: z.enum(["all", "pending", "accepted", "expired", "revoked"]).default("all"),
  sort: z.enum(["email", "status", "lastSentAt", "expiresAt"]).default("lastSentAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminInvitationsQuery = z.infer<typeof adminInvitationsQuerySchema>;
export type AdminModerator = { id: string; email: string; role: "moderator"; createdAt: string };
export type AdminInvitation = {
  id: string; email: string; status: z.infer<typeof adminInvitationStatusSchema>;
  expiresAt: string; acceptedAt: string | null; revokedAt: string | null;
  lastSentAt: string | null; createdAt: string;
};
export type AdminUsersPage = PageResult<AdminModerator>;
export type AdminInvitationsPage = PageResult<AdminInvitation>;

// Raw files are capped before encoding; allow JSON/base64 overhead in transport.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BASE64_LENGTH = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
export const imageUploadSchema = z.object({
  kind: z.enum(["channels", "firms"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(4).max(MAX_IMAGE_BASE64_LENGTH).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(value => value.length % 4 === 0, "Invalid image encoding"),
}).strict();
export type ImageUpload = z.infer<typeof imageUploadSchema>;
