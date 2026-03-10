import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { savedQueries } from '@/lib/db/schema'

const CreateQuery = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  queryState: z.unknown(),
  generatedSql: z.string().optional(),
  schemaId: z.number().int().positive().optional(),
})

export async function GET() {
  try {
    const queries = await db.select().from(savedQueries)
    return NextResponse.json(queries)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateQuery.parse(await req.json())
    const [query] = await db
      .insert(savedQueries)
      .values({
        name: body.name,
        description: body.description,
        queryState: body.queryState,
        generatedSql: body.generatedSql,
        schemaId: body.schemaId,
      })
      .returning()
    return NextResponse.json(query, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
