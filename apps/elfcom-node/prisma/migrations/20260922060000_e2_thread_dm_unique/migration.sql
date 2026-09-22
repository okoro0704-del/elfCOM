-- E2: create durable messaging tables (additive — do not drop other services' tables)

CREATE TABLE IF NOT EXISTS "threads" (
    "id" TEXT NOT NULL,
    "owner_trust_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "peer_ref" TEXT,
    "title_cipher_json" TEXT NOT NULL,
    "title_created_at" TIMESTAMP(3) NOT NULL,
    "title_seal_mode" TEXT NOT NULL DEFAULT 'user',
    "peer_handle_cipher_json" TEXT,
    "provider_thread_hint" TEXT,
    "participants_json" TEXT NOT NULL DEFAULT '[]',
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "owner_trust_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "seal_mode" TEXT NOT NULL DEFAULT 'user',
    "body_cipher_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "channel_links" (
    "id" TEXT NOT NULL,
    "owner_trust_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "handle_blind_index" TEXT NOT NULL,
    "handle_cipher_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "owner_trust_id" TEXT,
    "op" TEXT NOT NULL,
    "channel" TEXT,
    "thread_id" TEXT,
    "message_id" TEXT,
    "meta_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "outbox_deliveries" (
    "id" TEXT NOT NULL,
    "owner_trust_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "outbox_deliveries_pkey" PRIMARY KEY ("id")
);

-- FKs (ignore if already present)
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "threads_owner_channel_peer_key"
  ON "threads" ("owner_trust_id", "channel", "peer_ref");
CREATE INDEX IF NOT EXISTS "threads_owner_trust_id_updated_at_idx"
  ON "threads" ("owner_trust_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "threads_owner_trust_id_channel_idx"
  ON "threads" ("owner_trust_id", "channel");

CREATE INDEX IF NOT EXISTS "messages_thread_id_created_at_idx"
  ON "messages" ("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "messages_owner_trust_id_created_at_idx"
  ON "messages" ("owner_trust_id", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "channel_links_channel_handle_blind_index_key"
  ON "channel_links" ("channel", "handle_blind_index");
CREATE INDEX IF NOT EXISTS "channel_links_owner_trust_id_channel_idx"
  ON "channel_links" ("owner_trust_id", "channel");

CREATE INDEX IF NOT EXISTS "audit_logs_owner_trust_id_created_at_idx"
  ON "audit_logs" ("owner_trust_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "outbox_deliveries_status_updated_at_idx"
  ON "outbox_deliveries" ("status", "updated_at");
