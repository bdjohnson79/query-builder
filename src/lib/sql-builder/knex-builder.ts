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
    return formatWithMacros(raw)
  } catch (e) {
    return `-- SQL generation error: ${e instanceof Error ? e.message : String(e)}`
  }
}

/**
 * Format SQL while preserving Grafana $__ macros.
 * sql-formatter does not understand the $__ prefix and throws on it,
 * so we swap each macro out for a plain placeholder, format, then restore.
 */
function formatWithMacros(sql: string): string {
  const macros: string[] = []
  // Match $__word(...) or $__word() — greedy-enough for all known Grafana macros
  const masked = sql.replace(/\$__\w+\([^)]*\)/g, (match) => {
    const idx = macros.push(match) - 1
    return `__GRAFANA_MACRO_${idx}__`
  })
  const formatted = format(masked, { language: 'postgresql', tabWidth: 2, keywordCase: 'upper' })
  return formatted.replace(/__GRAFANA_MACRO_(\d+)__/g, (_, i) => macros[Number(i)])
}

// ---------------------------------------------------------------------------
// Identifier quoting
// ---------------------------------------------------------------------------

// PostgreSQL reserved keywords that would cause a parse error if unquoted
const PG_RESERVED = new Set([
  'all','analyse','analyze','and','any','array','as','asc','asymmetric','authorization',
  'between','bigint','binary','bit','boolean','both','case','cast','char','character',
  'check','coalesce','collate','collation','column','constraint','create','cross',
  'current_catalog','current_date','current_role','current_schema','current_time',
  'current_timestamp','current_user','dec','decimal','default','deferrable','desc',
  'distinct','do','else','end','except','exists','false','fetch','float','for',
  'foreign','freeze','from','full','grant','group','having','ilike','in','initially',
  'inner','inout','int','integer','intersect','interval','into','is','isnull','join',
  'lateral','leading','left','like','limit','localtime','localtimestamp','national',
  'natural','nchar','none','not','notnull','null','nullif','numeric','offset','on',
  'only','or','order','out','outer','overlaps','placing','primary','real','references',
  'returning','right','row','select','session_user','similar','smallint','some',
  'symmetric','system_user','table','tablesample','then','time','timestamp','to',
  'trailing','true','union','unique','user','using','values','varchar','variadic',
  'verbose','when','where','window','with',
])

/** Quote a PostgreSQL identifier only when required. */
function qi(name: string): string {
  // Needs quoting if not a plain lowercase identifier, or is a reserved word
  if (!/^[a-z_][a-z0-9_]*$/.test(name) || PG_RESERVED.has(name)) {
    return `"${name}"`
  }
  return name
}

/** Build a table reference, omitting schema prefix when all tables share one schema. */
function tableRef(schemaName: string, tableName: string, omitSchema: boolean): string {
  return omitSchema ? qi(tableName) : `${qi(schemaName)}.${qi(tableName)}`
}

// ---------------------------------------------------------------------------
// Core builder (pure TypeScript, no native deps)
// ---------------------------------------------------------------------------

function buildRawSql(state: QueryState): string {
  const { tables, joins, selectedColumns, where, groupBy, having, orderBy, limit, offset, distinct, windowFunctions, ctes } = state

  if (tables.length === 0) return '-- Drag a table onto the canvas to start'

  // Omit schema prefix when every table in the query belongs to the same schema
  const schemas = new Set(tables.map(t => t.schemaName))
  const omitSchema = schemas.size === 1

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
  const primaryRef = tableRef(primaryTable.schemaName, primaryTable.tableName, omitSchema)
  const primaryAs = primaryTable.alias !== primaryTable.tableName ? ` AS ${qi(primaryTable.alias)}` : ''
  parts.push(`FROM ${primaryRef}${primaryAs}`)

  // JOINs
  for (const join of joins) {
    const rightTable = tables.find(t => t.alias === join.rightTableAlias)
    if (!rightTable) continue
    const joinKeyword = joinTypeToSql(join.type)
    const rightRef = tableRef(rightTable.schemaName, rightTable.tableName, omitSchema)
    const rightAs = rightTable.alias !== rightTable.tableName ? ` AS ${qi(rightTable.alias)}` : ''
    // Column references use alias if set, otherwise table name
    const leftCol = `${qi(join.leftTableAlias)}.${qi(join.leftColumn)}`
    const rightCol = `${qi(join.rightTableAlias)}.${qi(join.rightColumn)}`
    parts.push(`${joinKeyword} ${rightRef}${rightAs} ON ${leftCol} = ${rightCol}`)
  }

  // WHERE
  if (where.rules.length > 0) {
    const expr = buildFilterGroup(where)
    if (expr) parts.push(`WHERE ${expr}`)
  }

  // GROUP BY
  if (groupBy.length > 0) {
    const cols = groupBy.map(c =>
      c.tableAlias === '__grafana__' ? c.columnName : `${qi(c.tableAlias)}.${qi(c.columnName)}`
    ).join(', ')
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
      cols.push(col.alias ? `${col.expression} AS ${qi(col.alias)}` : col.expression)
    } else {
      const ref = `${qi(col.tableAlias)}.${qi(col.columnName)}`
      cols.push(col.alias ? `${ref} AS ${qi(col.alias)}` : ref)
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
    ? `${qi(fieldParts[0])}.${qi(fieldParts[1])}`
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
    // Grafana macros — the column is the macro argument, no separate value needed
    case '$__timeFilter':
      return `$__timeFilter(${quotedField})`
    case '$__unixEpochFilter':
      return `$__unixEpochFilter(${quotedField})`
    case '$__unixEpochNanoFilter':
      return `$__unixEpochNanoFilter(${quotedField})`
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
    ? `PARTITION BY ${wf.partitionBy.map(c => `${qi(c.tableAlias)}.${qi(c.columnName)}`).join(', ')}`
    : ''
  const orderBy = wf.orderBy.length > 0
    ? `ORDER BY ${wf.orderBy.map(ob => buildOrderByItem(ob)).join(', ')}`
    : ''
  const frame = wf.frameClause ?? ''
  const windowSpec = [partitionBy, orderBy, frame].filter(Boolean).join(' ')
  return `${wf.fn}(${fnArg}) OVER (${windowSpec}) AS ${qi(wf.alias)}`
}

function buildOrderByItem(ob: OrderByItem): string {
  let s = `${qi(ob.tableAlias)}.${qi(ob.columnName)} ${ob.direction}`
  if (ob.nulls) s += ` ${ob.nulls}`
  return s
}

// ---------------------------------------------------------------------------
// CTE fragment
// ---------------------------------------------------------------------------

function buildCteFragment(cte: CTEDef): string {
  const innerSql = buildRawSql(cte.queryState)
  return `${qi(cte.name)} AS (\n${innerSql}\n)`
}
