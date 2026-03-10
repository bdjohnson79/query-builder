CREATE TABLE "app_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" integer NOT NULL,
	"name" text NOT NULL,
	"pg_type" text DEFAULT 'text' NOT NULL,
	"is_nullable" boolean DEFAULT true NOT NULL,
	"default_value" text,
	"is_primary_key" boolean DEFAULT false NOT NULL,
	"ordinal_position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_foreign_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_column_id" integer NOT NULL,
	"to_column_id" integer NOT NULL,
	"constraint_name" text
);
--> statement-breakpoint
CREATE TABLE "app_schemas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "app_schemas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "app_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"schema_id" integer NOT NULL,
	"name" text NOT NULL,
	"display_name" text
);
--> statement-breakpoint
CREATE TABLE "saved_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"query_state" jsonb NOT NULL,
	"generated_sql" text,
	"schema_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_columns" ADD CONSTRAINT "app_columns_table_id_app_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."app_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_foreign_keys" ADD CONSTRAINT "app_foreign_keys_from_column_id_app_columns_id_fk" FOREIGN KEY ("from_column_id") REFERENCES "public"."app_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_foreign_keys" ADD CONSTRAINT "app_foreign_keys_to_column_id_app_columns_id_fk" FOREIGN KEY ("to_column_id") REFERENCES "public"."app_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_tables" ADD CONSTRAINT "app_tables_schema_id_app_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."app_schemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_schema_id_app_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."app_schemas"("id") ON DELETE set null ON UPDATE no action;