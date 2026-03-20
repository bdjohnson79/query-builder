#!/usr/bin/env node
/**
 * Bootstrap ST-One (Beaver Dam) schema into the query builder.
 *
 * Run with:
 *   DATABASE_URL="postgresql://qb:devpassword@localhost:5432/querybuilder" npx tsx scripts/bootstrap-st-one.ts
 *
 * Add --force to drop and recreate if the schema already exists.
 */

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import {
  appSchemas,
  appTables,
  appColumns,
  appForeignKeys,
} from '../src/lib/db/schema'

// ---------------------------------------------------------------------------
// Schema metadata
// ---------------------------------------------------------------------------

const SCHEMA_NAME = 'ST-One (Beaver Dam)'

// ---------------------------------------------------------------------------
// Table definitions
// ---------------------------------------------------------------------------

type ColDef = {
  name: string
  pgType: string
  isNullable: boolean
  defaultValue?: string
  isPrimaryKey: boolean
  ordinalPosition: number
}

type TableDef = {
  name: string
  displayName: string
  columns: ColDef[]
}

const TABLES: TableDef[] = [
  {
    name: 'event',
    displayName: 'Event',
    columns: [
      { name: 'time',  pgType: 'timestamp', isNullable: false, isPrimaryKey: false, ordinalPosition: 1 },
      { name: 'tag',   pgType: 'text',      isNullable: false, isPrimaryKey: false, ordinalPosition: 2 },
      { name: 'value', pgType: 'float4',    isNullable: true,  isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'info',  pgType: 'jsonb',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 4 },
    ],
  },
  {
    name: 'tag',
    displayName: 'Tag',
    columns: [
      { name: 'id',          pgType: 'int4',      isNullable: false, isPrimaryKey: true,  ordinalPosition: 1 },
      { name: 'name',        pgType: 'varchar',   isNullable: false, isPrimaryKey: false, ordinalPosition: 2 },
      { name: 'description', pgType: 'text',      isNullable: true,  isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'location',    pgType: 'int4',      isNullable: true,  isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'factor',      pgType: 'float8',    isNullable: false, defaultValue: '1',   isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'offset',      pgType: 'float8',    isNullable: false, defaultValue: '0',   isPrimaryKey: false, ordinalPosition: 7 },
      { name: 'info',        pgType: 'jsonb',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 8 },
      { name: 'created_at',  pgType: 'timestamptz', isNullable: false, isPrimaryKey: false, ordinalPosition: 9 },
      { name: 'updated_at',  pgType: 'timestamptz', isNullable: true,  isPrimaryKey: false, ordinalPosition: 10 },
      { name: 'labels',      pgType: 'ltree[]',   isNullable: true,  isPrimaryKey: false, ordinalPosition: 11 },
      { name: 'type',        pgType: 'text',      isNullable: true,  isPrimaryKey: false, ordinalPosition: 12 },
    ],
  },
  {
    name: 'location',
    displayName: 'Location',
    columns: [
      { name: 'id',          pgType: 'int4',        isNullable: false, isPrimaryKey: true,  ordinalPosition: 1 },
      { name: 'name',        pgType: 'varchar',     isNullable: false, isPrimaryKey: false, ordinalPosition: 2 },
      { name: 'description', pgType: 'text',        isNullable: true,  isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'parent',      pgType: 'int4',        isNullable: true,  isPrimaryKey: false, ordinalPosition: 4 },
      { name: 'is_machine',  pgType: 'bool',        isNullable: true,  defaultValue: 'false', isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'info',        pgType: 'jsonb',       isNullable: true,  isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'created_at',  pgType: 'timestamptz', isNullable: false, isPrimaryKey: false, ordinalPosition: 7 },
      { name: 'updated_at',  pgType: 'timestamptz', isNullable: true,  isPrimaryKey: false, ordinalPosition: 8 },
      { name: 'active',      pgType: 'bool',        isNullable: false, defaultValue: 'false', isPrimaryKey: false, ordinalPosition: 9 },
      { name: 'slug',        pgType: 'varchar',     isNullable: false, isPrimaryKey: false, ordinalPosition: 10 },
      { name: 'asset_types', pgType: 'ltree[]',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 11 },
    ],
  },
  {
    // location_tree is a view — slug + path are the new useful columns vs location
    name: 'location_tree',
    displayName: 'Location Tree',
    columns: [
      { name: 'id',         pgType: 'int4',    isNullable: false, isPrimaryKey: true,  ordinalPosition: 1 },
      { name: 'name',       pgType: 'varchar', isNullable: false, isPrimaryKey: false, ordinalPosition: 2 },
      { name: 'slug',       pgType: 'varchar', isNullable: false, isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'path',       pgType: 'text',    isNullable: true,  isPrimaryKey: false, ordinalPosition: 4 },
      { name: 'parent',     pgType: 'int4',    isNullable: true,  isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'is_machine', pgType: 'bool',    isNullable: true,  isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'active',     pgType: 'bool',    isNullable: true,  isPrimaryKey: false, ordinalPosition: 7 },
    ],
  },
  {
    name: 'agg',
    displayName: 'Aggregation',
    columns: [
      { name: 'cid',                  pgType: 'varchar',   isNullable: false, isPrimaryKey: false, ordinalPosition: 1 },
      { name: 'id',                   pgType: 'uuid',      isNullable: false, isPrimaryKey: true,  ordinalPosition: 2 },
      { name: 'slug_agg',             pgType: 'text',      isNullable: true,  isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'var',                  pgType: 'jsonb',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 4 },
      { name: 'active',               pgType: 'bool',      isNullable: false, defaultValue: 'true', isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'labels',               pgType: 'ltree[]',   isNullable: true,  isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'location_slug',        pgType: 'varchar',   isNullable: false, isPrimaryKey: false, ordinalPosition: 7 },
      { name: 'level',                pgType: 'int4',      isNullable: false, defaultValue: '1',   isPrimaryKey: false, ordinalPosition: 8 },
      { name: 'time_ptr',             pgType: 'timestamp', isNullable: true,  isPrimaryKey: false, ordinalPosition: 9 },
      { name: 'depends_on',           pgType: 'jsonb',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 10 },
      { name: 'created_at',           pgType: 'timestamp', isNullable: false, isPrimaryKey: false, ordinalPosition: 11 },
      { name: 'updated_at',           pgType: 'timestamp', isNullable: true,  isPrimaryKey: false, ordinalPosition: 12 },
      { name: 'info',                 pgType: 'jsonb',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 13 },
      { name: 'error',                pgType: 'text',      isNullable: true,  isPrimaryKey: false, ordinalPosition: 14 },
      { name: 'next_run',             pgType: 'timestamp', isNullable: true,  isPrimaryKey: false, ordinalPosition: 15 },
      { name: 'last_successful_run',  pgType: 'timestamp', isNullable: true,  isPrimaryKey: false, ordinalPosition: 16 },
    ],
  },
  {
    name: 'agg_event',
    displayName: 'Aggregation Data',
    columns: [
      { name: 'time',       pgType: 'timestamp', isNullable: false, isPrimaryKey: false, ordinalPosition: 1 },
      { name: 'tsrange',    pgType: 'tsrange',   isNullable: true,  isPrimaryKey: false, ordinalPosition: 2 },
      { name: 'agg',        pgType: 'uuid',      isNullable: false, isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'value',      pgType: 'float4',    isNullable: true,  isPrimaryKey: false, ordinalPosition: 4 },
      { name: 'info',       pgType: 'jsonb',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'created_at', pgType: 'timestamp', isNullable: false, isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'updated_at', pgType: 'timestamp', isNullable: true,  isPrimaryKey: false, ordinalPosition: 7 },
    ],
  },
  {
    name: 'form',
    displayName: 'Form',
    columns: [
      { name: 'cid',              pgType: 'varchar',     isNullable: false, isPrimaryKey: false, ordinalPosition: 1 },
      { name: 'id',               pgType: 'int4',        isNullable: false, isPrimaryKey: true,  ordinalPosition: 2 },
      { name: 'name',             pgType: 'varchar',     isNullable: false, isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'slug',             pgType: 'varchar',     isNullable: false, isPrimaryKey: false, ordinalPosition: 4 },
      { name: 'active',           pgType: 'bool',        isNullable: true,  defaultValue: 'true',  isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'form_json',        pgType: 'jsonb',       isNullable: true,  isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'description',      pgType: 'varchar',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 7 },
      { name: 'manual_disable',   pgType: 'bool',        isNullable: true,  defaultValue: 'false', isPrimaryKey: false, ordinalPosition: 8 },
      { name: 'location_slug',    pgType: 'varchar',     isNullable: false, isPrimaryKey: false, ordinalPosition: 9 },
      { name: 'display_property', pgType: 'varchar',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 10 },
      { name: 'created_at',       pgType: 'timestamptz', isNullable: false, isPrimaryKey: false, ordinalPosition: 11 },
      { name: 'updated_at',       pgType: 'timestamptz', isNullable: true,  isPrimaryKey: false, ordinalPosition: 12 },
      { name: 'builder_slug',     pgType: 'varchar',     isNullable: true,  isPrimaryKey: false, ordinalPosition: 13 },
      { name: 'type',             pgType: 'text',        isNullable: false, defaultValue: 'event', isPrimaryKey: false, ordinalPosition: 14 },
      { name: 'form_i18n',        pgType: 'jsonb',       isNullable: true,  isPrimaryKey: false, ordinalPosition: 15 },
    ],
  },
  {
    name: 'form_data',
    displayName: 'Form Data',
    columns: [
      { name: 'uid',        pgType: 'uuid',        isNullable: false, isPrimaryKey: true,  ordinalPosition: 1 },
      { name: 'form_slug',  pgType: 'text',        isNullable: false, isPrimaryKey: false, ordinalPosition: 2 },
      { name: 'active',     pgType: 'bool',        isNullable: false, defaultValue: 'true',  isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'automatic',  pgType: 'bool',        isNullable: false, defaultValue: 'false', isPrimaryKey: false, ordinalPosition: 4 },
      { name: 'value',      pgType: 'jsonb',       isNullable: true,  isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'created_at', pgType: 'timestamptz', isNullable: false, isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'updated_at', pgType: 'timestamptz', isNullable: true,  isPrimaryKey: false, ordinalPosition: 7 },
    ],
  },
  {
    name: 'form_event',
    displayName: 'Form Event',
    columns: [
      { name: 'time',          pgType: 'timestamp',   isNullable: false, isPrimaryKey: false, ordinalPosition: 1 },
      { name: 'form_slug',     pgType: 'varchar',     isNullable: false, isPrimaryKey: false, ordinalPosition: 2 },
      { name: 'active',        pgType: 'bool',        isNullable: true,  defaultValue: 'true',  isPrimaryKey: false, ordinalPosition: 3 },
      { name: 'value',         pgType: 'jsonb',       isNullable: true,  isPrimaryKey: false, ordinalPosition: 4 },
      { name: 'trigger_uid',   pgType: 'uuid',        isNullable: true,  isPrimaryKey: false, ordinalPosition: 5 },
      { name: 'created_at',    pgType: 'timestamptz', isNullable: false, isPrimaryKey: false, ordinalPosition: 6 },
      { name: 'updated_at',    pgType: 'timestamptz', isNullable: true,  isPrimaryKey: false, ordinalPosition: 7 },
      { name: 'display_value', pgType: 'text',        isNullable: true,  isPrimaryKey: false, ordinalPosition: 8 },
      { name: 'automatic',     pgType: 'bool',        isNullable: false, defaultValue: 'false', isPrimaryKey: false, ordinalPosition: 9 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Known join relationships (no FK constraints in ST-One DB — pre-wired here)
// ---------------------------------------------------------------------------

type FkDef = {
  fromTable: string
  fromCol: string
  toTable: string
  toCol: string
  name: string
}

const FOREIGN_KEYS: FkDef[] = [
  { fromTable: 'event',         fromCol: 'tag',           toTable: 'tag',           toCol: 'name',         name: 'event_tag__tag_name' },
  { fromTable: 'tag',           fromCol: 'location',      toTable: 'location',      toCol: 'id',           name: 'tag_location__location_id' },
  { fromTable: 'agg_event',     fromCol: 'agg',           toTable: 'agg',           toCol: 'id',           name: 'agg_event_agg__agg_id' },
  { fromTable: 'agg',           fromCol: 'location_slug', toTable: 'location',      toCol: 'slug',         name: 'agg_location_slug__location_slug' },
  { fromTable: 'location_tree', fromCol: 'slug',          toTable: 'location',      toCol: 'slug',         name: 'location_tree_slug__location_slug' },
  { fromTable: 'form_data',     fromCol: 'form_slug',     toTable: 'form',          toCol: 'slug',         name: 'form_data_form_slug__form_slug' },
  { fromTable: 'form_event',    fromCol: 'form_slug',     toTable: 'form',          toCol: 'slug',         name: 'form_event_form_slug__form_slug' },
  { fromTable: 'location',      fromCol: 'parent',        toTable: 'location',      toCol: 'id',           name: 'location_parent__location_id' },
  { fromTable: 'form',          fromCol: 'location_slug', toTable: 'location',      toCol: 'slug',         name: 'form_location_slug__location_slug' },
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL environment variable is required')

  const force = process.argv.includes('--force')

  const client = postgres(dbUrl, { max: 1 })
  const db = drizzle(client)

  try {
    // Check for existing schema
    const existing = await db
      .select()
      .from(appSchemas)
      .where(eq(appSchemas.name, SCHEMA_NAME))

    if (existing.length > 0) {
      if (!force) {
        console.log(`Schema "${SCHEMA_NAME}" already exists (id=${existing[0].id}). Use --force to recreate.`)
        return
      }
      console.log(`--force: deleting existing schema "${SCHEMA_NAME}" (id=${existing[0].id}) and all dependent data…`)
      await db.delete(appSchemas).where(eq(appSchemas.id, existing[0].id))
    }

    // 1. Create schema
    console.log(`Creating schema "${SCHEMA_NAME}"…`)
    const [insertedSchema] = await db
      .insert(appSchemas)
      .values({ name: SCHEMA_NAME })
      .returning()
    const schemaId = insertedSchema.id
    console.log(`  → schema id=${schemaId}`)

    // 2. Create tables + columns, building a column-ID lookup map
    // Map key: "tableName.columnName" → column DB id
    const colIdMap = new Map<string, number>()

    for (const tableDef of TABLES) {
      console.log(`Creating table "${tableDef.name}"…`)
      const [insertedTable] = await db
        .insert(appTables)
        .values({
          schemaId,
          name: tableDef.name,
          displayName: tableDef.displayName,
        })
        .returning()

      const tableId = insertedTable.id

      const colValues = tableDef.columns.map((c) => ({
        tableId,
        name: c.name,
        pgType: c.pgType,
        isNullable: c.isNullable,
        defaultValue: c.defaultValue ?? null,
        isPrimaryKey: c.isPrimaryKey,
        ordinalPosition: c.ordinalPosition,
      }))

      const insertedCols = await db
        .insert(appColumns)
        .values(colValues)
        .returning()

      for (const col of insertedCols) {
        colIdMap.set(`${tableDef.name}.${col.name}`, col.id)
      }

      console.log(`  → table id=${tableId}, ${insertedCols.length} columns`)
    }

    // 3. Create FK relationships
    console.log('Creating join relationships…')
    let fkCount = 0
    for (const fk of FOREIGN_KEYS) {
      const fromKey = `${fk.fromTable}.${fk.fromCol}`
      const toKey = `${fk.toTable}.${fk.toCol}`
      const fromColId = colIdMap.get(fromKey)
      const toColId = colIdMap.get(toKey)

      if (!fromColId) { console.warn(`  SKIP: could not find column id for "${fromKey}"`); continue }
      if (!toColId)   { console.warn(`  SKIP: could not find column id for "${toKey}"`); continue }

      await db.insert(appForeignKeys).values({
        fromColumnId: fromColId,
        toColumnId: toColId,
        constraintName: fk.name,
      })
      console.log(`  → ${fromKey} → ${toKey}`)
      fkCount++
    }

    console.log(`\nDone! Created ${TABLES.length} tables, ${colIdMap.size} columns, ${fkCount} join relationships.`)
    console.log(`Open the app at http://localhost:3000/admin/schema to review.`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
