// Types for JSON structure definitions (used with PostgreSQL jsonb columns)

export type JsonFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface JsonField {
  key: string
  type: JsonFieldType
  description?: string
  pgCast?: string          // e.g. 'numeric', 'integer', 'bigint', 'float8', 'boolean'
  children?: JsonField[]   // populated when type === 'object'
  itemSchema?: JsonField[] // populated when type === 'array' (structural only, v1)
}

export interface JsonStructureDefinition {
  fields: JsonField[]
}

export interface JsonStructure {
  id: number
  name: string
  description: string | null
  definition: JsonStructureDefinition
  createdAt: Date
  updatedAt: Date
}

// Stored in QueryState — maps a jsonb column on a specific table instance to a structure
export interface JsonbMapping {
  tableAlias: string
  columnName: string
  structureId: number
}

// A flattened non-array leaf derived from a JsonStructure, for SELECT/WHERE dropdowns
export interface JsonbPathOption {
  label: string          // e.g. "config > machine_type"
  path: string           // dot-separated: "config.machine_type"
  pgExpression: string   // ready-to-use PostgreSQL expression with alias and cast
  valueType: JsonFieldType
}
