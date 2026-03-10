import { format } from 'sql-formatter'
import type {
  QueryState,
  FilterGroup,
  FilterRule,
  WindowFunctionDef,
  CTEDef,
  OrderByItem,
} from '@/types/query'

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildSql(state: QueryState): string {
  try {
    const raw = buildRawSql(state)
    return format(raw, { language: 'postgresql', tabWidth: 2, keywordCase: 'upper' })
  } catch (e) {
    return `-- SQL generation error: ${e instanceof Error ? e.message : String(e)}`
  }
}

// ---------------------------------------------------------------------------
// Core builder (pure TypeScript, no native deps)
// ---------------------------------------------------------------------------

function buildRawSql(state: QueryState): string {
  const { tables, joins, selectedColumns, where, groupBy, having, orderBy, limit, offset, distinct, windowFunctions, ctes } = state

  if (tables.length === 0) return '-- Drag a table onto the canvas to start'

  const parts: string[] = []

  // CTEs
  if (ctes.length > 0) {
    const recursive = ctes.some(c => c.recursive) ? 'RECURSIVE ' : ''
    const cteFragments = ctes.map(cte => buildCteFragment(cte))
    parts.push(`WITH ${recursive}${cteFragments.join(',\n')}`)
  }

  // SELECT
  const selectCols = buildSelectList(selectedColumns, windowFunctions)
  parts.push(`SELECT${distinct ? ' DISTINCT' : ''} ${selectCols}`)

  // FROM
  const primaryTable = tables[0]
  parts.push(`FROM "${primaryTable.schemaName}"."${primaryTable.tableName}" AS "${primaryTable.alias}"`)

  // JOINs
  for (const join of joins) {
    const rightTable = tables.find(t => t.alias === join.rightTableAlias)
    if (!rightTable) continue
    const joinKeyword = joinTypeToSql(join.type)
    parts.push(
      `${joinKeyword} "${rightTable.schemaName}"."${rightTable.tableName}" AS "${join.rightTableAlias}" ON "${join.leftTableAlias}"."${join.leftColumn}" = "${join.rightTableAlias}"."${join.rightColumn}"`
    )
  }

  // WHERE
  if (where.rules.length > 0) {
    const expr = buildFilterGroup(where)
    if (expr) parts.push(`WHERE ${expr}`)
  }

  // GROUP BY
  if (groupBy.length > 0) {
    const cols = groupBy.map(c => `"${c.tableAlias}"."${c.columnName}"`).join(', ')
    parts.push(`GROUP BY ${cols}`)
  }

  // HAVING
  if (having.rules.length > 0) {
    const expr = buildFilterGroup(having)
    if (expr) parts.push(`HAVING ${expr}`)
  }

  // ORDER BY
  if (orderBy.length > 0) {
    const items = orderBy.map(ob => buildOrderByItem(ob)).join(', ')
    parts.push(`ORDER BY ${items}`)
  }

  // LIMIT / OFFSET
  if (limit !== null) parts.push(`LIMIT ${limit}`)
  if (offset !== null) parts.push(`OFFSET ${offset}`)

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// SELECT list
// ---------------------------------------------------------------------------

function buildSelectList(
  selectedColumns: QueryState['selectedColumns'],
  windowFunctions: WindowFunctionDef[]
): string {
  const cols: string[] = []

  for (const col of selectedColumns) {
    if (col.expression) {
      cols.push(col.alias ? `${col.expression} AS "${col.alias}"` : col.expression)
    } else {
      const ref = `"${col.tableAlias}"."${col.columnName}"`
      cols.push(col.alias ? `${ref} AS "${col.alias}"` : ref)
    }
  }

  for (const wf of windowFunctions) {
    cols.push(buildWindowFnFragment(wf))
  }

  return cols.length > 0 ? cols.join(', ') : '*'
}

// ---------------------------------------------------------------------------
// JOIN type
// ---------------------------------------------------------------------------

function joinTypeToSql(type: QueryState['joins'][0]['type']): string {
  switch (type) {
    case 'INNER': return 'INNER JOIN'
    case 'LEFT': return 'LEFT JOIN'
    case 'RIGHT': return 'RIGHT JOIN'
    case 'FULL OUTER': return 'FULL OUTER JOIN'
    case 'CROSS': return 'CROSS JOIN'
    default: return 'INNER JOIN'
  }
}

// ---------------------------------------------------------------------------
// Filter group → WHERE/HAVING expression
// ---------------------------------------------------------------------------

function buildFilterGroup(group: FilterGroup): string {
  if (group.rules.length === 0) return ''

  const parts = group.rules
    .map(rule => {
      if ('rules' in rule) {
        const inner = buildFilterGroup(rule as FilterGroup)
        return inner ? `(${inner})` : null
      }
      return buildRuleFragment(rule as FilterRule)
    })
    .filter(Boolean) as string[]

  return parts.join(` ${group.combinator} `)
}

function buildRuleFragment(rule: FilterRule): string | null {
  const field = rule.field  // "alias.column" — unquoted from react-querybuilder
  const val = rule.value

  // Quote the field reference properly
  const fieldParts = field.split('.')
  const quotedField = fieldParts.length === 2
    ? `"${fieldParts[0]}"."${fieldParts[1]}"`
    : field

  switch (rule.operator) {
    case '=':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      return `${quotedField} ${rule.operator} ${quoteValue(val)}`
    case 'contains':
      return `${quotedField} ILIKE ${quoteValue(`%${val}%`)}`
    case 'beginsWith':
      return `${quotedField} ILIKE ${quoteValue(`${val}%`)}`
    case 'endsWith':
      return `${quotedField} ILIKE ${quoteValue(`%${val}`)}`
    case 'doesNotContain':
      return `${quotedField} NOT ILIKE ${quoteValue(`%${val}%`)}`
    case 'in':
      return `${quotedField} IN (${String(val).split(',').map(v => quoteValue(v.trim())).join(', ')})`
    case 'notIn':
      return `${quotedField} NOT IN (${String(val).split(',').map(v => quoteValue(v.trim())).join(', ')})`
    case 'null':
      return `${quotedField} IS NULL`
    case 'notNull':
      return `${quotedField} IS NOT NULL`
    case 'between': {
      const [a, b] = String(val).split(',')
      return `${quotedField} BETWEEN ${quoteValue(a?.trim())} AND ${quoteValue(b?.trim())}`
    }
    default:
      return null
  }
}

function quoteValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return 'NULL'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  const s = String(val)
  // Attempt to detect numeric strings
  if (/^-?\d+(\.\d+)?$/.test(s)) return s
  return `'${s.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------------------
// Window function fragment
// ---------------------------------------------------------------------------

function buildWindowFnFragment(wf: WindowFunctionDef): string {
  const fnArg = wf.expression ?? ''
  const partitionBy = wf.partitionBy.length > 0
    ? `PARTITION BY ${wf.partitionBy.map(c => `"${c.tableAlias}"."${c.columnName}"`).join(', ')}`
    : ''
  const orderBy = wf.orderBy.length > 0
    ? `ORDER BY ${wf.orderBy.map(ob => buildOrderByItem(ob)).join(', ')}`
    : ''
  const frame = wf.frameClause ?? ''
  const windowSpec = [partitionBy, orderBy, frame].filter(Boolean).join(' ')
  return `${wf.fn}(${fnArg}) OVER (${windowSpec}) AS "${wf.alias}"`
}

function buildOrderByItem(ob: OrderByItem): string {
  let s = `"${ob.tableAlias}"."${ob.columnName}" ${ob.direction}`
  if (ob.nulls) s += ` ${ob.nulls}`
  return s
}

// ---------------------------------------------------------------------------
// CTE fragment
// ---------------------------------------------------------------------------

function buildCteFragment(cte: CTEDef): string {
  const innerSql = buildRawSql(cte.queryState)
  return `"${cte.name}" AS (\n${innerSql}\n)`
}
