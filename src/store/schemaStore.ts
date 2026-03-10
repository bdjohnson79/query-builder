import { create } from 'zustand'
import type { AppSchema, AppTable, AppColumn, AppForeignKey } from '@/types/schema'

interface SchemaStore {
  schemas: AppSchema[]
  tables: AppTable[]
  columns: Record<number, AppColumn[]>  // tableId → columns
  foreignKeys: AppForeignKey[]
  loading: boolean
  error: string | null

  setSchemas: (schemas: AppSchema[]) => void
  setTables: (tables: AppTable[]) => void
  setColumnsForTable: (tableId: number, columns: AppColumn[]) => void
  setForeignKeys: (fks: AppForeignKey[]) => void
  setLoading: (val: boolean) => void
  setError: (err: string | null) => void

  // Derived helpers
  getTableColumns: (tableId: number) => AppColumn[]
  getSchemaById: (id: number) => AppSchema | undefined
  getTableById: (id: number) => AppTable | undefined
}

export const useSchemaStore = create<SchemaStore>((set, get) => ({
  schemas: [],
  tables: [],
  columns: {},
  foreignKeys: [],
  loading: false,
  error: null,

  setSchemas: (schemas) => set({ schemas }),
  setTables: (tables) => set({ tables }),
  setColumnsForTable: (tableId, columns) =>
    set((s) => ({ columns: { ...s.columns, [tableId]: columns } })),
  setForeignKeys: (foreignKeys) => set({ foreignKeys }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  getTableColumns: (tableId) => get().columns[tableId] ?? [],
  getSchemaById: (id) => get().schemas.find((s) => s.id === id),
  getTableById: (id) => get().tables.find((t) => t.id === id),
}))
