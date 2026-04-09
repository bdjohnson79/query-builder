// Best-effort SQL → QueryState importer for Grafana panel queries.
// Uses node-sql-parser (PostgreSQL dialect) to parse SQL into an AST, then
// maps the AST to the application's QueryState type.
//
// Reconstruction quality:
//   Good:  simple JOINs, column refs, aggregates, WHERE/GROUP BY/ORDER BY/LIMIT
//          non-recursive CTEs (fully visual), CTE virtual tables in main query
//   Fair:  complex WHERE (preserved as raw rule), IN lists, BETWEEN
//          recursive CTEs (guided mode: anchor SQL + recursive step SQL)
//   None:  subqueries in FROM (skipped + warned), UNION (only first branch)

import { Parser } from 'node-sql-parser'
import {
  emptyFilterGroup,
  emptyQueryState,
} from '@/types/query'
import type {
  QueryState,
  TableInstance,
  JoinDef,
  JoinType,
  SelectedColumn,
  FilterGroup,
  FilterRule,
  ColumnRef,
  OrderByItem,
  CTEDef,
  CteOutputColumn,
  GrafanaPanelType,
  ColumnMeta,
} from '@/types/query'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'

// ── Grafana macro sentinel strings ─────────────────────────────────────────

const SENTINEL_TIMEFILTER = '__SENT_GFTIMEFILTER__'
const SENTINEL_EPOCHFILTER = '__SENT_GFEPOCHFILTER__'
const SENTINEL_EPOCHNANOFILTER = '__SENT_GFEPOCHNANOFILTER__'

const SENTINEL_TO_OPERATOR: Record<string, string> = {
  [SENTINEL_TIMEFILTER]: '$__timeFilter',
  [SENTINEL_EPOCHFILTER]: '$__unixEpochFilter',
  [SENTINEL_EPOCHNANOFILTER]: '$__unixEpochNanoFilter',
}

// ── Public types ───────────────────────────────────────────────────────────

export interface ImportResult {
  queryState: QueryState
  warnings: string[]
  detectedPanelType?: GrafanaPanelType
  /** Set when the SQL could not be structurally parsed — import as raw SQL instead. */
  rawSql?: string
}

// ── Macro preprocessing ────────────────────────────────────────────────────
//
// Uses a character-by-character scanner with paren-depth tracking instead of
// regex. Regex approaches fail when macro arguments contain nested parentheses
// (e.g. $__timeGroup(date_trunc('hour', time), '$__interval') or
//  $__timeFilter(coalesce(t.time, now()))). The regex [^)]+ stops at the first
// closing paren inside the argument, leaving orphaned fragments that crash the
// parser.

/** Extract the argument string inside balanced outer parentheses starting at openPos. */
function extractBalancedContent(sql: string, openPos: number): string {
  let depth = 1
  let i = openPos + 1
  while (i < sql.length && depth > 0) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') depth--
    if (depth > 0) i++
  }
  return sql.slice(openPos + 1, i)
}

/** Extract the first comma-delimited argument from an argument string, respecting nested parens. */
function firstArg(args: string): string {
  let depth = 0
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '(') depth++
    else if (args[i] === ')') depth--
    else if (args[i] === ',' && depth === 0) return args.slice(0, i).trim()
  }
  return args.trim()
}

/** Build the masked replacement for a single $__name(args) or standalone $__name. */
function macroReplacement(name: string, args: string | null): string {
  switch (name) {
    case 'timefilter':
      return args ? `${firstArg(args)} > '${SENTINEL_TIMEFILTER}'` : 'TRUE'
    case 'unixepochfilter':
      return args ? `${firstArg(args)} > '${SENTINEL_EPOCHFILTER}'` : 'TRUE'
    case 'unixepochnanofilter':
      return args ? `${firstArg(args)} > '${SENTINEL_EPOCHNANOFILTER}'` : 'TRUE'
    case 'timegroup':
    case 'timegroupalias':
      // Keep only the first arg (the column) — drop interval and fill args
      return args ? firstArg(args) : 'time'
    case 'timefrom':
    case 'timeto':
      return "'2000-01-01'"
    case 'interval':
      return "'1 hour'"
    case 'schema':
    case 'table':
    case 'column':
      // These appear as identifiers in FROM/SELECT — produce a safe bare word
      return 'grafana_placeholder'
    default:
      // Unknown macro: use TRUE for standalone (boolean context), '1' if it had args
      return args !== null ? "'1'" : 'TRUE'
  }
}

