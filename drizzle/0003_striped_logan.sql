CREATE TABLE "saved_query_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "folder_id" integer;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_folder_id_saved_query_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."saved_query_folders"("id") ON DELETE set null ON UPDATE no action;