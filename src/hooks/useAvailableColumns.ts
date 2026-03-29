import { useQueryStore } from '@/store/queryStore'
import { getActiveQueryState, getLateralOuterScopeTables } from '@/store/queryStore'

export interface AvailableColumn {
  tableAlias: string
  columnName: string
  pgType: string
  /** True when this column comes from a JSONB expand-as-record expansion */
  isExpansion?: boolean
  /** True when this column comes from the outer query scope (LATERAL correlated reference) */
  isOuterScope?: boolean
}

/**
 * Returns all columns available for ORDER BY, GROUP BY, window functions, etc.
 * Includes both regular table columns and JSONB expand-as-record fields.
 *
 * When editing a LATERAL subquery, also includes outer-scope tables marked
 * `isOuterScope: true` so correlated WHERE conditions can reference them.
 */
export function useAvailableColumns(): AvailableColumn[] {
  const active          = useQueryStore((s) => getActiveQueryState(s))
  const outerTables     = useQueryStore((s) => getLateralOuterScopeTables(s))

  const tableCols: AvailableColumn[] = active.tables.flatMap((t) =>
    t.columns.map((c) => ({
      tableAlias: t.alias,
      columnName: c.name,
      pgType: c.pgType,
    }))
  )

  const expansionCols: AvailableColumn[] = (active.jsonbExpansions ?? []).flatMap((exp) =>
    exp.fields.map((f) => ({
      tableAlias: exp.expandAlias,
      columnName: f.name,
      pgType: f.pgType,
      isExpansion: true,
    }))
  )

  const outerCols: AvailableColumn[] = outerTables.flatMap((t) =>
    t.columns.map((c) => ({
      tableAlias: t.alias,
      columnName: c.name,
      pgType: c.pgType,
      isOuterScope: true,
    }))
  )

  return [...tableCols, ...expansionCols, ...outerCols]
}