/**
 * Replace all Grafana macros and dashboard variables with syntactically valid
 * SQL placeholders so node-sql-parser can parse the query.
 *
 * Also handles the legacy [[variable]] Grafana template syntax.
 */
export function preprocessGrafanaMacros(sql: string): { masked: string; hasMacros: boolean } {
  let result = ''
  let hasMacros = false
  let i = 0

  while (i < sql.length) {
    // ── $__ macros ────────────────────────────────────────────────────────
    if (sql[i] === '$' && sql[i + 1] === '_' && sql[i + 2] === '_') {
      hasMacros = true
      // Collect the macro name (chars after $__)
      let j = i + 3
      while (j < sql.length && /\w/.test(sql[j])) j++
      const name = sql.slice(i + 3, j).toLowerCase()

      // Skip optional whitespace before (
      let k = j
      while (k < sql.length && sql[k] === ' ') k++

      if (k < sql.length && sql[k] === '(') {
        const args = extractBalancedContent(sql, k)
        result += macroReplacement(name, args)
        i = k + args.length + 2  // skip past the closing )
      } else {
        result += macroReplacement(name, null)
        i = j
      }
      continue
    }

    // ── ${varName} template variables ────────────────────────────────────
    if (sql[i] === '$' && sql[i + 1] === '{') {
      hasMacros = true
      let j = i + 2
      while (j < sql.length && sql[j] !== '}') j++
      result += '1'
      i = j + 1  // skip past }
      continue
    }

    // ── $varName plain variables (letter/underscore start) ───────────────
    if (sql[i] === '$' && i + 1 < sql.length && /[a-zA-Z_]/.test(sql[i + 1])) {
      hasMacros = true
      let j = i + 1
      while (j < sql.length && /\w/.test(sql[j])) j++
      result += '1'
      i = j
      continue
    }

    // ── [[varName]] legacy Grafana template syntax ───────────────────────
    if (sql[i] === '[' && sql[i + 1] === '[') {
      const end = sql.indexOf(']]', i + 2)
      if (end !== -1) {
        hasMacros = true
        result += '1'
        i = end + 2
        continue
      }
    }

    result += sql[i]
    i++
  }

  return { masked: result, hasMacros }
}

/**
 * After parser.sqlify() reconstructs CTE SQL from the masked AST, restore
 * sentinel placeholders back to the original Grafana macro form.
 * Pattern: `col > '__SENT_xxx__'` → `$__macroName(col)`
 */
export function restoreSentinelsInSql(sql: string): string {
  return sql
    .replace(/(\S+)\s*>\s*'__SENT_GFTIMEFILTER__'/g, '$__timeFilter($1)')
    .replace(/(\S+)\s*>\s*'__SENT_GFEPOCHFILTER__'/g, '$__unixEpochFilter($1)')
    .replace(/(\S+)\s*>\s*'__SENT_GFEPOCHNANOFILTER__'/g, '$__unixEpochNanoFilter($1)')
}

// ── Internal AST helpers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = Record<string, any>

/** Extract the string column name from a node-sql-parser column_ref node. */
function getColName(node: AstNode): string {
  const col = node.column
  if (col === '*') return '*'
  if (typeof col === 'string') return col
  if (col?.expr?.value !== undefined) return String(col.expr.value)
  return String(col)
}

/** Convert an AST expression node back to a SQL string (best-effort). */
function stringifyExpr(node: AstNode): string {
  if (!node) return ''
  switch (node.type) {
    case 'column_ref': {
      const col = getColName(node)
      return node.table ? `${node.table}.${col}` : col
    }
    case 'number':
      return String(node.value)
    case 'bool':
      return node.value ? 'TRUE' : 'FALSE'
    case 'null':
      return 'NULL'
    case 'string':
    case 'single_quote_string':
      return `'${String(node.value).replace(/'/g, "''")}'`
    case 'double_quote_string':
      return `"${String(node.value)}"`
    case 'binary_expr': {
      const left = stringifyExpr(node.left)
      const right = stringifyExpr(node.right)
      if (node.operator === 'IS' && node.right?.type === 'null') return `${left} IS NULL`
      if (node.operator === 'IS NOT' && node.right?.type === 'null') return `${left} IS NOT NULL`
      return `${left} ${node.operator} ${right}`
    }
    case 'aggr_func': {
      const distinct = node.args?.distinct ? 'DISTINCT ' : ''
      const inner = node.args?.expr ? stringifyExpr(node.args.expr) : '*'
      return `${node.name}(${distinct}${inner})`
    }
    case 'function': {
      const fnName = Array.isArray(node.name?.name)
        ? node.name.name.map((n: AstNode) => n.value).join('.')
        : (node.name?.name?.[0]?.value ?? node.name ?? 'fn')
      const args: string[] = (node.args?.value ?? []).map(stringifyExpr)
      return `${fnName}(${args.join(', ')})`
    }
    case 'expr_list': {
      const items: string[] = (node.value ?? []).map(stringifyExpr)
      return `(${items.join(', ')})`
    }
    case 'case': {
      // Fallback: just return CASE expression as a placeholder
      return 'CASE ... END'
    }
    default:
      return node.value !== undefined ? String(node.value) : '?'
  }
}

