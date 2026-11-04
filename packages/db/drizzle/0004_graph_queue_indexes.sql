CREATE INDEX IF NOT EXISTS "evidence_claim_id_idx" ON "evidence" ("claim_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_pending_queue_idx" ON "submissions" ("status", "created_at", "id");
