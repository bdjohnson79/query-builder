/**
 * Integration tests for parseSqlToQueryState.
 *
 * These tests call the real pgsql-parser (WASM) in Node.js and verify that
 * the resulting QueryState has the expected structural content — matching
 * schema tables, CTEs, joins, selected columns, and UNION branches.
 *
 * Schema fixtures mirror the ST-One seed data so tests reflect the actual
 * tables a user would import against.
 */
import { describe, it, expect } from 'vitest'
import { parseSqlToQueryState } from './grafana-sql-importer'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'

// ---------------------------------------------------------------------------
// ST-One schema fixtures (from drizzle/seed.sql)
// ---------------------------------------------------------------------------

const SCHEMA: AppSchema = { id: 3, name: 'KHC x ST-One' }

const TABLE_EVENT:        AppTable = { id: 7,  schemaId: 3, name: 'event',         displayName: 'Event',            description: null }
const TABLE_TAG:          AppTable = { id: 8,  schemaId: 3, name: 'tag',           displayName: 'Tag',              description: null }
const TABLE_LOCATION:     AppTable = { id: 9,  schemaId: 3, name: 'location',      displayName: 'Location',         description: null }
const TABLE_LOCATION_TREE:AppTable = { id: 10, schemaId: 3, name: 'location_tree', displayName: 'Location Tree',    description: null }
const TABLE_AGG:          AppTable = { id: 11, schemaId: 3, name: 'agg',           displayName: 'Aggregation',      description: null }
const TABLE_AGG_EVENT:    AppTable = { id: 12, schemaId: 3, name: 'agg_event',     displayName: 'Aggregation Data', description: null }
const TABLE_FORM:         AppTable = { id: 13, schemaId: 3, name: 'form',          displayName: 'Form',             description: null }
const TABLE_FORM_EVENT:   AppTable = { id: 15, schemaId: 3, name: 'form_event',    displayName: 'Form Event',       description: null }
const TABLE_FORM_DATA:    AppTable = { id: 14, schemaId: 3, name: 'form_data',     displayName: 'Form Data',        description: null }

const ALL_TABLES: AppTable[] = [
  TABLE_EVENT, TABLE_TAG, TABLE_LOCATION, TABLE_LOCATION_TREE,
  TABLE_AGG, TABLE_AGG_EVENT, TABLE_FORM, TABLE_FORM_EVENT, TABLE_FORM_DATA,
]

function col(id: number, tableId: number, name: string, pgType: string, opts?: Partial<AppColumn>): AppColumn {
  return {
    id,
    tableId,
    name,
    pgType,
    isNullable: opts?.isNullable ?? true,
    defaultValue: opts?.defaultValue ?? null,
    isPrimaryKey: opts?.isPrimaryKey ?? false,
    ordinalPosition: opts?.ordinalPosition ?? 1,
    description: opts?.description ?? null,
  }
}

