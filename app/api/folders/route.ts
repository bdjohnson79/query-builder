import { NextResponse } from 'next/server'
import { z } from 'zod'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { savedQueryFolders } from '@/lib/db/schema'

const CreateFolder = z.object({
  name: z.string().min(1),
})

export async function GET() {
  try {
    const folders = await db.select().from(savedQueryFolders).orderBy(asc(savedQueryFolders.name))
    return NextResponse.json(folders)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateFolder.parse(await req.json())
    const [folder] = await db.insert(savedQueryFolders).values({ name: body.name }).returning()
    return NextResponse.json(folder, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
