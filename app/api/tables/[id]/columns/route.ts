import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appColumns } from '@/lib/db/schema'

const CreateColumn = z.object({
  name: z.string().min(1),
  pgType: z.string().min(1).default('text'),
  isNullable: z.boolean().default(true),
  defaultValue: z.string().nullable().optional(),
  isPrimaryKey: z.boolean().default(false),
  ordinalPosition: z.number().int().default(0),
  description: z.string().nullable().optional(),
})

type Params = Promise<{ id: string }>

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const columns = await db.select().from(appColumns).where(eq(appColumns.tableId, Number(id)))
    return NextResponse.json(columns)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const body = CreateColumn.parse(await req.json())
    const [col] = await db
      .insert(appColumns)
      .values({ ...body, tableId: Number(id) })
      .returning()
    return NextResponse.json(col, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
