import type { AppSchema, AppTable, AppColumn } from '@/types/schema'
import {
  emptyQueryState,
  emptyFilterGroup,
  type QueryState,
  type TableInstance,
  type JoinDef,
  type SelectedColumn,
  type JsonbExpansion,
  type JsonbMapping,
  type CTEDef,
  type CteOutputColumn,
} from '@/types/query'

export interface QueryTemplate {
  id: string
  name: string
  description: string
  category: 'time-series' | 'aggregation' | 'grafana-variable'
  tableNames: string[]
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'standard-time-series',
    name: 'Standard Time-Series',
    description:
      'UNION ALL + LEFT JOIN LATERAL lookback pattern for Grafana time-series panels. Includes tag filtering and backfill for the start of the time range.',
    category: 'time-series',
    tableNames: ['event', 'tag'],
  },
  {
    id: 'tag-filtered-by-state',
    name: 'Tag Filtered by State',
    description:
      '4-CTE pattern: fetches data events and state events independently, converts state events to time ranges (tsrange), then filters data to periods matching a target state value.',
    category: 'time-series',
    tableNames: ['event', 'tag'],
  },
  {
    id: 'oee-data-table',
    name: 'OEE Data Table',
    description:
      'Standard OEE aggregation query. Uses time_bucket, date_bin for production-day alignment, and CROSS JOIN jsonb_to_record to expand the info JSONB column into typed OEE fields.',
    category: 'aggregation',
    tableNames: ['agg', 'agg_event', 'location'],
  },
  {
    id: 'line-selector-variable',
    name: 'Line Selector Variable',
    description:
      'Grafana variable query returning line IDs and paths from the location hierarchy. Uses form/form_data join for line_config builder slugs. Returns __value and __text columns.',
    category: 'grafana-variable',
    tableNames: ['form', 'form_data', 'location_tree'],
  },
  {
    id: 'machine-selector-variable',
    name: 'Machine Selector Variable',
    description:
      'Simple Grafana variable query returning machine IDs and names from the location table. Filters by active status and sorts alphabetically. Returns __value and __text columns.',
    category: 'grafana-variable',
    tableNames: ['location'],
  },
]

// ---------------------------------------------------------------------------
// Template SQL (inlined from claude-planning/*.sql)
// ---------------------------------------------------------------------------

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

const OEE_DATA_TABLE_SQL = `-- Change the time zone to the site's local time zone.
-- Change the INTERVAL value to align with the start of the site's production day.
-- The example below is for a 7:00 AM start time.
SELECT
  time_bucket('1h', ae.time) AS time,
  date_bin('1 day', ae.time,
    date_trunc('day',now())::timestamp AT TIME ZONE 'America/Chicago' + INTERVAL '7 hour'
  ) AS production_date,
  l.name AS line_name, i.*, l.slug
  -- Uncomment any of these if desired
  -- ,i.sku #>> '{sku}' AS sku_number
  -- ,i.sku #>> '{label}' AS sku_label
  -- ,i.sku #>> '{description}' AS sku_description

FROM agg a
INNER JOIN location l ON l.slug = a.location_slug
INNER JOIN agg_event ae ON ae.agg = a.id
CROSS JOIN jsonb_to_record(ae.info) i(
  shift text,
  sku jsonb,
  time_total float,
  time_run float,
  time_stop float,
  stop_count float,
  time_scheduled float,
  time_unscheduled float,
  time_planned float,
  time_planned_maintenance float,
  time_planned_sanitation float,
  time_planned_changeover float,
  time_planned_breaks float,
  time_unplanned float,
  time_unplanned_logistics float,
  time_unplanned_breakdown float,
  time_unplanned_process float,
  prod_target float,
  time_prod_main float,
  time_prod_out float,
  prod_main float,
  prod_out float,
  prod_main_machine float,
  prod_out_machine float
  )
WHERE ae.time >= $__timeFrom() AND ae.time < $__timeTo()
  AND a.slug_agg = 'oee_1h'
  AND l.id IN ($area)
ORDER BY ae.time`

