import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appForeignKeys, appColumns, appTables } from '@/lib/db/schema'

const CreateFK = z.object({
  fromColumnId: z.number().int().positive(),
  toColumnId: z.number().int().positive(),
  constraintName: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const schemaId = searchParams.get('schemaId')

    const fks = await db.select().from(appForeignKeys)

    // Enrich with column/table info
    const enriched = await Promise.all(
      fks.map(async (fk) => {
        const [fromCol] = await db
          .select()
          .from(appColumns)
          .where(eq(appColumns.id, fk.fromColumnId))
        const [toCol] = await db
          .select()
          .from(appColumns)
          .where(eq(appColumns.id, fk.toColumnId))

        const [fromTable] = fromCol
          ? await db.select().from(appTables).where(eq(appTables.id, fromCol.tableId))
          : []
        const [toTable] = toCol
          ? await db.select().from(appTables).where(eq(appTables.id, toCol.tableId))
          : []

        // Filter by schemaId if provided
        if (schemaId) {
          if (fromTable?.schemaId !== Number(schemaId) && toTable?.schemaId !== Number(schemaId)) {
            return null
          }
        }

        return {
          ...fk,
          fromColumn: fromCol ? { ...fromCol, table: fromTable } : undefined,
          toColumn: toCol ? { ...toCol, table: toTable } : undefined,
        }
      })
    )

    return NextResponse.json(enriched.filter(Boolean))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateFK.parse(await req.json())
    const [fk] = await db.insert(appForeignKeys).values(body).returning()
    return NextResponse.json(fk, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