/** Extract a plain string value from AST literal nodes. */
function getLiteralValue(node: AstNode): string {
  if (!node) return ''
  switch (node.type) {
    case 'number': return String(node.value)
    case 'bool': return node.value ? 'true' : 'false'
    case 'null': return ''
    case 'string':
    case 'single_quote_string':
    case 'double_quote_string':
      return String(node.value)
    default:
      return String(node.value ?? '')
  }
}

// ── Table extraction ───────────────────────────────────────────────────────

interface TableExtractionResult {
  instances: TableInstance[]
  aliasMap: Map<string, TableInstance>
  warnings: string[]
}

function extractTables(
  fromClauses: AstNode[],
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[],
  cteMap: Map<string, CTEDef>
): TableExtractionResult {
  const instances: TableInstance[] = []
  const aliasMap = new Map<string, TableInstance>()
  const warnings: string[] = []

  let xPos = 80

  for (const entry of fromClauses) {
    // Skip subqueries in FROM (can't render as canvas nodes)
    if (entry.type === 'subquery' || entry.expr?.type === 'select') {
      warnings.push(
        `Subquery in FROM clause was skipped — subqueries cannot be rendered as canvas nodes.`
      )
      continue
    }

    const tableName: string = entry.table
    if (!tableName) continue

    const alias: string = entry.as ?? tableName

    // First check: is this a CTE virtual table?
    const cteDef = cteMap.get(tableName.toLowerCase())
    if (cteDef) {
      const instance: TableInstance = {
        id: crypto.randomUUID(),
        tableId: 0,
        tableName: cteDef.name,
        schemaName: '',
        alias,
        position: { x: xPos, y: 200 },
        columns: cteDef.outputColumns.map((col, idx) => ({
          id: idx,
          name: col.name,
          pgType: col.pgType,
          isNullable: true,
          isPrimaryKey: false,
        })),
        cteId: cteDef.id,
      }
      instances.push(instance)
      aliasMap.set(alias, instance)
      if (alias !== tableName) aliasMap.set(tableName, instance)
      xPos += 280
      continue
    }

    // Second check: real schema table
    const appTable = appTables.find(
      (t) => t.name.toLowerCase() === tableName.toLowerCase()
    )

    if (!appTable) {
      warnings.push(`Table "${tableName}" not found in Schema Admin — skipped.`)
      continue
    }

    const schema = schemas.find((s) => s.id === appTable.schemaId)
    const cols: AppColumn[] = appColumns[appTable.id] ?? []
    const colMetas: ColumnMeta[] = cols.map((c) => ({
      id: c.id,
      name: c.name,
      pgType: c.pgType,
      isNullable: c.isNullable,
      isPrimaryKey: c.isPrimaryKey,
      description: c.description,
    }))

    const instance: TableInstance = {
      id: crypto.randomUUID(),
      tableId: appTable.id,
      tableName: appTable.name,
      schemaName: schema?.name ?? '',
      alias,
      position: { x: xPos, y: 200 },
      columns: colMetas,
      cteId: undefined,
    }

    instances.push(instance)
    aliasMap.set(alias, instance)
    // Also map the table name itself if different from alias
    if (alias !== tableName) aliasMap.set(tableName, instance)
    xPos += 280
  }

  return { instances, aliasMap, warnings }
}

// ── Join extraction ────────────────────────────────────────────────────────

const SQL_JOIN_TYPE_MAP: Record<string, JoinType> = {
  'INNER JOIN': 'INNER',
  'JOIN': 'INNER',
  'LEFT JOIN': 'LEFT',
  'LEFT OUTER JOIN': 'LEFT',
  'RIGHT JOIN': 'RIGHT',
  'RIGHT OUTER JOIN': 'RIGHT',
  'FULL JOIN': 'FULL OUTER',
  'FULL OUTER JOIN': 'FULL OUTER',
  'CROSS JOIN': 'CROSS',
}

