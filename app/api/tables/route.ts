import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appTables, appColumns } from '@/lib/db/schema'

const CreateTable = z.object({
  schemaId: z.number().int().positive(),
  name: z.string().min(1),
  displayName: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const schemaId = searchParams.get('schemaId')

    let tables
    if (schemaId) {
      tables = await db.select().from(appTables).where(eq(appTables.schemaId, Number(schemaId)))
    } else {
      tables = await db.select().from(appTables)
    }

    // Attach columns
    const withColumns = await Promise.all(
      tables.map(async (t) => {
        const columns = await db.select().from(appColumns).where(eq(appColumns.tableId, t.id))
        return { ...t, columns }
      })
    )
    return NextResponse.json(withColumns)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateTable.parse(await req.json())
    const [table] = await db.insert(appTables).values(body).returning()
    return NextResponse.json({ ...table, columns: [] }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