const COLUMNS: Record<number, AppColumn[]> = {
  // event (id=7): time, tag, value, info
  7: [
    col(28, 7, 'time',  'timestamp', { isNullable: false, ordinalPosition: 1 }),
    col(29, 7, 'tag',   'text',      { isNullable: false, ordinalPosition: 2 }),
    col(30, 7, 'value', 'float4',    { isNullable: true,  ordinalPosition: 3 }),
    col(31, 7, 'info',  'jsonb',     { isNullable: true,  ordinalPosition: 4 }),
  ],
  // tag (id=8): id, name, description, location, factor, offset, info, ...
  8: [
    col(32, 8, 'id',          'int4',       { isNullable: false, isPrimaryKey: true, ordinalPosition: 1 }),
    col(33, 8, 'name',        'varchar',    { isNullable: false, ordinalPosition: 2 }),
    col(34, 8, 'description', 'text',       { isNullable: true,  ordinalPosition: 3 }),
    col(35, 8, 'location',    'int4',       { isNullable: true,  ordinalPosition: 5 }),
    col(36, 8, 'factor',      'float8',     { isNullable: false, defaultValue: '1',  ordinalPosition: 6 }),
    col(37, 8, 'offset',      'float8',     { isNullable: false, defaultValue: '0',  ordinalPosition: 7 }),
    col(38, 8, 'info',        'jsonb',      { isNullable: true,  ordinalPosition: 8 }),
    col(39, 8, 'created_at',  'timestamptz',{ isNullable: false, ordinalPosition: 9 }),
    col(40, 8, 'updated_at',  'timestamptz',{ isNullable: true,  ordinalPosition: 10 }),
    col(41, 8, 'labels',      'ltree[]',   { isNullable: true,  ordinalPosition: 11 }),
    col(42, 8, 'type',        'text',       { isNullable: true,  ordinalPosition: 12 }),
  ],
  // location (id=9)
  9: [
    col(43, 9, 'id',          'int4',    { isNullable: false, isPrimaryKey: true, ordinalPosition: 1 }),
    col(44, 9, 'name',        'varchar', { isNullable: false, ordinalPosition: 2 }),
    col(45, 9, 'description', 'text',    { isNullable: true,  ordinalPosition: 3 }),
    col(46, 9, 'parent',      'int4',    { isNullable: true,  ordinalPosition: 4 }),
    col(47, 9, 'is_machine',  'bool',    { isNullable: true,  ordinalPosition: 5 }),
    col(48, 9, 'info',        'jsonb',   { isNullable: true,  ordinalPosition: 6 }),
    col(49, 9, 'created_at',  'timestamptz', { isNullable: false, ordinalPosition: 7 }),
    col(50, 9, 'updated_at',  'timestamptz', { isNullable: true,  ordinalPosition: 8 }),
    col(51, 9, 'active',      'bool',    { isNullable: false, defaultValue: 'false', ordinalPosition: 9 }),
    col(52, 9, 'slug',        'varchar', { isNullable: false, ordinalPosition: 10 }),
    col(53, 9, 'asset_types', 'ltree[]', { isNullable: true,  ordinalPosition: 11 }),
  ],
  // agg (id=11)
  11: [
    col(61, 11, 'cid',          'varchar',   { isNullable: false, ordinalPosition: 1 }),
    col(62, 11, 'id',           'uuid',      { isNullable: false, isPrimaryKey: true, ordinalPosition: 2 }),
    col(63, 11, 'slug_agg',     'text',      { isNullable: true,  ordinalPosition: 3 }),
    col(64, 11, 'var',          'jsonb',     { isNullable: true,  ordinalPosition: 4 }),
    col(65, 11, 'active',       'bool',      { isNullable: false, defaultValue: 'true', ordinalPosition: 5 }),
    col(66, 11, 'labels',       'ltree[]',   { isNullable: true,  ordinalPosition: 6 }),
    col(67, 11, 'location_slug','varchar',   { isNullable: false, ordinalPosition: 7 }),
  ],
  // agg_event (id=12)
  12: [
    col(77, 12, 'time',       'timestamp', { isNullable: false, ordinalPosition: 1 }),
    col(78, 12, 'tsrange',    'tsrange',   { isNullable: true,  ordinalPosition: 2 }),
    col(79, 12, 'agg',        'uuid',      { isNullable: false, ordinalPosition: 3 }),
    col(80, 12, 'value',      'float4',    { isNullable: true,  ordinalPosition: 4 }),
    col(81, 12, 'info',       'jsonb',     { isNullable: true,  ordinalPosition: 5 }),
    col(82, 12, 'created_at', 'timestamp', { isNullable: false, ordinalPosition: 6 }),
    col(83, 12, 'updated_at', 'timestamp', { isNullable: true,  ordinalPosition: 7 }),
  ],
}

const SCHEMAS = [SCHEMA]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the table names in order from a QueryState's tables array. */
function tableNames(qs: { tables: { tableName: string }[] }): string[] {
  return qs.tables.map((t) => t.tableName)
}