interface SimpleJoinCondition {
  leftTableAlias: string
  leftColumn: string
  rightTableAlias: string
  rightColumn: string
}

/** Try to extract a simple equality condition from an ON clause. */
function extractSimpleOnCondition(onNode: AstNode, aliasMap: Map<string, TableInstance>): SimpleJoinCondition | null {
  if (!onNode || onNode.type !== 'binary_expr' || onNode.operator !== '=') return null
  if (onNode.left?.type !== 'column_ref' || onNode.right?.type !== 'column_ref') return null

  const leftTable = onNode.left.table
  const rightTable = onNode.right.table
  if (!leftTable || !rightTable) return null
  if (!aliasMap.has(leftTable) || !aliasMap.has(rightTable)) return null

  return {
    leftTableAlias: leftTable,
    leftColumn: getColName(onNode.left),
    rightTableAlias: rightTable,
    rightColumn: getColName(onNode.right),
  }
}

function extractJoins(
  fromClauses: AstNode[],
  aliasMap: Map<string, TableInstance>,
  warnings: string[]
): JoinDef[] {
  const joins: JoinDef[] = []

  for (const entry of fromClauses) {
    if (!entry.join) continue

    const joinType: JoinType = SQL_JOIN_TYPE_MAP[entry.join] ?? 'INNER'
    const rightAlias = entry.as ?? entry.table

    if (!aliasMap.has(rightAlias) && !aliasMap.has(entry.table)) continue

    // Find the right table instance
    const rightInstance = aliasMap.get(rightAlias) ?? aliasMap.get(entry.table)
    if (!rightInstance) continue

    // Try to find the left table (the one before this join in aliasMap)
    // Use the left side of the ON condition if available
    let leftAlias: string | undefined
    let rightColumn: string | undefined
    let leftColumn: string | undefined
    let onExpression: string | undefined

    if (entry.on) {
      const simple = extractSimpleOnCondition(entry.on, aliasMap)
      if (simple) {
        // Determine which side is left vs right
        if (simple.rightTableAlias === rightAlias || simple.rightTableAlias === entry.table) {
          leftAlias = simple.leftTableAlias
          leftColumn = simple.leftColumn
          rightColumn = simple.rightColumn
        } else {
          leftAlias = simple.rightTableAlias
          leftColumn = simple.rightColumn
          rightColumn = simple.leftColumn
        }
      } else {
        // Complex ON clause — store as raw expression
        onExpression = stringifyExpr(entry.on)
        warnings.push(`JOIN "${entry.table}" has a complex ON condition — stored as raw expression.`)
      }
    }

    // If we still don't have a left alias, use the first table in aliasMap that isn't the right table
    if (!leftAlias) {
      for (const [alias, inst] of aliasMap) {
        if (inst.id !== rightInstance.id && alias === inst.alias) {
          leftAlias = alias
          break
        }
      }
    }

    if (!leftAlias) {
      warnings.push(`Could not determine left table for JOIN "${entry.table}" — join skipped.`)
      continue
    }

    const join: JoinDef = {
      id: crypto.randomUUID(),
      type: joinType,
      leftTableAlias: leftAlias,
      leftColumn: leftColumn ?? 'id',
      rightTableAlias: rightAlias,
      rightColumn: rightColumn ?? 'id',
    }

    if (onExpression) {
      join.onExpression = onExpression
    }

    joins.push(join)
  }

  return joins
}

// ── Column extraction ──────────────────────────────────────────────────────

const AGGREGATE_NAMES = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'STDDEV_POP', 'STDDEV_SAMP', 'VARIANCE'])

