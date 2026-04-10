import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { appSchemas, appTables, appColumns } from '@/lib/db/schema'
import { parseSqlToQueryState } from '@/lib/sql-parser/grafana-sql-importer'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'

const Body = z.object({ sql: z.string().min(1) })

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const { sql } = Body.parse(json)

    // Load schema from DB (parser needs table/column metadata for matching)
    const [rawSchemas, rawTables, rawColumns] = await Promise.all([
      db.select().from(appSchemas),
      db.select().from(appTables),
      db.select().from(appColumns),
    ])

    const schemas: AppSchema[] = rawSchemas
    const tables: AppTable[] = rawTables
    const columns: Record<number, AppColumn[]> = {}
    for (const col of rawColumns) {
      if (!columns[col.tableId]) columns[col.tableId] = []
      columns[col.tableId].push(col)
    }

    const result = await parseSqlToQueryState(sql, tables, columns, schemas)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
