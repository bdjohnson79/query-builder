import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { jsonStructures } from '@/lib/db/schema'

const JsonFieldSchema: z.ZodType = z.lazy(() =>
  z.object({
    key: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string().optional(),
    pgCast: z.string().optional(),
    children: z.array(JsonFieldSchema).optional(),
    itemSchema: z.array(JsonFieldSchema).optional(),
  })
)

const DefinitionSchema = z.object({ fields: z.array(JsonFieldSchema) })

const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  definition: DefinitionSchema.optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const [row] = await db.select().from(jsonStructures).where(eq(jsonStructures.id, Number(id)))
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = UpdateBody.parse(await req.json())
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.definition !== undefined) updates.definition = body.definition
    const [row] = await db
      .update(jsonStructures)
      .set(updates)
      .where(eq(jsonStructures.id, Number(id)))
      .returning()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.delete(jsonStructures).where(eq(jsonStructures.id, Number(id)))
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
