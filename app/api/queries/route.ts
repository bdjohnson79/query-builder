import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, ilike, isNull, or, arrayContains } from 'drizzle-orm'
import { db } from '@/lib/db'
import { savedQueries } from '@/lib/db/schema'

const CreateQuery = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  queryState: z.unknown(),
  generatedSql: z.string().optional(),
  schemaId: z.number().int().positive().optional(),
  folderId: z.number().int().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  isTemplate: z.boolean().optional(),
})

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const search = url.searchParams.get('search')
    const folderIdParam = url.searchParams.get('folderId')
    const tagsParam = url.searchParams.get('tags')
    const templatesOnly = url.searchParams.get('templates') === 'true'

    const conditions = []

    if (templatesOnly) {
      conditions.push(eq(savedQueries.isTemplate, true))
    }

    if (search) {
      conditions.push(
        or(
          ilike(savedQueries.name, `%${search}%`),
          ilike(savedQueries.description, `%${search}%`)
        )
      )
    }

    if (folderIdParam === 'none') {
      conditions.push(isNull(savedQueries.folderId))
    } else if (folderIdParam) {
      conditions.push(eq(savedQueries.folderId, Number(folderIdParam)))
    }

    if (tagsParam) {
      const tags = tagsParam.split(',').filter(Boolean)
      if (tags.length > 0) {
        conditions.push(arrayContains(savedQueries.tags, tags))
      }
    }

    const queries = conditions.length > 0
      ? await db.select().from(savedQueries).where(and(...conditions))
      : await db.select().from(savedQueries)

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
        folderId: body.folderId ?? null,
        tags: body.tags ?? null,
        isTemplate: body.isTemplate ?? false,
      })
      .returning()
    return NextResponse.json(query, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
