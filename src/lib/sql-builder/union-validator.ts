import type { QueryState, UnionBranch } from '@/types/query'

export interface UnionWarning {
  type: 'count_mismatch' | 'type_mismatch' | 'no_columns'
  message: string
  colIndex?: number
}

export interface UnionValidationResult {
  valid: boolean
  warnings: UnionWarning[]
}

// Broad PostgreSQL type categories for compatibility checking
function typeCategory(pgType: string): string {
  const t = pgType.toLowerCase()
  if (t.includes('int') || t === 'numeric' || t === 'decimal' || t === 'float' || t === 'double precision' || t === 'real' || t === 'money') return 'numeric'
  if (t.includes('char') || t === 'text' || t === 'name' || t === 'citext') return 'text'
  if (t.includes('timestamp') || t === 'date' || t === 'time' || t.includes('interval')) return 'datetime'
  if (t === 'bool' || t === 'boolean') return 'boolean'
  if (t === 'jsonb' || t === 'json') return 'json'
  if (t === 'uuid') return 'uuid'
  return 'other'
}

export function validateUnion(main: QueryState, unionBranch: UnionBranch): UnionValidationResult {
  // Raw SQL branches cannot be introspected — skip all validation
  if (unionBranch.rawSql != null) return { valid: true, warnings: [] }

  const branch = unionBranch.queryState
  const warnings: UnionWarning[] = []

  const mainCols = main.selectedColumns
  const branchCols = branch.selectedColumns

  if (mainCols.length === 0 || branchCols.length === 0) {
    warnings.push({ type: 'no_columns', message: 'Both query parts must have at least one column selected.' })
    return { valid: false, warnings }
  }

  if (mainCols.length !== branchCols.length) {
    warnings.push({
      type: 'count_mismatch',
      message: `Column count mismatch: Part 1 has ${mainCols.length} column${mainCols.length !== 1 ? 's' : ''}, Part 2 has ${branchCols.length}.`,
    })
    // Still check type compatibility for columns that exist on both sides
  }

  const checkCount = Math.min(mainCols.length, branchCols.length)

  // Build lookup: tableAlias → columns map for each part
  const buildColMap = (qs: QueryState) => {
    const map = new Map<string, string>() // alias+name → pgType
    for (const t of qs.tables) {
      for (const c of t.columns) {
        map.set(`${t.alias}.${c.name}`, c.pgType)
      }
    }
    return map
  }

  const mainMap = buildColMap(main)
  const branchMap = buildColMap(branch)

  for (let i = 0; i < checkCount; i++) {
    const mc = mainCols[i]
    const bc = branchCols[i]

    // Skip custom expressions — we can't infer type
    if (mc.expression || bc.expression) continue

    const mainType = mainMap.get(`${mc.tableAlias}.${mc.columnName}`)
    const branchType = branchMap.get(`${bc.tableAlias}.${bc.columnName}`)

    if (!mainType || !branchType) continue

    if (typeCategory(mainType) !== typeCategory(branchType)) {
      warnings.push({
        type: 'type_mismatch',
        message: `Column ${i + 1}: type mismatch — Part 1 is ${mainType}, Part 2 is ${branchType}.`,
        colIndex: i,
      })
    }
  }

  return { valid: warnings.length === 0, warnings }
}
