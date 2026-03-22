import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appColumns } from '@/lib/db/schema'

const UpdateColumn = z.object({
  name: z.string().min(1).optional(),
  pgType: z.string().min(1).optional(),
  isNullable: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
  isPrimaryKey: z.boolean().optional(),
  ordinalPosition: z.number().int().optional(),
  description: z.string().nullable().optional(),
})

type Params = Promise<{ id: string; colId: string }>

export async function PUT(req: Request, { params }: { params: Params }) {
  try {
    const { colId } = await params
    const body = UpdateColumn.parse(await req.json())
    const [col] = await db
      .update(appColumns)
      .set(body)
      .where(eq(appColumns.id, Number(colId)))
      .returning()
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(col)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const { colId } = await params
    await db.delete(appColumns).where(eq(appColumns.id, Number(colId)))
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
