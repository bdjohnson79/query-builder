import { useQueryStore } from '@/store/queryStore'

export interface WorkflowProgress {
  hasTables: boolean
  hasColumns: boolean
  hasFilters: boolean
  hasGrouping: boolean
  hasSort: boolean
  hasSql: boolean
  /** Whether GROUP BY is currently required (has aggregate + non-aggregate columns).
   *  TODO Phase 2: wire this to SelectedColumn.aggregate once that field exists. */
  isGroupByRequired: boolean
}

export function useWorkflowProgress(): WorkflowProgress {
  const tables          = useQueryStore((s) => s.queryState.tables)
  const selectedColumns = useQueryStore((s) => s.queryState.selectedColumns)
  const whereRules      = useQueryStore((s) => s.queryState.where.rules)
  const groupBy         = useQueryStore((s) => s.queryState.groupBy)
  const orderBy         = useQueryStore((s) => s.queryState.orderBy)
  const generatedSql    = useQueryStore((s) => s.generatedSql)

  const hasAggregates    = selectedColumns.some((c) => c.aggregate)
  const hasNonAggregates = selectedColumns.some((c) => !c.aggregate)

  return {
    hasTables:         tables.length > 0,
    hasColumns:        selectedColumns.length > 0,
    hasFilters:        whereRules.length > 0,
    hasGrouping:       groupBy.length > 0,
    hasSort:           orderBy.length > 0,
    hasSql:            generatedSql.trimStart().toUpperCase().startsWith('SELECT'),
    isGroupByRequired: hasAggregates && hasNonAggregates,
  }
}
