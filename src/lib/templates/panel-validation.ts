import type { GrafanaPanelType, QueryState, SelectedColumn } from '@/types/query'

const TIMESTAMP_TYPES = [
  'timestamp',
  'timestamptz',
  'timestamp with time zone',
  'timestamp without time zone',
]
const NUMERIC_TYPES = [
  'float8', 'float4', 'numeric', 'int4', 'int8', 'int2',
  'double precision', 'real', 'bigint', 'integer', 'smallint',
]

function isTimestamp(pgType: string): boolean {
  return TIMESTAMP_TYPES.some((t) => pgType === t || pgType.startsWith(t))
}

function isNumeric(pgType: string): boolean {
  return NUMERIC_TYPES.includes(pgType)
}

function getColumnType(col: SelectedColumn, state: QueryState): string | undefined {
  if (col.tableAlias === '__expr__' || col.tableAlias === '__grafana__') return undefined
  const table = state.tables.find((t) => t.alias === col.tableAlias)
  return table?.columns.find((c) => c.name === col.columnName)?.pgType
}

export function validatePanelType(type: GrafanaPanelType, state: QueryState): string[] {
  const warnings: string[] = []
  const cols = state.selectedColumns

  switch (type) {
    case 'time-series': {
      const hasTimeCol = cols.some((c) => {
        const t = getColumnType(c, state)
        return t ? isTimestamp(t) : false
      })
      if (!hasTimeCol) {
        warnings.push('No timestamp column in SELECT — time-series panels require a time column.')
      }

      const hasTimeOrder = state.orderBy.some((o) => {
        const table = state.tables.find((t) => t.alias === o.tableAlias)
        const col = table?.columns.find((c) => c.name === o.columnName)
        return col?.pgType ? isTimestamp(col.pgType) : false
      })
      if (!hasTimeOrder) {
        warnings.push('No ORDER BY on a time column — Grafana time-series requires time-ordered results.')
      }

      const hasNumericCol = cols.some((c) => {
        const t = getColumnType(c, state)
        return t ? isNumeric(t) : false
      })
      if (!hasNumericCol) {
        warnings.push('No numeric value column in SELECT — time-series panels need at least one metric value.')
      }
      break
    }

    case 'stat': {
      const nonAggCols = cols.filter(
        (c) => !c.aggregate && c.tableAlias !== '__expr__' && c.tableAlias !== '__grafana__'
      )
      if (nonAggCols.length > 1) {
        warnings.push(
          'Multiple non-aggregated columns — stat panels display a single value. Use an aggregate (SUM, AVG, etc.) or remove extra columns.'
        )
      }
      break
    }

    case 'bar-chart': {
      const hasNumeric = cols.some((c) => {
        const t = getColumnType(c, state)
        return t ? isNumeric(t) : false
      })
      const hasCategorical = cols.some((c) => {
        const t = getColumnType(c, state)
        if (!t) return false
        return !isNumeric(t) && !isTimestamp(t)
      })
      if (!hasNumeric || !hasCategorical) {
        warnings.push('Bar chart needs a categorical column (text/enum) and a numeric column.')
      }
      break
    }

    case 'table':
      break

    case 'heatmap': {
      if (cols.length < 3) {
        warnings.push(
          'Heatmap panels typically need at least 3 columns: time, series/label, and value.'
        )
      } else {
        const hasTime = cols.some((c) => {
          const t = getColumnType(c, state)
          return t ? isTimestamp(t) : false
        })
        const hasNumeric = cols.some((c) => {
          const t = getColumnType(c, state)
          return t ? isNumeric(t) : false
        })
        if (!hasTime) warnings.push('Heatmap needs a timestamp column for the time axis.')
        if (!hasNumeric) warnings.push('Heatmap needs a numeric column for the value/intensity.')
      }
      break
    }
  }

  return warnings
}

/** Returns the first timestamp column from query tables — used for the ORDER BY "fix" shortcut. */
export function findFirstTimestampColumn(
  state: QueryState
): { tableAlias: string; columnName: string } | null {
  for (const table of state.tables) {
    const col = table.columns.find((c) => isTimestamp(c.pgType))
    if (col) return { tableAlias: table.alias, columnName: col.name }
  }
  return null
}
