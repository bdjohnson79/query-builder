// API request/response types

import type { AppSchema, AppTable, AppColumn, AppForeignKey, SavedQuery } from './schema'
import type { QueryState } from './query'

// Schemas
export interface CreateSchemaBody { name: string }
export type SchemaResponse = AppSchema
export type SchemasResponse = AppSchema[]

// Tables
export interface CreateTableBody { schemaId: number; name: string; displayName?: string }
export interface UpdateTableBody { name?: string; displayName?: string }
export type TableResponse = AppTable & { columns?: AppColumn[] }
export type TablesResponse = TableResponse[]

// Columns
export interface CreateColumnBody {
  name: string
  pgType: string
  isNullable?: boolean
  defaultValue?: string
  isPrimaryKey?: boolean
  ordinalPosition?: number
}
export interface UpdateColumnBody extends Partial<CreateColumnBody> {}
export type ColumnResponse = AppColumn

// Foreign Keys
export interface CreateForeignKeyBody {
  fromColumnId: number
  toColumnId: number
  constraintName?: string
}
export type ForeignKeyResponse = AppForeignKey & {
  fromColumn?: AppColumn & { table?: AppTable }
  toColumn?: AppColumn & { table?: AppTable }
}
export type ForeignKeysResponse = ForeignKeyResponse[]

// Queries
export interface CreateQueryBody {
  name: string
  description?: string
  queryState: QueryState
  generatedSql?: string
  schemaId?: number
}
export interface UpdateQueryBody extends Partial<CreateQueryBody> {}
export type QueryResponse = SavedQuery
export type QueriesResponse = SavedQuery[]

// LLM
export interface LlmSuggestBody {
  queryState: QueryState
  prompt: string
}
export interface LlmSuggestResponse {
  queryState: QueryState
}

// Generic API error
export interface ApiError {
  error: string
  details?: unknown
}
