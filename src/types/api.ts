// API request/response types

import type { AppSchema, AppTable, AppColumn, AppForeignKey, SavedQuery, QueryFolder } from './schema'
import type { QueryState } from './query'
import type { JsonStructure, JsonStructureDefinition } from './json-structure'

// Schemas
export interface CreateSchemaBody { name: string }
export type SchemaResponse = AppSchema
export type SchemasResponse = AppSchema[]

// Tables
export interface CreateTableBody { schemaId: number; name: string; displayName?: string }
export interface UpdateTableBody { name?: string; displayName?: string; description?: string | null }
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
  description?: string | null
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

// Folders
export interface CreateFolderBody { name: string }
export type FolderResponse = QueryFolder
export type FoldersResponse = QueryFolder[]

// Queries
export interface CreateQueryBody {
  name: string
  description?: string
  queryState: QueryState
  generatedSql?: string
  schemaId?: number
  folderId?: number | null
  tags?: string[] | null
  isTemplate?: boolean
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

// JSON Structures
export interface CreateJsonStructureBody {
  name: string
  description?: string
  definition: JsonStructureDefinition
}
export interface UpdateJsonStructureBody {
  name?: string
  description?: string | null
  definition?: JsonStructureDefinition
}
export type JsonStructureResponse = JsonStructure
export type JsonStructuresResponse = JsonStructure[]

// Generic API error
export interface ApiError {
  error: string
  details?: unknown
}
