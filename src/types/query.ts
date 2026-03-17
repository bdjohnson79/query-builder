// Core query state types for the SQL Query Builder

import type { JsonbMapping } from './json-structure'
export type { JsonbMapping }

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER' | 'CROSS'

export interface ColumnRef {
  tableAlias: string
  columnName: string
}

export interface TableInstance {
  id: string          // unique instance id (uuid)
  tableId: number     // references app_tables.id
  tableName: string
  schemaName: string
  alias: string
  position: { x: number; y: number }
  columns: ColumnMeta[]
}

export interface ColumnMeta {
  id: number
  name: string
  pgType: string
  isNullable: boolean
  isPrimaryKey: boolean
}

export interface JoinDef {
  id: string
  type: JoinType
  leftTableAlias: string
  leftColumn: string
  rightTableAlias: string
  rightColumn: string
}

export interface SelectedColumn {
  id: string
  tableAlias: string
  columnName: string
  alias?: string
  expression?: string  // for computed columns
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

export interface CTEDef {
  id: string
  name: string
  recursive: boolean
  queryState: QueryState
}

export interface QueryState {
  tables: TableInstance[]
  joins: JoinDef[]
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
}

export function emptyFilterGroup(): FilterGroup {
  return { id: crypto.randomUUID(), combinator: 'AND', rules: [] }
}

export function emptyQueryState(): QueryState {
  return {
    tables: [],
    joins: [],
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
  }
}
