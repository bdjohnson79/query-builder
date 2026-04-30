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
import { buildSql } from '@/lib/sql-builder/knex-builder'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'
import type { FilterRule } from '@/types/query'

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

  it('chains the UNION ALL second branch with lateral join fully parsed', async () => {
    const result = await parseSqlToQueryState(STANDARD_TIME_SERIES_SQL, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.unionQuery).toBeDefined()
    expect(result.queryState.unionQuery!.operator).toBe('UNION ALL')

    const part2 = result.queryState.unionQuery!.queryState
    // Part 2 should have the tags CTE virtual table (t2)
    expect(tableNames(part2)).toContain('tags')
    const tagsVirtual2 = part2.tables.find((t) => t.tableName === 'tags')!
    expect(tagsVirtual2.alias).toBe('t2')

    // Part 2 should have the LATERAL join fully parsed (not skipped)
    const lateralJoin = part2.joins.find((j) => j.type === 'LATERAL')
    expect(lateralJoin).toBeDefined()
    expect(lateralJoin!.lateralAlias).toBe('e2')
    // The lateral subquery should reference the event table
    expect(lateralJoin!.lateralSubquery).toBeDefined()
    expect(lateralJoin!.lateralSubquery!.tables.some((t) => t.tableName === 'event')).toBe(true)
    // Not stored as rawSql — fully visual
    expect(result.queryState.unionQuery!.rawSql).toBeUndefined()
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

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — Grafana macro/variable restoration', () => {
  it('restores $__timeFrom() in a SELECT expression column', async () => {
    const sql = `
      SELECT $__timeFrom()::timestamp AS time, e.value
      FROM event e
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const timeCol = result.queryState.selectedColumns.find((c) => c.alias === 'time')
    expect(timeCol).toBeDefined()
    expect(timeCol!.expression).toContain('$__timeFrom()')
    expect(timeCol!.expression).not.toContain('2000-01-01')
    expect(timeCol!.expression).not.toContain('__SENT_')
    expect(noParseFailures(result.warnings)).toBe(true)
  })

  it('restores $__timeTo() in a SELECT expression column', async () => {
    const sql = `
      SELECT $__timeTo()::timestamp AS end_time, e.value
      FROM event e
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const col = result.queryState.selectedColumns.find((c) => c.alias === 'end_time')
    expect(col).toBeDefined()
    expect(col!.expression).toContain('$__timeTo()')
    expect(col!.expression).not.toContain('__SENT_')
  })

  it('restores $__timeFrom() in standard template Part 2 SELECT', async () => {
    const sql = `WITH tags AS (
      SELECT name, description, location FROM tag WHERE name = 'x'
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
    WHERE e2.value IS NOT NULL`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const part2 = result.queryState.unionQuery!.queryState
    const timeCol = part2.selectedColumns.find((c) => c.alias === 'time')
    expect(timeCol).toBeDefined()
    expect(timeCol!.expression).toContain('$__timeFrom()')
    expect(timeCol!.expression).not.toContain('2000-01-01')
    expect(timeCol!.expression).not.toContain('__SENT_')
  })

  it('restores dashboard variable $area in a filter value', async () => {
    const sql = `
      SELECT e.time, e.value
      FROM event e
      WHERE e.value = $area
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    // The value = $area comparison should restore $area in the filter rule value
    const rule = result.queryState.where.rules[0] as { value: string }
    expect(rule).toBeDefined()
    expect(rule.value).toBe('$area')
    expect(noParseFailures(result.warnings)).toBe(true)
  })

  it('restores ${varName} template variable in a filter value', async () => {
    const sql = `
      SELECT e.time, e.value
      FROM event e
      WHERE e.value = \${myVar}
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const rule = result.queryState.where.rules[0] as { value: string }
    expect(rule).toBeDefined()
    expect(rule.value).toBe('$myVar')
    expect(noParseFailures(result.warnings)).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — ORDER BY NULLS FIRST/LAST', () => {
  it('preserves NULLS LAST on ORDER BY items', async () => {
    const sql = `SELECT e.time, e.value FROM event e ORDER BY e.value DESC NULLS LAST`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.orderBy).toHaveLength(1)
    const ob = result.queryState.orderBy[0]
    expect(ob.direction).toBe('DESC')
    expect(ob.nulls).toBe('NULLS LAST')

    // Round-trip: builder should re-emit NULLS LAST
    const sqlOut = buildSql(result.queryState)
    expect(sqlOut.toUpperCase()).toContain('NULLS LAST')
  })

  it('preserves NULLS FIRST on ORDER BY items', async () => {
    const sql = `SELECT e.time FROM event e ORDER BY e.time ASC NULLS FIRST`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.orderBy[0].nulls).toBe('NULLS FIRST')
    expect(buildSql(result.queryState).toUpperCase()).toContain('NULLS FIRST')
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — aggregate FILTER (WHERE …)', () => {
  it('extracts FILTER (WHERE …) on COUNT(*)', async () => {
    const sql = `
      SELECT t.name, COUNT(*) FILTER (WHERE t.factor > 1) AS positive_count
      FROM tag t
      GROUP BY t.name
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const aggCol = result.queryState.selectedColumns.find((c) => c.aggregate === 'COUNT')
    expect(aggCol).toBeDefined()
    expect(aggCol!.filterClause).toBeDefined()
    expect(aggCol!.filterClause).toContain('factor')

    const out = buildSql(result.queryState).replace(/\s+/g, ' ').toUpperCase()
    expect(out).toContain('FILTER ( WHERE')
  })

  it('extracts FILTER (WHERE …) on SUM(col)', async () => {
    const sql = `
      SELECT SUM(e.value) FILTER (WHERE e.value > 0) AS positive_sum
      FROM event e
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const sumCol = result.queryState.selectedColumns.find((c) => c.aggregate === 'SUM')
    expect(sumCol?.filterClause).toMatch(/value\s*>\s*0/)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — window functions', () => {
  it('extracts ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)', async () => {
    const sql = `
      SELECT e.tag, ROW_NUMBER() OVER (PARTITION BY e.tag ORDER BY e.time DESC) AS rn
      FROM event e
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.windowFunctions).toHaveLength(1)
    const wf = result.queryState.windowFunctions[0]
    expect(wf.fn).toBe('ROW_NUMBER')
    expect(wf.alias).toBe('rn')
    expect(wf.partitionBy).toHaveLength(1)
    expect(wf.partitionBy[0].columnName).toBe('tag')
    expect(wf.orderBy).toHaveLength(1)
    expect(wf.orderBy[0].columnName).toBe('time')
    expect(wf.orderBy[0].direction).toBe('DESC')

    // Window functions should NOT also appear in selectedColumns
    expect(result.queryState.selectedColumns.find((c) => c.alias === 'rn')).toBeUndefined()
  })

  it('extracts SUM(x) OVER (...) with expression argument', async () => {
    const sql = `
      SELECT e.tag, SUM(e.value) OVER (PARTITION BY e.tag) AS running
      FROM event e
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.windowFunctions).toHaveLength(1)
    const wf = result.queryState.windowFunctions[0]
    expect(wf.fn).toBe('SUM')
    expect(wf.expression).toBe('e.value')
    expect(wf.alias).toBe('running')
  })

  it('extracts ROWS BETWEEN frame clause', async () => {
    const sql = `
      SELECT SUM(e.value) OVER (
        ORDER BY e.time
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative
      FROM event e
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const wf = result.queryState.windowFunctions[0]
    expect(wf.frameClause).toBe('ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW')
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — subqueries in WHERE', () => {
  it('imports x IN (subquery) as a structured rule with nested QueryState', async () => {
    const sql = `
      SELECT e.time, e.value FROM event e
      WHERE e.tag IN (SELECT t.name FROM tag t WHERE t.factor > 1)
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.where.rules).toHaveLength(1)
    const rule = result.queryState.where.rules[0] as FilterRule
    expect(rule.operator).toBe('in')
    expect(rule.field).toBe('e.tag')
    expect(rule.subquery).toBeDefined()
    expect(rule.subquery!.tables).toHaveLength(1)
    expect(rule.subquery!.tables[0].tableName).toBe('tag')

    // Round-trip
    const sqlOut = buildSql(result.queryState).replace(/\s+/g, ' ').toUpperCase()
    expect(sqlOut).toContain(' IN (')
    expect(sqlOut).toContain('FROM TAG AS T')
  })

  it('imports EXISTS (subquery) as a structured rule', async () => {
    const sql = `
      SELECT e.time FROM event e
      WHERE EXISTS (SELECT 1 FROM tag t WHERE t.name = e.tag)
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const rule = result.queryState.where.rules[0] as FilterRule
    expect(rule.operator).toBe('exists')
    expect(rule.subquery).toBeDefined()
    expect(rule.subquery!.tables[0].tableName).toBe('tag')

    const sqlOut = buildSql(result.queryState).toUpperCase()
    expect(sqlOut).toContain('EXISTS (')
  })

  it('imports NOT EXISTS (subquery) as a structured rule', async () => {
    const sql = `
      SELECT e.time FROM event e
      WHERE NOT EXISTS (SELECT 1 FROM tag t WHERE t.name = e.tag)
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const rule = result.queryState.where.rules[0] as FilterRule
    expect(rule.operator).toBe('notExists')
    expect(rule.subquery).toBeDefined()

    expect(buildSql(result.queryState).toUpperCase()).toContain('NOT EXISTS (')
  })

  it('imports x NOT IN (subquery) as a structured rule', async () => {
    const sql = `
      SELECT e.time FROM event e
      WHERE e.tag NOT IN (SELECT t.name FROM tag t)
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const rule = result.queryState.where.rules[0] as FilterRule
    expect(rule.operator).toBe('notIn')
    expect(rule.subquery).toBeDefined()
  })

  it('imports a scalar subquery comparison: x = (SELECT MAX(...) ...)', async () => {
    const sql = `
      SELECT e.time, e.value FROM event e
      WHERE e.value = (SELECT MAX(value) FROM event)
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const rule = result.queryState.where.rules[0] as FilterRule
    expect(rule.operator).toBe('=')
    expect(rule.subquery).toBeDefined()
    // The subquery has a MAX aggregate
    expect(rule.subquery!.selectedColumns.some((c) => c.aggregate === 'MAX')).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — compound JOIN ON', () => {
  it('decomposes multi-equality JOIN ON into structured fields', async () => {
    const sql = `
      SELECT e.time, t.name
      FROM event e
      INNER JOIN tag t ON e.tag = t.name AND e.value = t.factor
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.joins).toHaveLength(1)
    const j = result.queryState.joins[0]
    expect(j.onExpression).toBeUndefined()
    expect(j.additionalOnConditions).toHaveLength(1)
    expect(j.additionalOnConditions![0].operator).toBe('=')

    // Builder re-emits both conjuncts
    const sqlOut = buildSql(result.queryState).toUpperCase()
    expect(sqlOut).toContain(' AND ')
    expect(sqlOut).toContain('FACTOR')
  })

  it('falls back to onExpression when ON contains a non-column comparison', async () => {
    const sql = `
      SELECT e.time
      FROM event e
      INNER JOIN tag t ON e.tag = t.name AND t.factor > 1
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const j = result.queryState.joins[0]
    expect(j.onExpression).toBeDefined()
    expect(j.additionalOnConditions).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — CASE expression in WHERE', () => {
  it('preserves a CASE expression as a single expression-rule with a specific warning', async () => {
    const sql = `
      SELECT e.time FROM event e
      WHERE CASE WHEN e.value > 0 THEN TRUE ELSE FALSE END
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const rule = result.queryState.where.rules[0] as FilterRule
    expect(rule.operator).toBe('expression')
    expect(String(rule.value).toUpperCase()).toContain('CASE')
    expect(result.warnings.some((w) => w.includes('CASE expression'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — schema-qualified and quoted identifiers', () => {
  it('matches schema-qualified table refs by lowercased schema and name', async () => {
    const sql = `SELECT e.time FROM "KHC x ST-One".event e`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.tables).toHaveLength(1)
    expect(result.queryState.tables[0].tableName).toBe('event')
  })

  it('matches a quoted lower-case table name', async () => {
    const sql = `SELECT e.time FROM "event" e`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.tables).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — deep UNION chains', () => {
  it('chains 3+ branches with mixed set operators', async () => {
    const sql = `
      SELECT e.tag FROM event e WHERE e.value > 0
      UNION ALL
      SELECT e.tag FROM event e WHERE e.value < 0
      UNION
      SELECT t.name FROM tag t
      INTERSECT
      SELECT e.tag FROM event e
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    const operators: string[] = []
    let cur = result.queryState.unionQuery
    while (cur) {
      operators.push(cur.operator)
      cur = cur.queryState.unionQuery
    }
    expect(operators).toEqual(['UNION ALL', 'UNION', 'INTERSECT'])
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — LIMIT/OFFSET non-literal warning', () => {
  it('warns when LIMIT is a non-literal expression and drops it', async () => {
    const sql = `SELECT e.time FROM event e LIMIT 100 + 1`
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.limit).toBeNull()
    expect(result.warnings.some((w) => w.startsWith('LIMIT'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('parseSqlToQueryState — GROUPING SETS warning', () => {
  it('warns and drops items when GROUP BY uses ROLLUP', async () => {
    const sql = `
      SELECT e.tag, COUNT(*)
      FROM event e
      GROUP BY ROLLUP(e.tag)
    `
    const result = await parseSqlToQueryState(sql, ALL_TABLES, COLUMNS, SCHEMAS)

    expect(result.queryState.groupBy).toHaveLength(0)
    expect(result.warnings.some((w) => w.includes('GROUP BY'))).toBe(true)
  })
})
