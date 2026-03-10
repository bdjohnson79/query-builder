import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appTables, appColumns } from '@/lib/db/schema'

const UpdateTable = z.object({
  name: z.string().min(1).optional(),
  displayName: z.string().nullable().optional(),
})

type Params = Promise<{ id: string }>

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const [table] = await db.select().from(appTables).where(eq(appTables.id, Number(id)))
    if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const columns = await db.select().from(appColumns).where(eq(appColumns.tableId, Number(id)))
    return NextResponse.json({ ...table, columns })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const body = UpdateTable.parse(await req.json())
    const [table] = await db
      .update(appTables)
      .set(body)
      .where(eq(appTables.id, Number(id)))
      .returning()
    if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(table)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    await db.delete(appTables).where(eq(appTables.id, Number(id)))
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
