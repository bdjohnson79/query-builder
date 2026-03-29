import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const appSchemas = pgTable('app_schemas', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
})

export const appTables = pgTable('app_tables', {
  id: serial('id').primaryKey(),
  schemaId: integer('schema_id')
    .notNull()
    .references(() => appSchemas.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  displayName: text('display_name'),
  description: text('description'),
})

export const appColumns = pgTable('app_columns', {
  id: serial('id').primaryKey(),
  tableId: integer('table_id')
    .notNull()
    .references(() => appTables.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  pgType: text('pg_type').notNull().default('text'),
  isNullable: boolean('is_nullable').notNull().default(true),
  defaultValue: text('default_value'),
  isPrimaryKey: boolean('is_primary_key').notNull().default(false),
  ordinalPosition: integer('ordinal_position').notNull().default(0),
  description: text('description'),
})

export const appForeignKeys = pgTable('app_foreign_keys', {
  id: serial('id').primaryKey(),
  fromColumnId: integer('from_column_id')
    .notNull()
    .references(() => appColumns.id, { onDelete: 'cascade' }),
  toColumnId: integer('to_column_id')
    .notNull()
    .references(() => appColumns.id, { onDelete: 'cascade' }),
  constraintName: text('constraint_name'),
})

export const jsonStructures = pgTable('json_structures', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  definition: jsonb('definition').notNull(), // JsonStructureDefinition
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const savedQueryFolders = pgTable('saved_query_folders', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
})

export const savedQueries = pgTable('saved_queries', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  queryState: jsonb('query_state').notNull(),
  generatedSql: text('generated_sql'),
  schemaId: integer('schema_id').references(() => appSchemas.id, {
    onDelete: 'set null',
  }),
  folderId: integer('folder_id').references(() => savedQueryFolders.id, {
    onDelete: 'set null',
  }),
  tags: text('tags').array(),
  isTemplate: boolean('is_template').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Relations
export const appSchemasRelations = relations(appSchemas, ({ many }) => ({
  tables: many(appTables),
  savedQueries: many(savedQueries),
}))

export const appTablesRelations = relations(appTables, ({ one, many }) => ({
  schema: one(appSchemas, {
    fields: [appTables.schemaId],
    references: [appSchemas.id],
  }),
  columns: many(appColumns),
}))

export const appColumnsRelations = relations(appColumns, ({ one }) => ({
  table: one(appTables, {
    fields: [appColumns.tableId],
    references: [appTables.id],
  }),
}))

export const appForeignKeysRelations = relations(appForeignKeys, ({ one }) => ({
  fromColumn: one(appColumns, {
    fields: [appForeignKeys.fromColumnId],
    references: [appColumns.id],
    relationName: 'fk_from',
  }),
  toColumn: one(appColumns, {
    fields: [appForeignKeys.toColumnId],
    references: [appColumns.id],
    relationName: 'fk_to',
  }),
}))

export const savedQueryFoldersRelations = relations(savedQueryFolders, ({ many }) => ({
  queries: many(savedQueries),
}))

export const savedQueriesRelations = relations(savedQueries, ({ one }) => ({
  schema: one(appSchemas, {
    fields: [savedQueries.schemaId],
    references: [appSchemas.id],
  }),
  folder: one(savedQueryFolders, {
    fields: [savedQueries.folderId],
    references: [savedQueryFolders.id],
  }),
}))
