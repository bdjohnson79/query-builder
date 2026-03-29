import { format } from 'sql-formatter'
import type {
  QueryState,
  FilterGroup,
  FilterRule,
  WindowFunctionDef,
  CTEDef,
  OrderByItem,
  TimescaleBucket,
  GapfillStrategy,
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
  // Pass 1: mask $__word(...) Grafana macros (with parentheses)
  let masked = sql.replace(/\$__\w+\([^)]*\)/g, (match) => {
    const idx = macros.push(match) - 1
    return `__GRAFANA_MACRO_${idx}__`
  })
  // Pass 2: mask any remaining bare $variable names (dashboard vars like $area, $machine, $__interval)
  masked = masked.replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
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
  'symmetric','system_user','table','tablesample','then','timestamp','to',
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

/** Build a table reference, omitting schema prefix when all tables share one schema.
 *  CTE virtual tables have schemaName === '' and always emit just the table name. */
function tableRef(schemaName: string, tableName: string, omitSchema: boolean): string {
  if (!schemaName) return qi(tableName)
  return omitSchema ? qi(tableName) : `${qi(schemaName)}.${qi(tableName)}`
}

// ---------------------------------------------------------------------------
// Core builder (pure TypeScript, no native deps)
// ---------------------------------------------------------------------------