/** Return the CTE names in order. */
function cteNames(qs: { ctes: { name: string }[] }): string[] {
  return qs.ctes.map((c) => c.name)
}

/** True when no warning mentions "unsupported syntax" or "parse failed". */
function noParseFailures(warnings: string[]): boolean {
  return warnings.every(
    (w) => !w.includes('unsupported') && !w.includes('parse failed') && !w.includes('per-CTE fallback')
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — basic SELECT', () => {
  it('matches a single schema table by name', async () => {
    const sql = `SELECT e.time, e.tag, e.value FROM event e`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.tables).toHaveLength(1)
    expect(result.queryState.tables[0].tableName).toBe('event')
    expect(result.queryState.tables[0].alias).toBe('e')
    expect(result.queryState.tables[0].tableId).toBe(7)
    expect(result.queryState.tables[0].schemaName).toBe('KHC x ST-One')
    expect(result.queryState.tables[0].cteId).toBeUndefined()
  })

  it('extracts selected columns with correct table alias and column name', async () => {
    const sql = `SELECT e.time, e.tag, e.value FROM event e`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const cols = result.queryState.selectedColumns
    expect(cols).toHaveLength(3)
    expect(cols[0]).toMatchObject({ tableAlias: 'e', columnName: 'time' })
    expect(cols[1]).toMatchObject({ tableAlias: 'e', columnName: 'tag' })
    expect(cols[2]).toMatchObject({ tableAlias: 'e', columnName: 'value' })
  })

  it('extracts a simple WHERE condition', async () => {
    const sql = `SELECT e.value FROM event e WHERE e.value > 10`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.where.rules).toHaveLength(1)
    const rule = result.queryState.where.rules[0] as { field: string }
    expect(rule.field).toContain('value')
  })

  it('emits a warning for an unknown table but does not crash', async () => {
    const sql = `SELECT x.id FROM nonexistent_table x`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.tables).toHaveLength(0)
    expect(result.warnings.some((w) => w.includes('nonexistent_table'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — JOINs', () => {
  it('matches both tables in an INNER JOIN', async () => {
    const sql = `
      SELECT e.time, t.name, e.value
      FROM event e
      INNER JOIN tag t ON e.tag = t.name
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(tableNames(result.queryState)).toEqual(expect.arrayContaining(['event', 'tag']))
    expect(result.queryState.tables).toHaveLength(2)
  })

  it('extracts the JOIN definition with correct aliases and columns', async () => {
    const sql = `
      SELECT e.time, t.name
      FROM event e
      INNER JOIN tag t ON e.tag = t.name
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.joins).toHaveLength(1)
    const join = result.queryState.joins[0]
    expect(join.type).toBe('INNER')
    expect(join.leftTableAlias).toBe('e')
    expect(join.leftColumn).toBe('tag')
    expect(join.rightTableAlias).toBe('t')
    expect(join.rightColumn).toBe('name')
  })

  it('matches both tables in a LEFT JOIN', async () => {
    const sql = `
      SELECT l.name, e.value
      FROM location l
      LEFT JOIN event e ON e.tag = l.slug
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(tableNames(result.queryState)).toEqual(expect.arrayContaining(['location', 'event']))
    expect(result.queryState.joins[0].type).toBe('LEFT')
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — CTEs', () => {
  it('parses a non-recursive CTE into visual mode (no rawSql)', async () => {
    const sql = `
      WITH filtered AS (
        SELECT e.tag, e.value
        FROM event e
        WHERE e.value > 0
      )
      SELECT f.tag, f.value FROM filtered f
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.ctes).toHaveLength(1)
    const cte = result.queryState.ctes[0]
    expect(cte.name).toBe('filtered')
    expect(cte.rawSql).toBeUndefined()        // visual mode, not raw SQL
    expect(cte.queryState.tables).toHaveLength(1)
    expect(cte.queryState.tables[0].tableName).toBe('event')
    expect(noParseFailures(result.warnings)).toBe(true)
  })

  it('exposes the CTE as a virtual table instance in the main query', async () => {
    const sql = `
      WITH filtered AS (
        SELECT e.tag, e.value
        FROM event e
      )
      SELECT f.tag, f.value FROM filtered f
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    // Main query should have 'filtered' as a CTE virtual table
    expect(result.queryState.tables).toHaveLength(1)
    const vtable = result.queryState.tables[0]
    expect(vtable.tableName).toBe('filtered')
    expect(vtable.alias).toBe('f')
    expect(vtable.tableId).toBe(0)      // CTE virtual tables use tableId 0
    expect(vtable.cteId).toBe(result.queryState.ctes[0].id)
  })

  it('exposes CTE output columns derived from the CTE body SELECT', async () => {
    const sql = `
      WITH tag_summary AS (
        SELECT t.name, t.description, t.location
        FROM tag t
      )
      SELECT ts.name FROM tag_summary ts
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const cte = result.queryState.ctes[0]
    const outColNames = cte.outputColumns.map((c) => c.name)
    expect(outColNames).toContain('name')
    expect(outColNames).toContain('description')
  })

  it('parses multiple CTEs with correct ordering', async () => {
    const sql = `
      WITH
        first_cte AS (SELECT e.tag FROM event e),
        second_cte AS (SELECT f.tag FROM first_cte f)
      SELECT s.tag FROM second_cte s
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(cteNames(result.queryState)).toEqual(['first_cte', 'second_cte'])
    // second_cte references first_cte as a virtual table
    expect(result.queryState.ctes[1].queryState.tables[0].tableName).toBe('first_cte')
    expect(result.queryState.ctes[1].queryState.tables[0].cteId).toBe(result.queryState.ctes[0].id)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — UNION', () => {
  it('chains a UNION ALL into queryState.unionQuery', async () => {
    const sql = `
      SELECT e.time, e.value FROM event e WHERE e.tag = 'sensor_1'
      UNION ALL
      SELECT e.time, e.value FROM event e WHERE e.tag = 'sensor_2'
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    // Main branch
    expect(result.queryState.tables).toHaveLength(1)
    expect(result.queryState.tables[0].tableName).toBe('event')

    // UNION branch
    expect(result.queryState.unionQuery).toBeDefined()
    expect(result.queryState.unionQuery!.operator).toBe('UNION ALL')
    expect(result.queryState.unionQuery!.queryState.tables).toHaveLength(1)
    expect(result.queryState.unionQuery!.queryState.tables[0].tableName).toBe('event')
  })

  it('chains three branches for a 3-way UNION ALL', async () => {
    const sql = `
      SELECT e.time, e.value FROM event e WHERE e.tag = 'a'
      UNION ALL
      SELECT e.time, e.value FROM event e WHERE e.tag = 'b'
      UNION ALL
      SELECT e.time, e.value FROM event e WHERE e.tag = 'c'
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    // Chain: main → branch1 → branch2
    expect(result.queryState.unionQuery).toBeDefined()
    expect(result.queryState.unionQuery!.queryState.unionQuery).toBeDefined()
    expect(result.queryState.unionQuery!.queryState.unionQuery!.operator).toBe('UNION ALL')
    expect(result.queryState.unionQuery!.queryState.unionQuery!.queryState.tables[0].tableName).toBe('event')
  })

  it('stores UNION (distinct) with correct operator', async () => {
    const sql = `
      SELECT e.tag FROM event e
      UNION
      SELECT t.name FROM tag t
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.unionQuery!.operator).toBe('UNION')
  })

  it('stores INTERSECT with correct operator', async () => {
    const sql = `
      SELECT e.tag FROM event e
      INTERSECT
      SELECT t.name FROM tag t
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.unionQuery!.operator).toBe('INTERSECT')
  })

  it('stores EXCEPT ALL with correct operator', async () => {
    const sql = `
      SELECT e.tag FROM event e
      EXCEPT ALL
      SELECT t.name FROM tag t
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.unionQuery!.operator).toBe('EXCEPT ALL')
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — Grafana macros', () => {
  it('handles $__timeFilter macro — parse succeeds and adds a macro warning', async () => {
    const sql = `SELECT e.time, e.value FROM event e WHERE $__timeFilter(e.time)`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.tables[0].tableName).toBe('event')
    expect(result.warnings.some((w) => w.includes('Grafana macros'))).toBe(true)
    expect(noParseFailures(result.warnings)).toBe(true)
  })

  it('handles $__timeFrom and $__timeTo macros without crashing', async () => {
    const sql = `
      SELECT e.time, e.value FROM event e
      WHERE e.time >= $__timeFrom() AND e.time < $__timeTo()
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.tables[0].tableName).toBe('event')
    expect(noParseFailures(result.warnings)).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — standard time-series template', () => {
  /**
   * This is the exact SQL from STANDARD_TIME_SERIES_SQL in query-templates.ts.
   * It exercises: CTE (visual mode referencing tag table), UNION ALL, LATERAL
   * join (skipped with warning), Grafana macros, and schema table matching.
   *
   * After a successful import, the builder canvas should show:
   *   - CTE panel: 1 CTE named "tags" (visual, referencing the tag table)
   *   - Canvas Part 1: event node + tags virtual table node, INNER JOIN between them
   *   - Canvas Part 2: tags virtual table node (second branch of UNION)
   */
  const STANDARD_TIME_SERIES_SQL = `WITH tags AS (
    SELECT name, description, location
    FROM tag
    WHERE name = 'your_tag_name_here'
        OR name = 'your_other_tag_here'
        OR name = 'your_tag_here'
)

SELECT time, t.description, value
FROM event e
INNER JOIN tags t ON e.tag = t.name
WHERE $__timeFilter("time")
UNION ALL
SELECT $__timeFrom()::timestamp AS time, t2.description, value
FROM tags t2
LEFT JOIN LATERAL (
    SELECT time, t2.description, value
    FROM event
    WHERE time BETWEEN $__timeFrom()::timestamp - INTERVAL '30d' AND $__timeFrom()::timestamp
        AND tag = t2.name
    ORDER BY time DESC
    LIMIT 1
) e2 ON true
WHERE e2.value IS NOT NULL
ORDER BY 1,2`

  it('parses the CTE visually (no rawSql fallback)', async () => {
    const result = await parseSqlToQueryState(STANDARD_TIME_SERIES_SQL, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.ctes).toHaveLength(1)
    const tagsCte = result.queryState.ctes[0]
    expect(tagsCte.name).toBe('tags')
    expect(tagsCte.rawSql).toBeUndefined()   // must NOT be a raw-SQL CTE
    expect(tagsCte.queryState.tables).toHaveLength(1)
    expect(tagsCte.queryState.tables[0].tableName).toBe('tag')
    expect(tagsCte.queryState.tables[0].tableId).toBe(8)
  })

  it('populates the main query (Part 1) with both event and tags virtual table', async () => {
    const result = await parseSqlToQueryState(STANDARD_TIME_SERIES_SQL, ALL_TABLES, COLUMNS, SCHEMAS)

    const names = tableNames(result.queryState)
    expect(names).toContain('event')
    expect(names).toContain('tags')

    const eventTable = result.queryState.tables.find((t) => t.tableName === 'event')!
    expect(eventTable.alias).toBe('e')
    expect(eventTable.tableId).toBe(7)

    const tagsVirtual = result.queryState.tables.find((t) => t.tableName === 'tags')!
    expect(tagsVirtual.cteId).toBe(result.queryState.ctes[0].id)
    expect(tagsVirtual.tableId).toBe(0)
  })

  it('extracts the INNER JOIN between event and tags in Part 1', async () => {
    const result = await parseSqlToQueryState(STANDARD_TIME_SERIES_SQL, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.joins).toHaveLength(1)
    const join = result.queryState.joins[0]
    expect(join.type).toBe('INNER')
    // e.tag = t.name
    expect(join.leftTableAlias).toBe('e')
    expect(join.leftColumn).toBe('tag')
    expect(join.rightTableAlias).toBe('t')
    expect(join.rightColumn).toBe('name')
  })

  it('chains the UNION ALL second branch with tags virtual table', async () => {
    const result = await parseSqlToQueryState(STANDARD_TIME_SERIES_SQL, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.unionQuery).toBeDefined()
    expect(result.queryState.unionQuery!.operator).toBe('UNION ALL')

    const part2 = result.queryState.unionQuery!.queryState
    const part2Names = tableNames(part2)
    expect(part2Names).toContain('tags')  // tags t2 in UNION Part 2

    const tagsVirtual2 = part2.tables.find((t) => t.tableName === 'tags')!
    expect(tagsVirtual2.alias).toBe('t2')
    expect(tagsVirtual2.cteId).toBe(result.queryState.ctes[0].id)
  })

  it('does not report any "unsupported syntax" or "per-CTE fallback" warnings', async () => {
    const result = await parseSqlToQueryState(STANDARD_TIME_SERIES_SQL, ALL_TABLES, COLUMNS, SCHEMAS)

    const badWarnings = result.warnings.filter(
      (w) => w.includes('unsupported') || w.includes('per-CTE fallback') || w.includes('parse failed')
    )
    expect(badWarnings).toEqual([])
  })

  it('produces canImport-true state: tables.length > 0 || ctes.length > 0', async () => {
    const result = await parseSqlToQueryState(STANDARD_TIME_SERIES_SQL, ALL_TABLES, COLUMNS, SCHEMAS)

    const canImport =
      result.queryState.tables.length > 0 || result.queryState.ctes.length > 0
    expect(canImport).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — complex template queries', () => {
  it('parses a multi-table JOIN query (agg + location + agg_event)', async () => {
    const sql = `
      SELECT
        a.slug_agg,
        l.name AS location_name,
        ae.value
      FROM agg a
      INNER JOIN location l ON l.slug = a.location_slug
      INNER JOIN agg_event ae ON ae.agg = a.id
      WHERE ae.time >= '2024-01-01' AND ae.time < '2024-02-01'
      ORDER BY ae.time
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(tableNames(result.queryState)).toEqual(
      expect.arrayContaining(['agg', 'location', 'agg_event'])
    )
    expect(result.queryState.tables).toHaveLength(3)
    expect(result.queryState.joins).toHaveLength(2)
    expect(result.queryState.orderBy).toHaveLength(1)
    expect(result.queryState.orderBy[0].columnName).toBe('time')
    expect(noParseFailures(result.warnings)).toBe(true)
  })

  it('parses a GROUP BY query with aggregate columns', async () => {
    const sql = `
      SELECT e.tag, COUNT(*) AS event_count, AVG(e.value) AS avg_value
      FROM event e
      GROUP BY e.tag
      ORDER BY event_count DESC
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.tables[0].tableName).toBe('event')
    expect(result.queryState.groupBy).toHaveLength(1)
    expect(result.queryState.groupBy[0].columnName).toBe('tag')

    const aggCols = result.queryState.selectedColumns.filter((c) => c.aggregate)
    expect(aggCols.length).toBeGreaterThanOrEqual(1)
    expect(aggCols.some((c) => c.aggregate?.toUpperCase() === 'AVG')).toBe(true)
  })

  it('parses a LIMIT + OFFSET query', async () => {
    const sql = `SELECT e.time, e.value FROM event e LIMIT 100 OFFSET 20`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.limit).toBe(100)
    expect(result.queryState.offset).toBe(20)
  })
})
