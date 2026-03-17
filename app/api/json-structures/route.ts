import { NextResponse } from 'next/server'
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

const CreateBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  definition: DefinitionSchema,
})

export async function GET() {
  try {
    const rows = await db.select().from(jsonStructures).orderBy(jsonStructures.name)
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateBody.parse(await req.json())
    const [row] = await db.insert(jsonStructures).values({
      name: body.name,
      description: body.description ?? null,
      definition: body.definition,
    }).returning()
    return NextResponse.json(row, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