const LINE_SELECTOR_SQL = `SELECT la.id AS __value, la.path AS __text
FROM form flc
INNER JOIN form_data fdl ON fdl.form_slug = flc.slug
INNER JOIN location_tree la ON fdl.value #>> '{data,line,slug}' = la.slug
WHERE builder_slug = 'line_config' AND flc.active AND fdl.active
ORDER BY 2`

const MACHINE_SELECTOR_SQL = `SELECT l.id AS __value, l.name AS __text
FROM location l
WHERE l.active = true
ORDER BY l.name`

// ---------------------------------------------------------------------------
// Template resolver
// ---------------------------------------------------------------------------

export function resolveTemplate(
  id: string,
  schemaStore: { schemas: AppSchema[]; tables: AppTable[]; columns: Record<number, AppColumn[]> }
): { queryState: QueryState; userEditedSql: string | null } | null {
  switch (id) {
    case 'standard-time-series':
      return buildStandardTimeSeriesState(schemaStore)

    case 'tag-filtered-by-state':
      return buildTagFilteredByStateState(schemaStore)

    case 'oee-data-table':
      return { queryState: buildOeeQueryState(schemaStore), userEditedSql: null }

    case 'line-selector-variable':
      return {
        queryState: { ...emptyQueryState(), isGrafanaVariable: true },
        userEditedSql: LINE_SELECTOR_SQL,
      }

    case 'machine-selector-variable':
      return {
        queryState: { ...emptyQueryState(), isGrafanaVariable: true },
        userEditedSql: MACHINE_SELECTOR_SQL,
      }

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Helper: schema name lookup + column meta conversion
// ---------------------------------------------------------------------------

function makeHelpers(schemaStore: {
  schemas: AppSchema[]
  tables: AppTable[]
  columns: Record<number, AppColumn[]>
}) {
  const { schemas, columns } = schemaStore
  const getSchemaName = (schemaId: number) =>
    schemas.find((s) => s.id === schemaId)?.name ?? 'public'
  const toColumnMeta = (cols: AppColumn[]) =>
    cols.map((c) => ({
      id: c.id,
      name: c.name,
      pgType: c.pgType,
      isNullable: c.isNullable,
      isPrimaryKey: c.isPrimaryKey,
    }))
  return { getSchemaName, toColumnMeta, columns }
}

// ---------------------------------------------------------------------------
// Standard time-series: tags CTE (visual) + event+tags main + visual union lookback
// ---------------------------------------------------------------------------

/**
 * Builds the UNION ALL lookback branch as a fully visual QueryState.
 * Generates:
 *   SELECT $__timeFrom()::timestamp AS time, t2.description, e2.value
 *   FROM tags t2
 *   LEFT JOIN LATERAL (
 *     SELECT event.time, t2.description, event.value
 *     FROM event
 *     WHERE event.time timeLookback '30d'
 *       AND event.tag = t2.name
 *     ORDER BY event.time DESC
 *     LIMIT 1
 *   ) AS e2 ON TRUE
 *   WHERE e2.value IS NOT NULL
 */
function buildLookbackQueryState(
  tagsCteId: string,
  tagsOutputColumns: CteOutputColumn[],
  eventTable: AppTable,
  eventCols: AppColumn[],
  getSchemaName: (id: number) => string,
  toColumnMeta: (cols: AppColumn[]) => { id: number; name: string; pgType: string; isNullable: boolean; isPrimaryKey: boolean }[]
): QueryState {
  const lateralSubquery: QueryState = {
    ...emptyQueryState(),
    isSubquery: true,
    tables: [{
      id: crypto.randomUUID(),
      tableId: eventTable.id,
      tableName: eventTable.name,
      schemaName: getSchemaName(eventTable.schemaId),
      alias: 'event',
      position: { x: 0, y: 0 },
      columns: toColumnMeta(eventCols),
    }],
    selectedColumns: [
      { id: crypto.randomUUID(), tableAlias: 'event', columnName: 'time' },
      // t2 is outer scope — the SQL builder emits "t2"."description" which PostgreSQL resolves correctly
      { id: crypto.randomUUID(), tableAlias: 't2', columnName: 'description' },
      { id: crypto.randomUUID(), tableAlias: 'event', columnName: 'value' },
    ],
    where: {
      id: crypto.randomUUID(),
      combinator: 'AND',
      rules: [
        { id: crypto.randomUUID(), field: 'event.time', operator: 'timeLookback', value: '30d' },
        // t2.name is a column reference — quoteValue emits it unquoted
        { id: crypto.randomUUID(), field: 'event.tag', operator: '=', value: 't2.name' },
      ],
    },
    orderBy: [{ tableAlias: 'event', columnName: 'time', direction: 'DESC' }],
    limit: 1,
  }

  return {
    ...emptyQueryState(),
    tables: [{
      id: crypto.randomUUID(),
      tableId: 0,
      tableName: 'tags',
      schemaName: '',
      alias: 't2',
      cteId: tagsCteId,
      position: { x: 0, y: 100 },
      columns: tagsOutputColumns.map((c, i) => ({
        id: i,
        name: c.name,
        pgType: c.pgType,
        isNullable: true,
        isPrimaryKey: false,
      })),
    }],
    joins: [{
      id: crypto.randomUUID(),
      type: 'LATERAL',
      leftTableAlias: '',
      leftColumn: '',
      rightTableAlias: 'e2',
      rightColumn: '',
      lateralAlias: 'e2',
      onExpression: 'TRUE',
      lateralSubquery,
      canvasPosition: { x: 380, y: 100 },
    }],
    selectedColumns: [
      {
        id: crypto.randomUUID(),
        tableAlias: '__expr__',
        columnName: 'time',
        alias: 'time',
        expression: '$__timeFrom()::timestamp',
      },
      { id: crypto.randomUUID(), tableAlias: 't2', columnName: 'description' },
      { id: crypto.randomUUID(), tableAlias: 'e2', columnName: 'value' },
    ],
    where: {
      id: crypto.randomUUID(),
      combinator: 'AND',
      rules: [
        { id: crypto.randomUUID(), field: 'e2.value', operator: 'notNull', value: '' },
      ],
    },
  }
}

function buildStandardTimeSeriesState(schemaStore: {
  schemas: AppSchema[]
  tables: AppTable[]
  columns: Record<number, AppColumn[]>
}): { queryState: QueryState; userEditedSql: string | null } {
  const { tables } = schemaStore
  const { getSchemaName, toColumnMeta, columns } = makeHelpers(schemaStore)

  const eventTable = tables.find((t) => t.name === 'event')
  const tagTable   = tables.find((t) => t.name === 'tag')

  // Fall back to raw SQL if required tables are missing
  if (!eventTable || !tagTable) {
    return { queryState: emptyQueryState(), userEditedSql: STANDARD_TIME_SERIES_SQL }
  }

  const eventCols = columns[eventTable.id] ?? []
  const tagCols   = columns[tagTable.id] ?? []

  // ---- tags CTE (visual) ----
  const tagsCteId = crypto.randomUUID()
  const tagTableInstanceId = crypto.randomUUID()
  const tagTableAlias = 'tag'

  const tagsCteQueryState: QueryState = {
    ...emptyQueryState(),
    isSubquery: true,
    tables: [{
      id: tagTableInstanceId,
      tableId: tagTable.id,
      tableName: tagTable.name,
      schemaName: getSchemaName(tagTable.schemaId),
      alias: tagTableAlias,
      position: { x: 0, y: 100 },
      columns: toColumnMeta(tagCols),
    }],
    selectedColumns: (['name', 'description', 'location'] as const)
      .filter((n) => tagCols.some((c) => c.name === n))
      .map((n) => ({
        id: crypto.randomUUID(),
        tableAlias: tagTableAlias,
        columnName: n,
      })),
    where: {
      id: crypto.randomUUID(),
      combinator: 'OR',
      rules: [
        { id: crypto.randomUUID(), field: `${tagTableAlias}.name`, operator: '=', value: 'your_tag_name_here' },
        { id: crypto.randomUUID(), field: `${tagTableAlias}.name`, operator: '=', value: 'your_other_tag_here' },
        { id: crypto.randomUUID(), field: `${tagTableAlias}.name`, operator: '=', value: 'your_tag_here' },
      ],
    },
  }

  const tagsOutputColumns: CteOutputColumn[] = ['name', 'description', 'location'].map((n) => ({
    name: n,
    pgType: tagCols.find((c) => c.name === n)?.pgType ?? 'text',
  }))

  const tagsCte: CTEDef = {
    id: tagsCteId,
    name: 'tags',
    recursive: false,
    queryState: tagsCteQueryState,
    outputColumns: tagsOutputColumns,
  }

  // ---- Main query: event e INNER JOIN tags t ----
  const eventInstanceId = crypto.randomUUID()
  const tagsInstanceId  = crypto.randomUUID()

  const mainTables: TableInstance[] = [
    {
      id: eventInstanceId,
      tableId: eventTable.id,
      tableName: eventTable.name,
      schemaName: getSchemaName(eventTable.schemaId),
      alias: 'e',
      position: { x: 0, y: 100 },
      columns: toColumnMeta(eventCols),
    },
    {
      id: tagsInstanceId,
      tableId: 0,
      tableName: 'tags',
      schemaName: '',
      alias: 't',
      cteId: tagsCteId,
      position: { x: 380, y: 100 },
      columns: tagsOutputColumns.map((c, i) => ({
        id: i,
        name: c.name,
        pgType: c.pgType,
        isNullable: true,
        isPrimaryKey: false,
      })),
    },
  ]

  const mainJoins: JoinDef[] = []
  if (eventCols.some((c) => c.name === 'tag')) {
    mainJoins.push({
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: 'e',
      leftColumn: 'tag',
      rightTableAlias: 't',
      rightColumn: 'name',
    })
  }

  const mainSelectedColumns: SelectedColumn[] = []
  if (eventCols.some((c) => c.name === 'time')) {
    mainSelectedColumns.push({ id: crypto.randomUUID(), tableAlias: 'e', columnName: 'time' })
  }
  mainSelectedColumns.push({ id: crypto.randomUUID(), tableAlias: 't', columnName: 'description' })
  if (eventCols.some((c) => c.name === 'value')) {
    mainSelectedColumns.push({ id: crypto.randomUUID(), tableAlias: 'e', columnName: 'value' })
  }

  const queryState: QueryState = {
    ...emptyQueryState(),
    ctes: [tagsCte],
    tables: mainTables,
    joins: mainJoins,
    selectedColumns: mainSelectedColumns,
    where: {
      id: crypto.randomUUID(),
      combinator: 'AND',
      rules: [
        { id: crypto.randomUUID(), field: 'e.time', operator: '$__timeFilter', value: '' },
      ],
    },
    orderBy: [
      { tableAlias: 'e', columnName: 'time', direction: 'ASC' },
      { tableAlias: 't', columnName: 'description', direction: 'ASC' },
    ],
    unionQuery: { operator: 'UNION ALL', queryState: buildLookbackQueryState(tagsCteId, tagsOutputColumns, eventTable, eventCols, getSchemaName, toColumnMeta) },
    timeColumn: eventCols.some((c) => c.name === 'time')
      ? { tableAlias: 'e', columnName: 'time' }
      : undefined,
    grafanaPanelType: 'time-series',
  }

  return { queryState, userEditedSql: null }
}

// ---------------------------------------------------------------------------
// Tag filtered by state: 5 rawSql CTEs + virtual table instances + custom ON
// ---------------------------------------------------------------------------

const DATA_TAGS_SQL = `SELECT name, description, location, info, labels
FROM tag
WHERE name = 'your_data_tag_here'`

const STATE_TAGS_SQL = `SELECT name, description, location, info, labels
FROM tag
WHERE name = 'your_state_tag_here'`

const DATA_EVENTS_SQL = `SELECT time, tag AS metric, value
FROM event e
INNER JOIN data_tags dt ON e.tag = dt.name
WHERE $__timeFilter("time")
UNION ALL
SELECT $__timeFrom()::timestamp AS time, dt2.name AS metric, value
FROM data_tags dt2
LEFT JOIN LATERAL (
    SELECT time, dt2.name, value
    FROM event
    WHERE time BETWEEN $__timeFrom()::timestamp - INTERVAL '30d' AND $__timeFrom()::timestamp
        AND tag = dt2.name
    ORDER BY time DESC
    LIMIT 1
) e2 ON true
WHERE e2.value IS NOT NULL
ORDER BY 1,2`

const STATE_EVENTS_SQL = `SELECT time, tag, value
FROM event e
INNER JOIN state_tags st ON e.tag = st.name
WHERE $__timeFilter("time")
UNION ALL
SELECT $__timeFrom()::timestamp AS time, st2.name, value
FROM state_tags st2
LEFT JOIN LATERAL (
    SELECT time, st2.name, value
    FROM event
    WHERE time BETWEEN $__timeFrom()::timestamp - INTERVAL '30d' AND $__timeFrom()::timestamp
        AND tag = st2.name
    ORDER BY time DESC
    LIMIT 1
) e3 ON true
WHERE e3.value IS NOT NULL
ORDER BY 1,2`

const STATE_RANGES_SQL = `SELECT tsrange(time, lead(time, 1, $__timeTo()) OVER (ORDER BY time)) AS tsrange,
    tag, value
FROM state_events`

function buildTagFilteredByStateState(schemaStore: {
  schemas: AppSchema[]
  tables: AppTable[]
  columns: Record<number, AppColumn[]>
}): { queryState: QueryState; userEditedSql: string | null } {
  const tagEventCols: CteOutputColumn[] = [
    { name: 'name',        pgType: 'text' },
    { name: 'description', pgType: 'text' },
    { name: 'location',    pgType: 'text' },
    { name: 'info',        pgType: 'jsonb' },
    { name: 'labels',      pgType: 'jsonb' },
  ]
  const eventOutputCols: CteOutputColumn[] = [
    { name: 'time',   pgType: 'timestamptz' },
    { name: 'metric', pgType: 'text' },
    { name: 'value',  pgType: 'float8' },
  ]
  const stateEventOutputCols: CteOutputColumn[] = [
    { name: 'time',  pgType: 'timestamptz' },
    { name: 'tag',   pgType: 'text' },
    { name: 'value', pgType: 'float8' },
  ]
  const stateRangesOutputCols: CteOutputColumn[] = [
    { name: 'tsrange', pgType: 'tsrange' },
    { name: 'tag',     pgType: 'text' },
    { name: 'value',   pgType: 'float8' },
  ]

  const dataTagsCteId    = crypto.randomUUID()
  const stateTagsCteId   = crypto.randomUUID()
  const dataEventsCteId  = crypto.randomUUID()
  const stateEventsCteId = crypto.randomUUID()
  const stateRangesCteId = crypto.randomUUID()

  const makeCte = (
    id: string,
    name: string,
    rawSql: string,
    outputColumns: CteOutputColumn[]
  ): CTEDef => ({
    id,
    name,
    recursive: false,
    queryState: { ...emptyQueryState(), isSubquery: true },
    rawSql,
    outputColumns,
  })

  const ctes: CTEDef[] = [
    makeCte(dataTagsCteId,    'data_tags',    DATA_TAGS_SQL,    tagEventCols),
    makeCte(stateTagsCteId,   'state_tags',   STATE_TAGS_SQL,   tagEventCols),
    makeCte(dataEventsCteId,  'data_events',  DATA_EVENTS_SQL,  eventOutputCols),
    makeCte(stateEventsCteId, 'state_events', STATE_EVENTS_SQL, stateEventOutputCols),
    makeCte(stateRangesCteId, 'state_ranges', STATE_RANGES_SQL, stateRangesOutputCols),
  ]

  const toColMeta = (cols: CteOutputColumn[], startId = 0) =>
    cols.map((c, i) => ({
      id: startId + i,
      name: c.name,
      pgType: c.pgType,
      isNullable: true,
      isPrimaryKey: false,
    }))

  const mainTables: TableInstance[] = [
    {
      id: crypto.randomUUID(),
      tableId: 0,
      tableName: 'data_events',
      schemaName: '',
      alias: 'de',
      cteId: dataEventsCteId,
      position: { x: 0, y: 100 },
      columns: toColMeta(eventOutputCols),
    },
    {
      id: crypto.randomUUID(),
      tableId: 0,
      tableName: 'state_ranges',
      schemaName: '',
      alias: 'sr',
      cteId: stateRangesCteId,
      position: { x: 400, y: 100 },
      columns: toColMeta(stateRangesOutputCols, 10),
    },
  ]

  const mainJoins: JoinDef[] = [
    {
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: 'de',
      leftColumn: 'time',
      rightTableAlias: 'sr',
      rightColumn: 'tsrange',
      onExpression: 'de.time <@ sr.tsrange AND sr.value = 2',
    },
  ]

  const mainSelectedColumns: SelectedColumn[] = [
    { id: crypto.randomUUID(), tableAlias: 'de', columnName: 'time' },
    { id: crypto.randomUUID(), tableAlias: 'de', columnName: 'metric' },
    { id: crypto.randomUUID(), tableAlias: 'de', columnName: 'value' },
  ]

  const queryState: QueryState = {
    ...emptyQueryState(),
    ctes,
    tables: mainTables,
    joins: mainJoins,
    selectedColumns: mainSelectedColumns,
    orderBy: [
      { tableAlias: 'de', columnName: 'time',   direction: 'ASC' },
      { tableAlias: 'de', columnName: 'metric',  direction: 'ASC' },
    ],
    timeColumn: { tableAlias: 'de', columnName: 'time' },
    grafanaPanelType: 'time-series',
  }

  return { queryState, userEditedSql: null }
}

// oee_1h fields exactly as they appear in the jsonb_to_record CROSS JOIN
// (authoritative source: OEE_DATA_TABLE_SQL above)
const OEE_1H_FIELDS: { name: string; pgType: string }[] = [
  { name: 'shift',                    pgType: 'text' },
  { name: 'sku',                      pgType: 'jsonb' },
  { name: 'time_total',               pgType: 'float8' },
  { name: 'time_run',                 pgType: 'float8' },
  { name: 'time_stop',                pgType: 'float8' },
  { name: 'stop_count',               pgType: 'float8' },
  { name: 'time_scheduled',           pgType: 'float8' },
  { name: 'time_unscheduled',         pgType: 'float8' },
  { name: 'time_planned',             pgType: 'float8' },
  { name: 'time_planned_maintenance', pgType: 'float8' },
  { name: 'time_planned_sanitation',  pgType: 'float8' },
  { name: 'time_planned_changeover',  pgType: 'float8' },
  { name: 'time_planned_breaks',      pgType: 'float8' },
  { name: 'time_unplanned',           pgType: 'float8' },
  { name: 'time_unplanned_logistics', pgType: 'float8' },
  { name: 'time_unplanned_breakdown', pgType: 'float8' },
  { name: 'time_unplanned_process',   pgType: 'float8' },
  { name: 'prod_target',              pgType: 'float8' },
  { name: 'time_prod_main',           pgType: 'float8' },
  { name: 'time_prod_out',            pgType: 'float8' },
  { name: 'prod_main',                pgType: 'float8' },
  { name: 'prod_out',                 pgType: 'float8' },
  { name: 'prod_main_machine',        pgType: 'float8' },
  { name: 'prod_out_machine',         pgType: 'float8' },
]

function buildOeeQueryState(schemaStore: {
  schemas: AppSchema[]
  tables: AppTable[]
  columns: Record<number, AppColumn[]>
}): QueryState {
  const { schemas, tables, columns } = schemaStore

  const aggTable      = tables.find((t) => t.name === 'agg')
  const aggEventTable = tables.find((t) => t.name === 'agg_event')
  const locationTable = tables.find((t) => t.name === 'location')

  if (!aggTable || !aggEventTable || !locationTable) {
    return emptyQueryState()
  }

  const getSchemaName = (schemaId: number) =>
    schemas.find((s) => s.id === schemaId)?.name ?? 'public'

  const toColumnMeta = (cols: AppColumn[]) =>
    cols.map((c) => ({
      id: c.id,
      name: c.name,
      pgType: c.pgType,
      isNullable: c.isNullable,
      isPrimaryKey: c.isPrimaryKey,
    }))

  const tableInstances: TableInstance[] = [
    {
      id: crypto.randomUUID(),
      tableId: aggTable.id,
      tableName: aggTable.name,
      schemaName: getSchemaName(aggTable.schemaId),
      alias: 'a',
      position: { x: 0, y: 100 },
      columns: toColumnMeta(columns[aggTable.id] ?? []),
    },
    {
      id: crypto.randomUUID(),
      tableId: aggEventTable.id,
      tableName: aggEventTable.name,
      schemaName: getSchemaName(aggEventTable.schemaId),
      alias: 'ae',
      position: { x: 350, y: 100 },
      columns: toColumnMeta(columns[aggEventTable.id] ?? []),
    },
    {
      id: crypto.randomUUID(),
      tableId: locationTable.id,
      tableName: locationTable.name,
      schemaName: getSchemaName(locationTable.schemaId),
      alias: 'l',
      position: { x: 700, y: 100 },
      columns: toColumnMeta(columns[locationTable.id] ?? []),
    },
  ]

  const aggCols      = columns[aggTable.id] ?? []
  const aggEventCols = columns[aggEventTable.id] ?? []
  const locationCols = columns[locationTable.id] ?? []

  // -------------------------------------------------------------------------
  // Joins
  // -------------------------------------------------------------------------
  const joins: JoinDef[] = []

  if (aggCols.some((c) => c.name === 'location_slug') && locationCols.some((c) => c.name === 'slug')) {
    joins.push({
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: 'a',
      leftColumn: 'location_slug',
      rightTableAlias: 'l',
      rightColumn: 'slug',
    })
  }

  if (aggCols.some((c) => c.name === 'id') && aggEventCols.some((c) => c.name === 'agg')) {
    joins.push({
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: 'a',
      leftColumn: 'id',
      rightTableAlias: 'ae',
      rightColumn: 'agg',
    })
  }

  // -------------------------------------------------------------------------
  // JSONB mapping + expansion (ae.info → oee_1h preset, expand alias 'i')
  // -------------------------------------------------------------------------
  const expandAlias = 'i'

  const jsonbMappings: JsonbMapping[] = [
    { tableAlias: 'ae', columnName: 'info', structureId: -1 }, // -1 = oee_1h builtin
  ]

  const jsonbExpansions: JsonbExpansion[] = [
    {
      id: crypto.randomUUID(),
      tableAlias: 'ae',
      columnName: 'info',
      expandAlias,
      fields: OEE_1H_FIELDS,
    },
  ]

  // -------------------------------------------------------------------------
  // Selected columns
  // -------------------------------------------------------------------------
  const selectedColumns: SelectedColumn[] = [
    // time_bucket('1h', ae.time) AS time  — TimescaleDB time grouping
    {
      id: crypto.randomUUID(),
      tableAlias: '__expr__',
      columnName: 'time',
      alias: 'time',
      expression: "time_bucket('1h', ae.time)",
    },
    // l.name AS line_name
    {
      id: crypto.randomUUID(),
      tableAlias: 'l',
      columnName: 'name',
      alias: 'line_name',
    },
    // l.slug
    {
      id: crypto.randomUUID(),
      tableAlias: 'l',
      columnName: 'slug',
    },
    // All oee_1h JSONB expansion fields (alias 'i')
    ...OEE_1H_FIELDS.map((f): SelectedColumn => ({
      id: crypto.randomUUID(),
      tableAlias: expandAlias,
      columnName: f.name,
    })),
  ]

  // -------------------------------------------------------------------------
  // WHERE: $__timeFilter + slug_agg filter + $area Grafana variable
  // -------------------------------------------------------------------------
  const where = {
    ...emptyFilterGroup(),
    rules: [
      { id: crypto.randomUUID(), field: 'ae.time',    operator: '$__timeFilter', value: '' },
      { id: crypto.randomUUID(), field: 'a.slug_agg', operator: '=',             value: 'oee_1h' },
      { id: crypto.randomUUID(), field: 'l.id',       operator: 'in',            value: '$area' },
    ],
  }

  // -------------------------------------------------------------------------
  // ORDER BY ae.time ASC
  // -------------------------------------------------------------------------
  const orderBy = [
    { tableAlias: 'ae', columnName: 'time', direction: 'ASC' as const },
  ]

  return {
    ...emptyQueryState(),
    tables: tableInstances,
    joins,
    jsonbMappings,
    jsonbExpansions,
    selectedColumns,
    where,
    orderBy,
    timeColumn: { tableAlias: 'ae', columnName: 'time' },
    grafanaPanelType: 'table',
  }
}
