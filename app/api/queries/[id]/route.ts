import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { savedQueries } from '@/lib/db/schema'

const UpdateQuery = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  queryState: z.unknown().optional(),
  generatedSql: z.string().nullable().optional(),
  schemaId: z.number().int().positive().nullable().optional(),
})

type Params = Promise<{ id: string }>

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const [query] = await db
      .select()
      .from(savedQueries)
      .where(eq(savedQueries.id, Number(id)))
    if (!query) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(query)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const body = UpdateQuery.parse(await req.json())
    const [query] = await db
      .update(savedQueries)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(savedQueries.id, Number(id)))
      .returning()
    if (!query) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(query)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    await db.delete(savedQueries).where(eq(savedQueries.id, Number(id)))
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