function extractSelectedColumns(
  columns: AstNode[],
  aliasMap: Map<string, TableInstance>,
  warnings: string[]
): SelectedColumn[] {
  const result: SelectedColumn[] = []

  for (const col of columns) {
    const expr = col.expr ?? col
    const alias: string | undefined = col.as ?? undefined

    // SELECT *
    if (expr.type === 'column_ref' && (expr.column === '*' || getColName(expr) === '*')) {
      // Expand to all columns in all aliased tables
      for (const [tableAlias, instance] of aliasMap) {
        if (tableAlias !== instance.alias) continue  // skip duplicate entries
        for (const colMeta of instance.columns) {
          result.push({
            id: crypto.randomUUID(),
            tableAlias: instance.alias,
            columnName: colMeta.name,
          })
        }
      }
      if (result.length > 0) {
        warnings.push(`SELECT * expanded to ${result.length} column(s) from known schema.`)
      } else {
        warnings.push('SELECT * detected but no schema columns found — no columns selected.')
      }
      continue
    }

    // table.* → expand columns for that table
    if (expr.type === 'column_ref' && getColName(expr) === '*' && expr.table) {
      const inst = aliasMap.get(expr.table)
      if (inst) {
        for (const colMeta of inst.columns) {
          result.push({
            id: crypto.randomUUID(),
            tableAlias: inst.alias,
            columnName: colMeta.name,
          })
        }
      }
      continue
    }

    // Simple column_ref
    if (expr.type === 'column_ref') {
      const colName = getColName(expr)
      const tableAlias = expr.table ?? inferTableAlias(colName, aliasMap)
      result.push({
        id: crypto.randomUUID(),
        tableAlias: tableAlias ?? '',
        columnName: colName,
        alias,
      })
      continue
    }

    // Aggregate function
    if (expr.type === 'aggr_func' && AGGREGATE_NAMES.has(expr.name)) {
      const argExpr = expr.args?.expr
      const isDistinct = Boolean(expr.args?.distinct)
      const aggName = isDistinct && expr.name === 'COUNT' ? 'COUNT DISTINCT' : expr.name

      if (argExpr?.type === 'column_ref') {
        const colName = getColName(argExpr)
        const tableAlias = argExpr.table ?? inferTableAlias(colName, aliasMap)
        result.push({
          id: crypto.randomUUID(),
          tableAlias: tableAlias ?? '',
          columnName: colName,
          alias,
          aggregate: aggName,
        })
      } else {
        // COUNT(*) or complex aggregate arg
        const colName = argExpr ? stringifyExpr(argExpr) : '*'
        result.push({
          id: crypto.randomUUID(),
          tableAlias: '',
          columnName: colName,
          alias,
          aggregate: aggName,
        })
      }
      continue
    }

    // Everything else: store as expression
    const expression = stringifyExpr(expr)
    result.push({
      id: crypto.randomUUID(),
      tableAlias: '',
      columnName: '',
      alias,
      expression,
    })
  }

  return result
}

/** Try to infer which table alias owns a column name by scanning schema. */
function inferTableAlias(colName: string, aliasMap: Map<string, TableInstance>): string | undefined {
  for (const [alias, inst] of aliasMap) {
    if (alias !== inst.alias) continue
    if (inst.columns.some((c) => c.name.toLowerCase() === colName.toLowerCase())) {
      return alias
    }
  }
  return undefined
}

// ── Filter (WHERE / HAVING) extraction ────────────────────────────────────

const OPERATOR_MAP: Record<string, string> = {
  '=': '=',
  '!=': '!=',
  '<>': '!=',
  '<': '<',
  '>': '>',
  '<=': '<=',
  '>=': '>=',
  'LIKE': 'contains',
  'ILIKE': 'contains',
  'NOT LIKE': 'doesNotContain',
  'NOT ILIKE': 'doesNotContain',
  'IN': 'in',
  'NOT IN': 'notIn',
  'BETWEEN': 'between',
  'NOT BETWEEN': 'notBetween',
  'IS': 'null',       // IS NULL → operator 'null'
  'IS NOT': 'notNull', // IS NOT NULL → operator 'notNull'
}

function extractFilterGroup(node: AstNode, warnings: string[]): FilterGroup {
  const group = emptyFilterGroup()

  if (!node) return group

  if (node.type === 'binary_expr' && (node.operator === 'AND' || node.operator === 'OR')) {
    group.combinator = node.operator as 'AND' | 'OR'
    const leftResult = extractFilterItem(node.left, warnings)
    const rightResult = extractFilterItem(node.right, warnings)
    if (leftResult) group.rules.push(leftResult)
    if (rightResult) group.rules.push(rightResult)
  } else {
    const item = extractFilterItem(node, warnings)
    if (item) group.rules.push(item)
  }

  return group
}