function buildRawSql(state: QueryState, omitTrailer = false): string {
  const { tables, joins, selectedColumns, where, groupBy, having, orderBy, limit, offset, distinct, windowFunctions, ctes, timescaleBucket, gapfillStrategies, unionQuery } = state

  if (tables.length === 0) return '-- Drag a table onto the canvas to start'

  // Omit schema prefix when every non-CTE table in the query belongs to the same schema
  const schemas = new Set(tables.map(t => t.schemaName).filter(s => s !== ''))
  const omitSchema = schemas.size <= 1

  const parts: string[] = []

  // CTEs
  if (ctes.length > 0) {
    const recursive = ctes.some(c => c.recursive) ? 'RECURSIVE ' : ''
    const cteFragments = ctes.map(cte => buildCteFragment(cte))
    parts.push(`WITH ${recursive}${cteFragments.join(',\n')}`)
  }

  // SELECT
  const selectCols = buildSelectList(selectedColumns, windowFunctions, timescaleBucket, gapfillStrategies)
  parts.push(`SELECT${distinct ? ' DISTINCT' : ''} ${selectCols}`)

  // FROM
  const primaryTable = tables[0]
  const primaryRef = tableRef(primaryTable.schemaName, primaryTable.tableName, omitSchema)
  const primaryAs = primaryTable.alias !== primaryTable.tableName ? ` AS ${qi(primaryTable.alias)}` : ''
  parts.push(`FROM ${primaryRef}${primaryAs}`)

  // JSONB expand-as-record CROSS JOINs (must come after main FROM, before regular JOINs)
  const jsonbExpansions = state.jsonbExpansions ?? []
  for (const exp of jsonbExpansions) {
    if (exp.fields.length === 0) continue
    const fieldList = exp.fields.map((f) => `${qi(f.name)} ${f.pgType}`).join(', ')
    parts.push(
      `CROSS JOIN jsonb_to_record(${qi(exp.tableAlias)}.${qi(exp.columnName)}) ${qi(exp.expandAlias)}(${fieldList})`
    )
  }

  // JSONB array unnesting LATERAL JOINs
  const jsonbArrayUnnestings = state.jsonbArrayUnnestings ?? []
  for (const u of jsonbArrayUnnestings) {
    const base = `${qi(u.tableAlias)}.${qi(u.columnName)}`
    const segments = u.arrayPath.split('.')
    const pathExpr = segments.length === 1
      ? `${base}->'${segments[0]}'`
      : `${base}#>'{${segments.join(',')}}'`

    if (u.mode === 'elements') {
      parts.push(`CROSS JOIN LATERAL jsonb_array_elements(${pathExpr}) AS ${qi(u.unnestAlias)}`)
    } else {
      if (u.recordsetFields.length === 0) continue
      const fieldList = u.recordsetFields.map((f) => `${qi(f.name)} ${f.pgType}`).join(', ')
      parts.push(
        `CROSS JOIN LATERAL jsonb_to_recordset(${pathExpr}) AS ${qi(u.unnestAlias)}(${fieldList})`
      )
    }
  }

  // JOINs — topological resolution
  // A JoinDef records which two columns are connected, but the canvas lets users draw the
  // arrow in either direction. We must determine which side is the "new" table being
  // introduced at each step and emit: JOIN <newTable> ON <inScopeCol> = <newTableCol>.
  {
    const inScope = new Set<string>([primaryTable.alias])
    // REFERENCE joins are visual-only dependency arrows — exclude from SQL emission entirely
    const pending = joins.filter((j) => j.type !== 'REFERENCE')

    let safetyLimit = joins.length * joins.length + 1
    while (pending.length > 0 && safetyLimit-- > 0) {
      // Find a join where at least one side is already in scope.
      // LATERAL joins always qualify — they reference the outer scope, not a specific column.
      const idx = pending.findIndex(
        (j) => j.type === 'LATERAL' || inScope.has(j.leftTableAlias) || inScope.has(j.rightTableAlias)
      )
      if (idx === -1) {
        // Disconnected subgraph — emit remaining joins as-is (will produce a cross join)
        for (const j of pending) {
          const newTable = tables.find((t) => t.alias === j.rightTableAlias)
          if (!newTable) continue
          const joinKeyword = joinTypeToSql(j.type)
          const newRef = tableRef(newTable.schemaName, newTable.tableName, omitSchema)
          const newAs = newTable.alias !== newTable.tableName ? ` AS ${qi(newTable.alias)}` : ''
          const fallbackOn = j.onExpression?.trim()
            ? j.onExpression.trim()
            : `${qi(j.leftTableAlias)}.${qi(j.leftColumn)} = ${qi(j.rightTableAlias)}.${qi(j.rightColumn)}`
          parts.push(`${joinKeyword} ${newRef}${newAs} ON ${fallbackOn}`)
          inScope.add(j.rightTableAlias)
        }
        break
      }

      const j = pending.splice(idx, 1)[0]

      // LATERAL joins emit a subquery instead of a table reference
      if (j.type === 'LATERAL' && j.lateralSubquery) {
        const lateralAlias = j.lateralAlias ?? 'lateral_sub'
        const subSql = buildRawSql(j.lateralSubquery, true)
        const onClause = j.onExpression?.trim() || 'TRUE'
        parts.push(`LEFT JOIN LATERAL (\n${subSql}\n) AS ${qi(lateralAlias)} ON ${onClause}`)
        inScope.add(lateralAlias)
        continue
      }

      // Determine which side is "new" (not yet in scope)
      const rightIsNew = !inScope.has(j.rightTableAlias)
      const newAlias = rightIsNew ? j.rightTableAlias : j.leftTableAlias
      inScope.add(newAlias)

      const newTable = tables.find((t) => t.alias === newAlias)
      if (!newTable) continue

      const joinKeyword = joinTypeToSql(j.type)
      const newRef = tableRef(newTable.schemaName, newTable.tableName, omitSchema)
      const newAs = newTable.alias !== newTable.tableName ? ` AS ${qi(newTable.alias)}` : ''

      // ON clause: in-scope side = new-table side
      const onLeft = rightIsNew
        ? `${qi(j.leftTableAlias)}.${qi(j.leftColumn)}`
        : `${qi(j.rightTableAlias)}.${qi(j.rightColumn)}`
      const onRight = rightIsNew
        ? `${qi(j.rightTableAlias)}.${qi(j.rightColumn)}`
        : `${qi(j.leftTableAlias)}.${qi(j.leftColumn)}`

      const onClause = j.onExpression?.trim() ? j.onExpression.trim() : `${onLeft} = ${onRight}`
      parts.push(`${joinKeyword} ${newRef}${newAs} ON ${onClause}`)
    }
  }

  // WHERE
  if (where.rules.length > 0) {
    const expr = buildFilterGroup(where)
    if (expr) parts.push(`WHERE ${expr}`)
  }

  // GROUP BY (prepend time_bucket expression when TimescaleDB bucketing is active)
  if (timescaleBucket || groupBy.length > 0) {
    const items: string[] = []
    if (timescaleBucket) {
      items.push(buildBucketExpr(timescaleBucket))
    }
    items.push(...groupBy.map(c =>
      c.tableAlias === '__grafana__' ? c.columnName : `${qi(c.tableAlias)}.${qi(c.columnName)}`
    ))
    parts.push(`GROUP BY ${items.join(', ')}`)
  }

  // HAVING
  if (having.rules.length > 0) {
    const expr = buildFilterGroup(having)
    if (expr) parts.push(`HAVING ${expr}`)
  }

  const body = parts.join('\n')

  // Collect trailing ORDER BY / LIMIT / OFFSET separately so UNION ALL can push them to the end
  const trailer: string[] = []
  if (orderBy.length > 0) {
    const items = orderBy.map(ob => buildOrderByItem(ob)).join(', ')
    trailer.push(`ORDER BY ${items}`)
  }
  if (limit !== null)  trailer.push(`LIMIT ${limit}`)
  if (offset !== null) trailer.push(`OFFSET ${offset}`)

  // UNION branch — append before the trailer so ORDER BY covers both branches
  if (unionQuery) {
    const branchSql = unionQuery.rawSql?.trim()
      ? unionQuery.rawSql.trim()
      : buildRawSql(unionQuery.queryState, true)
    const trailerStr = trailer.length > 0 ? '\n' + trailer.join('\n') : ''
    return body + `\n${unionQuery.operator}\n` + branchSql + trailerStr
  }

  if (omitTrailer) return body
  return trailer.length > 0 ? body + '\n' + trailer.join('\n') : body
}

