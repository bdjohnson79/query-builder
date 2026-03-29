// Core query state types for the SQL Query Builder

import type { JsonbMapping } from './json-structure'
export type { JsonbMapping }

/** REFERENCE is a visual-only dependency arrow — it renders on the canvas but emits no SQL. */
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER' | 'CROSS' | 'LATERAL' | 'REFERENCE'

export type UnionOperator = 'UNION ALL' | 'UNION'

export interface UnionBranch {
  operator: UnionOperator
  queryState: QueryState
  rawSql?: string  // when set, overrides queryState in SQL generation (escape hatch for raw SQL)
}

export type GrafanaPanelType = 'time-series' | 'stat' | 'bar-chart' | 'table' | 'heatmap'

export interface ColumnRef {
  tableAlias: string
  columnName: string
}

export interface TableInstance {
  id: string          // unique instance id (uuid)
  tableId: number     // references app_tables.id (0 for CTE virtual tables)
  tableName: string
  schemaName: string  // '' for CTE virtual tables (no schema prefix in SQL)
  alias: string
  position: { x: number; y: number }
  columns: ColumnMeta[]
  cteId?: string      // set when this instance is a CTE virtual table
}

export interface ColumnMeta {
  id: number
  name: string
  pgType: string
  isNullable: boolean
  isPrimaryKey: boolean
  description?: string | null
}

export interface JoinDef {
  id: string
  type: JoinType
  leftTableAlias: string
  leftColumn: string
  rightTableAlias: string
  rightColumn: string
  onExpression?: string  // when set, replaces the generated ON clause entirely
  // LATERAL join fields (only used when type === 'LATERAL')
  lateralSubquery?: QueryState
  lateralAlias?: string
  canvasPosition?: { x: number; y: number }  // canvas position for the LATERAL node
}

export interface SelectedColumn {
  id: string
  tableAlias: string
  columnName: string
  alias?: string
  expression?: string  // for computed columns (custom expressions, CASE WHEN, etc.)
  aggregate?: string   // 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT DISTINCT'
}

export interface JsonbExpansion {
  id: string
  tableAlias: string    // table alias that has the JSONB column (e.g. 'ae')
  columnName: string    // the JSONB column name (e.g. 'info')
  expandAlias: string   // alias for the expanded record (e.g. 'i')
  fields: { name: string; pgType: string }[]  // all fields in the CROSS JOIN definition
}

export interface JsonbArrayUnnesting {
  id: string
  tableAlias: string        // table alias with the JSONB column (e.g. 'ae')
  columnName: string        // JSONB column name (e.g. 'info')
  arrayPath: string         // dot-path to the array field (e.g. 'faults' or 'data.items')
  unnestAlias: string       // alias for the lateral result set (e.g. 'f')
  mode: 'elements' | 'recordset'
  recordsetFields: { name: string; pgType: string }[]  // used when mode === 'recordset'
}

// TimescaleDB time_bucket / time_bucket_gapfill grouping
export interface TimescaleBucket {
  columnRef: { tableAlias: string; columnName: string }  // the timestamp column to bucket
  interval: string   // e.g. '1 hour', '5 minutes', '$__interval'
  alias: string      // AS alias in SELECT (default: 'time')
  gapfill: boolean   // use time_bucket_gapfill instead of time_bucket
}

// Per-column gapfill strategy when time_bucket_gapfill is active
export interface GapfillStrategy {
  selectedColumnId: string   // id of the SelectedColumn to wrap
  strategy: 'locf' | 'interpolate'
}

export interface OrderByItem {
  tableAlias: string
  columnName: string
  direction: 'ASC' | 'DESC'
  nulls?: 'NULLS FIRST' | 'NULLS LAST'
}

export interface WindowFunctionDef {
  id: string
  fn: string           // e.g. 'ROW_NUMBER', 'SUM', 'LAG'
  expression?: string  // argument to fn (e.g. column name for SUM)
  partitionBy: ColumnRef[]
  orderBy: OrderByItem[]
  frameClause?: string // e.g. 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW'
  alias: string
}

// react-querybuilder compatible filter structures
export interface FilterRule {
  id: string
  field: string        // "tableAlias.columnName"
  operator: string
  value: string | number | boolean | null
}

export interface FilterGroup {
  id: string
  combinator: 'AND' | 'OR'
  rules: (FilterRule | FilterGroup)[]
}

export interface CteOutputColumn {
  name: string
  pgType: string
}

export interface CTEDef {
  id: string
  name: string
  recursive: boolean
  queryState: QueryState
  rawSql?: string              // when set, overrides queryState in SQL generation
  outputColumns: CteOutputColumn[]  // columns exposed when dragged as a virtual table
}

export interface QueryState {
  tables: TableInstance[]
  joins: JoinDef[]
  jsonbExpansions: JsonbExpansion[]
  jsonbArrayUnnestings: JsonbArrayUnnesting[]
  selectedColumns: SelectedColumn[]
  windowFunctions: WindowFunctionDef[]
  distinct: boolean
  where: FilterGroup
  groupBy: ColumnRef[]
  having: FilterGroup
  orderBy: OrderByItem[]
  limit: number | null
  offset: number | null
  ctes: CTEDef[]
  isSubquery: boolean
  jsonbMappings: JsonbMapping[]
  grafanaPanelType?: GrafanaPanelType
  isGrafanaVariable?: boolean
  timeColumn?: { tableAlias: string; columnName: string }
  timescaleBucket?: TimescaleBucket
  gapfillStrategies: GapfillStrategy[]
  unionQuery?: UnionBranch
}

export function emptyFilterGroup(): FilterGroup {
  return { id: crypto.randomUUID(), combinator: 'AND', rules: [] }
}

export function emptyQueryState(): QueryState {
  return {
    tables: [],
    joins: [],
    jsonbExpansions: [],
    jsonbArrayUnnestings: [],
    selectedColumns: [],
    windowFunctions: [],
    distinct: false,
    where: emptyFilterGroup(),
    groupBy: [],
    having: emptyFilterGroup(),
    orderBy: [],
    limit: null,
    offset: null,
    ctes: [],
    isSubquery: false,
    jsonbMappings: [],
    grafanaPanelType: undefined,
    isGrafanaVariable: false,
    timeColumn: undefined,
    timescaleBucket: undefined,
    gapfillStrategies: [],
    unionQuery: undefined,
  }
}
