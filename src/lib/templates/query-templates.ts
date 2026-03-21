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

const TAG_FILTERED_BY_STATE_SQL = `-- Define the data tag(s) that we want to know more about (totalize, value, etc)
WITH data_tags AS (
    SELECT name, description, location, info, labels
    FROM tag
    WHERE name = 'your_data_tag_here'
),
-- Define the tag whose state determines when we want to know something about the data tag(s)
state_tags AS (
    SELECT name, description, location, info, labels
    FROM tag
    WHERE name = 'your_state_tag_here'
),
-- Get the data events using the "standard query" as we usually do.
data_events AS (
    SELECT time, tag AS metric, value
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
    ORDER BY 1,2
),
-- And then do the same thing for the state events.
state_events AS (
    SELECT time, tag, value
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
    ORDER BY 1,2
),
-- Convert the state events to time ranges using the tsrange function.
state_ranges AS (
    SELECT tsrange(time, lead(time, 1, $__timeTo()) OVER (ORDER BY time)) AS tsrange,
    tag, value
    FROM state_events
)
-- Select the data, but only from time periods where the state matches criteria.
-- Change "sr.value = 2" to whatever state value you want to filter on.
SELECT time, de.metric, de.value
FROM data_events de
INNER JOIN state_ranges sr ON de.time <@ sr.tsrange AND sr.value = 2
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
      return { queryState: emptyQueryState(), userEditedSql: STANDARD_TIME_SERIES_SQL }

    case 'tag-filtered-by-state':
      return { queryState: emptyQueryState(), userEditedSql: TAG_FILTERED_BY_STATE_SQL }

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