function extractFilterItem(
  node: AstNode,
  warnings: string[]
): FilterRule | FilterGroup | null {
  if (!node) return null

  // AND/OR → nested group
  if (node.type === 'binary_expr' && (node.operator === 'AND' || node.operator === 'OR')) {
    return extractFilterGroup(node, warnings)
  }

  // Binary comparison
  if (node.type === 'binary_expr') {
    const op = node.operator
    const leftIsCol = node.left?.type === 'column_ref'

    // IS NULL / IS NOT NULL
    if ((op === 'IS' || op === 'IS NOT') && node.right?.type === 'null') {
      if (!leftIsCol) {
        warnings.push(`Complex IS NULL condition skipped: ${stringifyExpr(node)}`)
        return null
      }
      const field = buildFieldRef(node.left)
      return makeRule(field, op === 'IS' ? 'null' : 'notNull', '')
    }

    // Check for Grafana macro sentinel in value
    if (leftIsCol && node.right?.type === 'single_quote_string') {
      const sentinelOp = SENTINEL_TO_OPERATOR[node.right.value]
      if (sentinelOp) {
        const field = buildFieldRef(node.left)
        return makeRule(field, sentinelOp, '')
      }
    }

    // Simple comparison: col op value
    if (leftIsCol) {
      const field = buildFieldRef(node.left)
      const mappedOp = OPERATOR_MAP[op]

      if (mappedOp) {
        if (mappedOp === 'null' || mappedOp === 'notNull') {
          return makeRule(field, mappedOp, '')
        }

        if (op === 'IN' || op === 'NOT IN') {
          const values = (node.right?.value ?? []).map(getLiteralValue)
          return makeRule(field, mappedOp, values.join(','))
        }

        if (op === 'BETWEEN' || op === 'NOT BETWEEN') {
          const vals = node.right?.value ?? []
          const lo = vals[0] ? getLiteralValue(vals[0]) : ''
          const hi = vals[1] ? getLiteralValue(vals[1]) : ''
          return makeRule(field, mappedOp, `${lo},${hi}`)
        }

        return makeRule(field, mappedOp, getLiteralValue(node.right))
      }
    }

    // Fallback: store as raw expression rule
    const raw = stringifyExpr(node)
    warnings.push(`Complex WHERE condition stored as raw expression: "${raw.slice(0, 60)}${raw.length > 60 ? '...' : ''}"`)
    return makeRule('__raw__', '=', `__RAW__:${raw}`)
  }

  // Anything else (function calls, etc.)
  const raw = stringifyExpr(node)
  warnings.push(`Unsupported WHERE expression stored as raw: "${raw.slice(0, 60)}${raw.length > 60 ? '...' : ''}"`)
  return makeRule('__raw__', '=', `__RAW__:${raw}`)
}

function buildFieldRef(colRefNode: AstNode): string {
  const colName = getColName(colRefNode)
  return colRefNode.table ? `${colRefNode.table}.${colName}` : colName
}

function makeRule(field: string, operator: string, value: string): FilterRule {
  return { id: crypto.randomUUID(), field, operator, value }
}

// ── GROUP BY extraction ────────────────────────────────────────────────────

function extractGroupBy(
  groupby: AstNode | null,
  aliasMap: Map<string, TableInstance>
): ColumnRef[] {
  if (!groupby) return []
  const cols: AstNode[] = Array.isArray(groupby) ? groupby : (groupby.columns ?? [])
  return cols.flatMap((node) => {
    if (node.type === 'column_ref') {
      const colName = getColName(node)
      const tableAlias = node.table ?? inferTableAlias(colName, aliasMap) ?? ''
      return [{ tableAlias, columnName: colName }]
    }
    return []
  })
}

// ── ORDER BY extraction ────────────────────────────────────────────────────

