import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import * as schema from './schema'
import { appSchemas } from './schema'

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? './data/pglite'

// Lazily initialized — only created when initializeDb() runs at server startup,
// not during the Next.js build phase.
let client: PGlite
let _db: ReturnType<typeof drizzle<typeof schema>>

function getDb() {
  if (!_db) {
    mkdirSync(DATA_DIR, { recursive: true })
    client = new PGlite(DATA_DIR)
    _db = drizzle(client, { schema })
  }
  return _db
}

// Proxy so API routes can `import { db }` unchanged — the real instance is
// created on first access, which happens after initializeDb() has run.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export async function initializeDb(): Promise<void> {
  const db = getDb()
  await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') })

  const existing = await db.select().from(appSchemas).limit(1)
  if (existing.length === 0) {
    const seedPath = join(process.cwd(), 'drizzle', 'seed.sql')
    const sql = readFileSync(seedPath, 'utf-8')
    await client.exec(sql)
  }

}
