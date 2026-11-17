CREATE TABLE "ingest_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ingest_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "uploaded_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"source" text DEFAULT 'invoice-site' NOT NULL,
	"doc_type" text NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"party_name" text DEFAULT '' NOT NULL,
	"amount_paise" integer,
	"document_date" text,
	"filename" text NOT NULL,
	"blob_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"invoice_id" text,
	"key_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploaded_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_key_id_ingest_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."ingest_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ingest_keys_hash" ON "ingest_keys" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_uploaded_documents_hash" ON "uploaded_documents" USING btree ("org_id","sha256");--> statement-breakpoint
CREATE INDEX "idx_uploaded_documents_org_created" ON "uploaded_documents" USING btree ("org_id","created_at");