function extractOrderBy(
  orderby: AstNode[] | null,
  aliasMap: Map<string, TableInstance>
): OrderByItem[] {
  if (!orderby) return []
  return orderby.flatMap((item) => {
    const expr = item.expr
    if (expr?.type !== 'column_ref') return []
    const colName = getColName(expr)
    const tableAlias = expr.table ?? inferTableAlias(colName, aliasMap) ?? ''
    return [{
      tableAlias,
      columnName: colName,
      direction: (item.type === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC',
    }]
  })
}

// ── LIMIT / OFFSET extraction ──────────────────────────────────────────────

function extractLimitOffset(limitNode: AstNode | null): { limit: number | null; offset: number | null } {
  if (!limitNode || !Array.isArray(limitNode.value) || limitNode.value.length === 0) {
    return { limit: null, offset: null }
  }
  const vals = limitNode.value
  if (limitNode.seperator === 'offset' && vals.length >= 2) {
    return { limit: vals[0]?.value ?? null, offset: vals[1]?.value ?? null }
  }
  return { limit: vals[0]?.value ?? null, offset: null }
}

// ── CTE extraction ─────────────────────────────────────────────────────────

/**
 * Derive CTE output columns from a parsed QueryState — mirrors the logic in
 * queryStore.promoteMainQueryToCte so the column metadata is consistent.
 */
function deriveOutputColumns(qs: QueryState): CteOutputColumn[] {
  return qs.selectedColumns.map((sc) => {
    const name = (sc.alias ?? sc.columnName) || 'col'
    if (sc.expression || sc.aggregate) return { name, pgType: 'text' }
    const table = qs.tables.find((t) => t.alias === sc.tableAlias)
    const colMeta = table?.columns.find((c) => c.name === sc.columnName)
    return { name, pgType: colMeta?.pgType ?? 'text' }
  })
}

/**
 * Core parsing pipeline: maps a SELECT AST node to a QueryState.
 * Accepts a cteMap so CTE virtual tables can be resolved during extraction.
 */
function parseSelectAst(
  ast: AstNode,
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[],
  cteMap: Map<string, CTEDef>,
  warnings: string[],
  isSubquery: boolean
): QueryState {
  const fromClauses: AstNode[] = ast.from ?? []
  const { instances, aliasMap, warnings: tableWarnings } = extractTables(
    fromClauses, appTables, appColumns, schemas, cteMap
  )
  warnings.push(...tableWarnings)

  const joins = extractJoins(fromClauses, aliasMap, warnings)
  const selectedColumns = extractSelectedColumns(ast.columns ?? [], aliasMap, warnings)
  const where = ast.where ? extractFilterGroup(ast.where, warnings) : emptyFilterGroup()
  const groupBy = extractGroupBy(ast.groupby, aliasMap)
  const having = ast.having ? extractFilterGroup(ast.having, warnings) : emptyFilterGroup()
  const orderBy = extractOrderBy(ast.orderby, aliasMap)
  const { limit, offset } = extractLimitOffset(ast.limit)
  const distinct = ast.distinct?.type === 'DISTINCT'

  return {
    ...emptyQueryState(),
    tables: instances,
    joins,
    selectedColumns,
    where,
    groupBy,
    having,
    orderBy,
    limit,
    offset,
    distinct,
    isSubquery,
  }
}

/**
 * Extract CTEs from a WITH clause, reconstructing each one into visual
 * QueryState mode. Processes them in declaration order so each CTE can
 * reference earlier ones via the growing cteMap.
 *
 * - Non-recursive CTEs: fully parsed into nested QueryState (visual mode).
 * - Recursive CTEs (UNION ALL): guided mode with anchorSql + recursiveStepSql.
 */
function extractCtes(
  withClauses: AstNode[] | null,
  parser: Parser,
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[],
  warnings: string[]
): { ctes: CTEDef[]; cteMap: Map<string, CTEDef> } {
  if (!withClauses) return { ctes: [], cteMap: new Map() }

  const ctes: CTEDef[] = []
  const cteMap = new Map<string, CTEDef>()

  for (const clause of withClauses) {
    const name: string = clause.name?.value ?? clause.name ?? 'cte'
    const stmt: AstNode = clause.stmt
    const isRecursive = stmt.set_op === 'union all' && stmt._next !== undefined

    const cteId = crypto.randomUUID()

    if (isRecursive) {
      // Guided mode: split anchor and recursive step via the AST _next chain
      let anchorSql = ''
      let recursiveStepSql = ''
      try {
        // Sqlify the anchor by stripping _next and set_op from a shallow copy
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anchorAst = { ...stmt, _next: undefined, set_op: undefined } as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        anchorSql = restoreSentinelsInSql(parser.sqlify(anchorAst as any, { database: 'PostgreSQL' }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recursiveStepSql = restoreSentinelsInSql(parser.sqlify(stmt._next as any, { database: 'PostgreSQL' }))
      } catch {
        // Fallback: sqlify the whole CTE body as raw SQL
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          anchorSql = restoreSentinelsInSql(parser.sqlify(stmt as any, { database: 'PostgreSQL' }))
        } catch {
          anchorSql = '-- anchor SQL could not be reconstructed'
        }
        recursiveStepSql = ''
      }

      // Derive output columns from the anchor SELECT list (without recursion)
      const anchorQs = parseSelectAst(
        { ...stmt, _next: undefined, set_op: undefined },
        appTables, appColumns, schemas, cteMap, [], true
      )
      const outputColumns = deriveOutputColumns(anchorQs)

      warnings.push(`Recursive CTE "${name}" imported in guided mode (anchor + recursive step).`)

      const cteDef: CTEDef = {
        id: cteId,
        name,
        recursive: true,
        recursiveMode: 'guided',
        anchorSql,
        recursiveStepSql,
        queryState: emptyQueryState(),
        outputColumns,
      }
      ctes.push(cteDef)
      cteMap.set(name.toLowerCase(), cteDef)
    } else {
      // Visual mode: fully reconstruct the CTE's SELECT into a nested QueryState
      const cteWarnings: string[] = []
      const innerQs = parseSelectAst(
        stmt, appTables, appColumns, schemas, cteMap, cteWarnings, true
      )
      warnings.push(...cteWarnings.map((w) => `CTE "${name}": ${w}`))

      const outputColumns = deriveOutputColumns(innerQs)

      const cteDef: CTEDef = {
        id: cteId,
        name,
        recursive: false,
        queryState: innerQs,
        outputColumns,
      }
      ctes.push(cteDef)
      cteMap.set(name.toLowerCase(), cteDef)
    }
  }

  return { ctes, cteMap }
}

// ── Grafana intent detection ───────────────────────────────────────────────

function detectGrafanaIntent(qs: QueryState): {
  panelType?: GrafanaPanelType
  timeColumn?: { tableAlias: string; columnName: string }
} {
  let timeColumn: { tableAlias: string; columnName: string } | undefined

  // Check for timeFilter operators in WHERE rules
  const scanRules = (group: { rules?: unknown[] }) => {
    for (const rule of group.rules ?? []) {
      const r = rule as FilterRule
      if (r.operator === '$__timeFilter' || r.operator === '$__unixEpochFilter' || r.operator === '$__unixEpochNanoFilter') {
        const parts = r.field.split('.')
        if (parts.length >= 2) {
          timeColumn = { tableAlias: parts[0], columnName: parts[1] }
        }
      }
    }
  }
  scanRules(qs.where)
  scanRules(qs.having)

  // Detect panel type from structure
  let panelType: GrafanaPanelType | undefined
  const hasTimeCol = Boolean(timeColumn)
  const hasAggregates = qs.selectedColumns.some((c) => Boolean(c.aggregate))
  const hasGroupBy = qs.groupBy.length > 0

  if (hasTimeCol) {
    panelType = 'time-series'
  } else if (hasAggregates && !hasGroupBy) {
    panelType = 'stat'
  }

  return { panelType, timeColumn }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Parse a SELECT SQL string into a QueryState.
 * Returns the best-effort QueryState along with any warnings.
 */
export function parseSqlToQueryState(
  sql: string,
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[]
): ImportResult {
  const warnings: string[] = []

  const { masked, hasMacros } = preprocessGrafanaMacros(sql.trim())
  if (hasMacros) {
    warnings.push('Grafana macros detected ($__timeFilter, $__interval, etc.) — preserved as-is in the imported query.')
  }

  const parser = new Parser()
  let rawAst: AstNode
  try {
    rawAst = parser.astify(masked, { database: 'PostgreSQL' }) as AstNode
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`SQL parse error: ${msg}`)
    warnings.push('This query uses syntax not supported by the visual parser (e.g. PostgreSQL-specific operators, ORDER BY inside aggregates, AT TIME ZONE). You can still import it as raw SQL to view and edit it in the SQL editor.')
    return { queryState: emptyQueryState(), warnings, rawSql: sql.trim() }
  }

  // Handle array result (multiple statements — use first)
  const ast: AstNode = Array.isArray(rawAst) ? rawAst[0] : rawAst

  if (!ast || ast.type !== 'select') {
    warnings.push('Only SELECT statements can be imported.')
    return { queryState: emptyQueryState(), warnings }
  }

  // CTEs — parsed in declaration order so each can reference previous ones
  const { ctes, cteMap } = extractCtes(
    ast.with, parser, appTables, appColumns, schemas, warnings
  )

  // Main query — uses cteMap so CTE virtual tables are resolved
  const mainQs = parseSelectAst(ast, appTables, appColumns, schemas, cteMap, warnings, false)

  const queryState: QueryState = {
    ...mainQs,
    ctes,
  }

  const { panelType, timeColumn } = detectGrafanaIntent(queryState)
  if (timeColumn) {
    queryState.timeColumn = timeColumn
    queryState.grafanaPanelType = panelType
  } else if (panelType) {
    queryState.grafanaPanelType = panelType
  }

  if (queryState.tables.length === 0 && ctes.length === 0) {
    warnings.push('No tables could be resolved from the schema. Check that the referenced tables exist in Schema Admin.')
  }

  return { queryState, warnings, detectedPanelType: panelType }
}
