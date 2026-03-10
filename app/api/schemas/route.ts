import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { appSchemas } from '@/lib/db/schema'

const CreateSchema = z.object({ name: z.string().min(1) })

export async function GET() {
  try {
    const schemas = await db.select().from(appSchemas)
    return NextResponse.json(schemas)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json())
    const [schema] = await db.insert(appSchemas).values(body).returning()
    return NextResponse.json(schema, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
