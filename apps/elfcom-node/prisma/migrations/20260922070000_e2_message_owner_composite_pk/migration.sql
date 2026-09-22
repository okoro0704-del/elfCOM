-- E2: allow same logical message id per owner (native DM mirror copies).
-- Additive: drop single-column PK, add composite PK (id, owner_trust_id).

DO $$ BEGIN
  ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_pkey";
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id", "owner_trust_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
