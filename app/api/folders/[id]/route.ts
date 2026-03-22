import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { savedQueryFolders } from '@/lib/db/schema'

type Params = Promise<{ id: string }>

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    await db.delete(savedQueryFolders).where(eq(savedQueryFolders.id, Number(id)))
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
