// Types mirroring the app database schema

export interface AppSchema {
  id: number
  name: string
}

export interface AppTable {
  id: number
  schemaId: number
  name: string
  displayName: string | null
  description: string | null
}

export interface AppColumn {
  id: number
  tableId: number
  name: string
  pgType: string
  isNullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
  ordinalPosition: number
  description: string | null
}

export interface AppForeignKey {
  id: number
  fromColumnId: number
  toColumnId: number
  constraintName: string | null
}

export interface QueryFolder {
  id: number
  name: string
}

export interface SavedQuery {
  id: number
  name: string
  description: string | null
  queryState: unknown   // JSONB
  generatedSql: string | null
  schemaId: number | null
  folderId: number | null
  tags: string[] | null
  createdAt: Date
  updatedAt: Date
}