// ---------------------------------------------------------------------------
// SELECT list
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TimescaleDB bucket expression (shared between SELECT and GROUP BY)
// ---------------------------------------------------------------------------

function buildBucketExpr(bucket: TimescaleBucket): string {
  const fn = bucket.gapfill ? 'time_bucket_gapfill' : 'time_bucket'
  const colRef = `${qi(bucket.columnRef.tableAlias)}.${qi(bucket.columnRef.columnName)}`
  // Grafana variables (e.g. $__interval) must not be quoted
  const intervalArg = bucket.interval.startsWith('$')
    ? bucket.interval
    : `'${bucket.interval}'`
  return `${fn}(${intervalArg}, ${colRef})`
}

function buildSelectList(
  selectedColumns: QueryState['selectedColumns'],
  windowFunctions: WindowFunctionDef[],
  timescaleBucket?: TimescaleBucket,
  gapfillStrategies?: GapfillStrategy[]
): string {
  const cols: string[] = []

  // Prepend time_bucket / time_bucket_gapfill column when configured
  if (timescaleBucket) {
    const bucketExpr = buildBucketExpr(timescaleBucket)
    const alias = timescaleBucket.alias || 'time'
    cols.push(`${bucketExpr} AS ${qi(alias)}`)
  }

  const gapfillActive = !!timescaleBucket?.gapfill

  for (const col of selectedColumns) {
    // Base reference: expression or table.column
    const ref = col.expression
      ? col.expression
      : `${qi(col.tableAlias)}.${qi(col.columnName)}`

    // Wrap with aggregate function if set
    let expr: string
    if (col.aggregate === 'COUNT DISTINCT') {
      expr = `COUNT(DISTINCT ${ref})`
    } else if (col.aggregate) {
      expr = `${col.aggregate}(${ref})`
    } else {
      expr = ref
    }

    // Wrap with gapfill strategy (locf/interpolate) when gapfill is active
    if (gapfillActive && gapfillStrategies) {
      const strategy = gapfillStrategies.find((g) => g.selectedColumnId === col.id)?.strategy
      if (strategy) {
        expr = `${strategy}(${expr})`
      }
    }

    cols.push(col.alias ? `${expr} AS ${qi(col.alias)}` : expr)
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
    case 'LATERAL': return 'LEFT JOIN LATERAL'
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

/** Build a JSONB path extraction expression.
 * Single segment → alias."col"->>'key'
 * Multi segment  → alias."col"#>>'{parent,child}'
 * Optional pgCast → wraps in (...)::cast
 */
function buildJsonbPathExpr(tableAlias: string, colName: string, dotPath: string, pgCast?: string): string {
  const segments = dotPath.split('.')
  const base = `${qi(tableAlias)}.${qi(colName)}`
  let expr: string
  if (segments.length === 1) {
    expr = `${base}->>'${segments[0]}'`
  } else {
    expr = `${base}#>>'{${segments.join(',')}}'`
  }
  return pgCast ? `(${expr})::${pgCast}` : expr
}

const JSONB_MARKER = '::jsonb::'

function buildRuleFragment(rule: FilterRule): string | null {
  const field = rule.field  // "alias.column" — unquoted from react-querybuilder
  const val = rule.value

  // Detect JSONB path: "alias::jsonb::columnName::dot.path"
  let quotedField: string
  if (field.includes(JSONB_MARKER)) {
    const markerIdx = field.indexOf(JSONB_MARKER)
    const tableAlias = field.slice(0, markerIdx)
    const rest = field.slice(markerIdx + JSONB_MARKER.length)
    const colonIdx = rest.indexOf('::')
    const colName = rest.slice(0, colonIdx)
    const dotPath = rest.slice(colonIdx + 2)
    quotedField = buildJsonbPathExpr(tableAlias, colName, dotPath)
  } else {
    // Quote the field reference properly
    const fieldParts = field.split('.')
    quotedField = fieldParts.length === 2
      ? `${qi(fieldParts[0])}.${qi(fieldParts[1])}`
      : field
  }

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
    case 'timeLookback': {
      const interval = String(val ?? '30d').trim() || '30d'
      return `${quotedField} BETWEEN $__timeFrom()::timestamp - INTERVAL '${interval}' AND $__timeFrom()::timestamp`
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
  // Grafana dashboard variable — emit unquoted so Grafana can substitute at render time
  if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) return s
  // Dotted column reference (alias.column) — emit unquoted for correlated subquery conditions
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) return s
  // Numeric strings
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
  const innerSql = cte.rawSql?.trim() ?? buildRawSql(cte.queryState)
  return `${qi(cte.name)} AS (\n${innerSql}\n)`
}
