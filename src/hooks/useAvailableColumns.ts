import { useQueryStore } from '@/store/queryStore'

export interface AvailableColumn {
  tableAlias: string
  columnName: string
  pgType: string
  /** True when this column comes from a JSONB expand-as-record expansion */
  isExpansion?: boolean
}

/**
 * Returns all columns available for ORDER BY, GROUP BY, window functions, etc.
 * Includes both regular table columns and JSONB expand-as-record fields.
 */
export function useAvailableColumns(): AvailableColumn[] {
  const tables         = useQueryStore((s) => s.queryState.tables)
  const jsonbExpansions = useQueryStore((s) => s.queryState.jsonbExpansions)

  const tableCols: AvailableColumn[] = tables.flatMap((t) =>
    t.columns.map((c) => ({
      tableAlias: t.alias,
      columnName: c.name,
      pgType: c.pgType,
    }))
  )

  const expansionCols: AvailableColumn[] = jsonbExpansions.flatMap((exp) =>
    exp.fields.map((f) => ({
      tableAlias: exp.expandAlias,
      columnName: f.name,
      pgType: f.pgType,
      isExpansion: true,
    }))
  )

  return [...tableCols, ...expansionCols]
}
