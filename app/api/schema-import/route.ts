import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appSchemas, appTables, appColumns } from '@/lib/db/schema'

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ImportColumnSchema = z.object({
  name: z.string().min(1),
  pg_type: z.string().min(1),
  is_nullable: z.boolean(),
  is_primary_key: z.boolean().default(false),
  ordinal_position: z.number().int(),
  default_value: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

const ImportTableSchema = z.object({
  schema: z.string().min(1),
  name: z.string().min(1),
  is_view: z.boolean().optional(),
  description: z.string().nullable().optional(),
  columns: z.array(ImportColumnSchema),
})

const RequestSchema = z.object({
  tables: z.array(ImportTableSchema),
  selectedKeys: z.array(z.string()),  // "schema.tableName"
})

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = RequestSchema.parse(await req.json())
    const { tables, selectedKeys } = body

    const selectedSet = new Set(selectedKeys)
    const selected = tables.filter((t) => selectedSet.has(`${t.schema}.${t.name}`))

    let added = 0
    let updated = 0
    let unchanged = 0

    // Cache schema id lookups to avoid repeated queries
    const schemaIdCache = new Map<string, number>()

    const getOrCreateSchema = async (schemaName: string): Promise<number> => {
      if (schemaIdCache.has(schemaName)) return schemaIdCache.get(schemaName)!
      const existing = await db
        .select({ id: appSchemas.id })
        .from(appSchemas)
        .where(eq(appSchemas.name, schemaName))
      if (existing.length > 0) {
        schemaIdCache.set(schemaName, existing[0].id)
        return existing[0].id
      }
      const [created] = await db.insert(appSchemas).values({ name: schemaName }).returning({ id: appSchemas.id })
      schemaIdCache.set(schemaName, created.id)
      return created.id
    }

    for (const t of selected) {
      const schemaId = await getOrCreateSchema(t.schema)

      // Find or create the table
      const existingTables = await db
        .select()
        .from(appTables)
        .where(and(eq(appTables.schemaId, schemaId), eq(appTables.name, t.name)))

      let tableId: number
      let tableIsNew = false

      if (existingTables.length === 0) {
        const [created] = await db
          .insert(appTables)
          .values({
            schemaId,
            name: t.name,
            displayName: null,
            description: t.description ?? null,
          })
          .returning({ id: appTables.id })
        tableId = created.id
        tableIsNew = true
      } else {
        tableId = existingTables[0].id
        // Update description if it changed (don't overwrite displayName — admin sets that manually)
        const current = existingTables[0]
        if (current.description !== (t.description ?? null)) {
          await db
            .update(appTables)
            .set({ description: t.description ?? null })
            .where(eq(appTables.id, tableId))
        }
      }

      // Upsert columns
      const existingColumns = tableIsNew
        ? []
        : await db.select().from(appColumns).where(eq(appColumns.tableId, tableId))
      const existingColMap = new Map(existingColumns.map((c) => [c.name, c]))

      let tableHadChanges = tableIsNew

      for (const col of t.columns) {
        const existing = existingColMap.get(col.name)
        if (!existing) {
          await db.insert(appColumns).values({
            tableId,
            name: col.name,
            pgType: col.pg_type,
            isNullable: col.is_nullable,
            isPrimaryKey: col.is_primary_key,
            ordinalPosition: col.ordinal_position,
            defaultValue: col.default_value ?? null,
            description: col.description ?? null,
          })
          tableHadChanges = true
        } else {
          // Check if anything changed
          const changed =
            existing.pgType !== col.pg_type ||
            existing.isNullable !== col.is_nullable ||
            existing.isPrimaryKey !== col.is_primary_key ||
            existing.ordinalPosition !== col.ordinal_position ||
            existing.defaultValue !== (col.default_value ?? null) ||
            existing.description !== (col.description ?? null)

          if (changed) {
            await db
              .update(appColumns)
              .set({
                pgType: col.pg_type,
                isNullable: col.is_nullable,
                isPrimaryKey: col.is_primary_key,
                ordinalPosition: col.ordinal_position,
                defaultValue: col.default_value ?? null,
                description: col.description ?? null,
              })
              .where(eq(appColumns.id, existing.id))
            tableHadChanges = true
          }
        }
      }

      if (tableIsNew) {
        added++
      } else if (tableHadChanges) {
        updated++
      } else {
        unchanged++
      }
    }

    return NextResponse.json({ added, updated, unchanged })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
