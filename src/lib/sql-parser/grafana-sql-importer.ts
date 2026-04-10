// Best-effort SQL → QueryState importer for Grafana panel queries.
// Uses pgsql-parser (the actual PostgreSQL C parser compiled to WASM) to
// parse SQL into an AST, then maps the AST to the application's QueryState.
//
// Reconstruction quality:
//   Good:  simple JOINs, column refs, aggregates, WHERE/GROUP BY/ORDER BY/LIMIT
//          non-recursive CTEs (fully visual), CTE virtual tables in main query
//          PostgreSQL-specific operators (<@, @>, &&, AT TIME ZONE, etc.)
//   Fair:  complex WHERE (preserved as raw rule), IN lists, BETWEEN
//          recursive CTEs (guided mode: anchor SQL + recursive step SQL)
//   None:  subqueries in FROM (skipped + warned), UNION (only first branch)

import { parse, deparseSync } from 'pgsql-parser'
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
  UnionBranch,
  UnionOperator,
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
 * SQL placeholders so pgsql-parser can parse the query.
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
 * After CTE SQL is reconstructed, restore sentinel placeholders back to the
 * original Grafana macro form.
 * Pattern: `col > '__SENT_xxx__'` → `$__macroName(col)`
 */
export function restoreSentinelsInSql(sql: string): string {
  return sql
    .replace(/(\S+)\s*>\s*'__SENT_GFTIMEFILTER__'/g, '$__timeFilter($1)')
    .replace(/(\S+)\s*>\s*'__SENT_GFEPOCHFILTER__'/g, '$__unixEpochFilter($1)')
    .replace(/(\S+)\s*>\s*'__SENT_GFEPOCHNANOFILTER__'/g, '$__unixEpochNanoFilter($1)')
}

// ── pgsql-parser AST helpers ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgNode = Record<string, any>

/** Access a named sub-node (e.g. nk('SelectStmt', node) → node.SelectStmt or null). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nk(type: string, node: any): any {
  if (!node || typeof node !== 'object') return null
  return type in node ? node[type] : null
}

/** Extract sval from a String node (used in ColumnRef.fields, FuncCall.funcname). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStrVal(node: any): string | null {
  const s = nk('String', node)
  return s?.sval ?? null
}

/** Extract the column reference parts from a ColumnRef node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getColRefParts(node: any): { tableAlias: string | null; colName: string } | null {
  const cr = nk('ColumnRef', node)
  if (!cr) return null
  const fields: PgNode[] = cr.fields ?? []
  if (fields.length === 0) return null
  if (fields.length === 1) {
    if (nk('A_Star', fields[0]) !== null) return { tableAlias: null, colName: '*' }
    return { tableAlias: null, colName: getStrVal(fields[0]) ?? '' }
  }
  const tableAlias = getStrVal(fields[0])
  const last = fields[fields.length - 1]
  if (nk('A_Star', last) !== null) return { tableAlias, colName: '*' }
  return { tableAlias, colName: getStrVal(last) ?? '' }
}

/** Extract a literal string representation from an A_Const node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getConstLiteral(node: any): string {
  const ac = nk('A_Const', node)
  if (!ac) return ''
  if (ac.isnull) return 'NULL'
  if (ac.sval !== undefined) return `'${String(ac.sval.sval ?? '').replace(/'/g, "''")}'`
  if (ac.ival !== undefined) return String(ac.ival.ival ?? 0)
  if (ac.fval !== undefined) return String(ac.fval.fval ?? 0)
  if (ac.boolval !== undefined) return ac.boolval.boolval ? 'TRUE' : 'FALSE'
  return ''
}

/** Extract the raw value from an A_Const for use as a filter rule value. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getConstValue(node: any): string {
  const ac = nk('A_Const', node)
  if (!ac) return ''
  if (ac.isnull) return ''
  if (ac.sval !== undefined) return String(ac.sval.sval ?? '')
  if (ac.ival !== undefined) return String(ac.ival.ival ?? 0)
  if (ac.fval !== undefined) return String(ac.fval.fval ?? 0)
  if (ac.boolval !== undefined) return String(ac.boolval.boolval ?? false)
  return ''
}

/** Extract the function name string from FuncCall.funcname node array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFuncName(funcname: any[]): string {
  return (funcname ?? []).map((n: PgNode) => getStrVal(n) ?? '').filter(Boolean).join('.')
}

/** Get the operator string from an A_Expr.name array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOpName(name: any[]): string {
  return (name ?? []).map((n: PgNode) => getStrVal(n) ?? '').join('')
}

/** Get the type name string from a TypeCast.typeName node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTypeName(typeName: any): string {
  if (!typeName) return ''
  const tn = nk('TypeName', typeName) ?? typeName
  const names: PgNode[] = tn.names ?? []
  // Filter out 'pg_catalog' prefix
  const parts = names.map((n: PgNode) => getStrVal(n) ?? '').filter((s) => s && s !== 'pg_catalog')
  const base = parts.join('.')
  const arrayBounds = tn.arrayBounds ?? []
  return arrayBounds.length > 0 ? `${base}[]` : base
}

/**
 * Synchronous SQL reconstruction for an AST node.
 * Covers common patterns; falls back to deparseSync for complex expressions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stringifyNode(node: any): string {
  if (!node || typeof node !== 'object') return ''

  // ColumnRef
  const cr = getColRefParts(node)
  if (cr !== null) {
    return cr.tableAlias ? `${cr.tableAlias}.${cr.colName}` : cr.colName
  }

  // A_Const
  if (nk('A_Const', node) !== null) return getConstLiteral(node)

  // A_Star (bare * in SELECT)
  if (nk('A_Star', node) !== null) return '*'

  // TypeCast (expr::type)
  const tc = nk('TypeCast', node)
  if (tc) {
    const argSql = stringifyNode(tc.arg)
    const typeSql = getTypeName(tc.typeName)
    return `${argSql}::${typeSql}`
  }

  // FuncCall — special-case timezone() → AT TIME ZONE
  const fc = nk('FuncCall', node)
  if (fc) {
    const fnName = getFuncName(fc.funcname ?? [])
    if (fnName === 'timezone' && (fc.args ?? []).length === 2) {
      // PostgreSQL internally stores `expr AT TIME ZONE zone` as timezone(zone, expr)
      // zone is args[0], expr is args[1]
      const zoneSql = stringifyNode(fc.args[0])
      const exprSql = stringifyNode(fc.args[1])
      return `${exprSql} AT TIME ZONE ${zoneSql}`
    }
    const distinct = fc.agg_distinct ? 'DISTINCT ' : ''
    if (fc.agg_star) return `${fnName}(*)`
    const argStrs = (fc.args ?? []).map(stringifyNode)
    const orderByStrs = (fc.agg_order ?? []).map((sb: PgNode) => {
      const sbNode = nk('SortBy', sb)
      if (!sbNode) return ''
      const colSql = stringifyNode(sbNode.node)
      const dir = sbNode.sortby_dir === 'SORTBY_DESC' ? ' DESC' : ''
      return colSql + dir
    }).filter(Boolean)
    const orderBySql = orderByStrs.length > 0 ? ` ORDER BY ${orderByStrs.join(', ')}` : ''
    return `${fnName}(${distinct}${argStrs.join(', ')}${orderBySql})`
  }

  // A_Expr (binary operator)
  const ae = nk('A_Expr', node)
  if (ae) {
    const op = getOpName(ae.name ?? [])
    const kind: string = ae.kind ?? 'AEXPR_OP'
    if (kind === 'AEXPR_IN') {
      const left = stringifyNode(ae.lexpr)
      const listNode = nk('List', ae.rexpr)
      const items = (listNode?.items ?? []).map(stringifyNode)
      return `${left} IN (${items.join(', ')})`
    }
    if (kind === 'AEXPR_LIKE') {
      return `${stringifyNode(ae.lexpr)} LIKE ${stringifyNode(ae.rexpr)}`
    }
    if (kind === 'AEXPR_ILIKE') {
      return `${stringifyNode(ae.lexpr)} ILIKE ${stringifyNode(ae.rexpr)}`
    }
    if (kind === 'AEXPR_BETWEEN' || kind === 'AEXPR_NOT_BETWEEN') {
      const kw = kind === 'AEXPR_NOT_BETWEEN' ? 'NOT BETWEEN' : 'BETWEEN'
      const listNode = nk('List', ae.rexpr)
      const items = (listNode?.items ?? [])
      const lo = items[0] ? stringifyNode(items[0]) : ''
      const hi = items[1] ? stringifyNode(items[1]) : ''
      return `${stringifyNode(ae.lexpr)} ${kw} ${lo} AND ${hi}`
    }
    if (!ae.lexpr) {
      // Unary operator (e.g. NOT, unary minus)
      return `${op}${stringifyNode(ae.rexpr)}`
    }
    return `${stringifyNode(ae.lexpr)} ${op} ${stringifyNode(ae.rexpr)}`
  }

  // BoolExpr (AND/OR/NOT)
  const be = nk('BoolExpr', node)
  if (be) {
    const args: PgNode[] = be.args ?? []
    if (be.boolop === 'NOT_EXPR') {
      return `NOT (${stringifyNode(args[0])})`
    }
    const sep = be.boolop === 'OR_EXPR' ? ' OR ' : ' AND '
    return `(${args.map(stringifyNode).join(sep)})`
  }

  // NullTest (IS NULL / IS NOT NULL)
  const nt = nk('NullTest', node)
  if (nt) {
    const argSql = stringifyNode(nt.arg)
    return nt.nulltesttype === 'IS_NOT_NULL' ? `${argSql} IS NOT NULL` : `${argSql} IS NULL`
  }

  // SubLink (subquery in expression)
  const sl = nk('SubLink', node)
  if (sl) {
    try {
      // Use deparseSync to reconstruct the subquery
      const sql = deparseSync({
        version: 170004,
        stmts: [{ stmt: { SelectStmt: nk('SelectStmt', sl.subselect) ?? sl.subselect } }],
      })
      return `(${sql})`
    } catch {
      return '(subquery)'
    }
  }

  // Row expression
  const row = nk('RowExpr', node)
  if (row) {
    const args = (row.args ?? []).map(stringifyNode)
    return `ROW(${args.join(', ')})`
  }

  // Fallback: try deparseSync by wrapping in a SELECT
  try {
    const sql = deparseSync({
      version: 170004,
      stmts: [{ stmt: { SelectStmt: { targetList: [{ ResTarget: { val: node } }] } } }],
    })
    // deparseSync returns "SELECT expr" — extract just the expression
    const match = sql.match(/^SELECT\s+([\s\S]+)$/i)
    return match ? match[1].trim() : sql
  } catch {
    return '<expression>'
  }
}

// ── Table extraction ───────────────────────────────────────────────────────

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

/**
 * Recursively collect all leaf RangeVar / RangeSubselect nodes from a
 * pgsql-parser fromClause item (which may be nested JoinExpr).
 */
function flattenFromItem(item: PgNode): PgNode[] {
  // RangeVar (plain table ref)
  if (nk('RangeVar', item) !== null) return [item]

  // RangeSubselect (subquery in FROM)
  if (nk('RangeSubselect', item) !== null) return [item]

  // JoinExpr — recurse into both sides
  const je = nk('JoinExpr', item)
  if (je) {
    return [
      ...flattenFromItem(je.larg ?? {}),
      ...flattenFromItem(je.rarg ?? {}),
    ]
  }

  // RangeFunction (e.g. generate_series()) — skip
  return []
}

function extractTables(
  fromClause: PgNode[],
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[],
  cteMap: Map<string, CTEDef>
): { instances: TableInstance[]; aliasMap: Map<string, TableInstance>; warnings: string[] } {
  const instances: TableInstance[] = []
  const aliasMap = new Map<string, TableInstance>()
  const warnings: string[] = []
  let xPos = 80

  const allItems = (fromClause ?? []).flatMap(flattenFromItem)

  for (const item of allItems) {
    // Subquery in FROM — skip
    if (nk('RangeSubselect', item) !== null) {
      warnings.push('Subquery in FROM clause was skipped — subqueries cannot be rendered as canvas nodes.')
      continue
    }

    const rv = nk('RangeVar', item)
    if (!rv) continue

    const tableName: string = rv.relname ?? ''
    if (!tableName) continue

    // Skip grafana_placeholder (from $__schema(), $__table() preprocessing)
    if (tableName === 'grafana_placeholder') {
      warnings.push('Grafana schema/table macro ($__schema, $__table) was skipped — cannot resolve at import time.')
      continue
    }

    const alias: string = rv.alias?.aliasname ?? tableName

    // First check: CTE virtual table?
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
    // Try matching with optional schema qualifier
    const schemaName: string | undefined = rv.schemaname
    const appTable = appTables.find((t) => {
      const nameMatch = t.name.toLowerCase() === tableName.toLowerCase()
      if (!nameMatch) return false
      if (schemaName) {
        const sch = schemas.find((s) => s.id === t.schemaId)
        return sch?.name.toLowerCase() === schemaName.toLowerCase()
      }
      return true
    })

    if (!appTable) {
      warnings.push(`Table "${schemaName ? `${schemaName}.` : ''}${tableName}" not found in Schema Admin — skipped.`)
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
    if (alias !== tableName) aliasMap.set(tableName, instance)
    xPos += 280
  }

  return { instances, aliasMap, warnings }
}

// ── Join extraction ────────────────────────────────────────────────────────

const PG_JOIN_TYPE_MAP: Record<string, JoinType> = {
  JOIN_INNER: 'INNER',
  JOIN_LEFT: 'LEFT',
  JOIN_RIGHT: 'RIGHT',
  JOIN_FULL: 'FULL OUTER',
}

/**
 * Recursively collect all JoinExpr nodes from a fromClause item.
 * Returns them in order (outermost join first / innermost last based on nesting).
 */
function flattenJoinExprs(item: PgNode): PgNode[] {
  const je = nk('JoinExpr', item)
  if (!je) return []
  return [
    ...flattenJoinExprs(je.larg ?? {}),
    item,
  ]
}

/** Try to extract a simple equality ON condition (a.col = b.col). */
function extractSimpleOnCondition(qualsNode: PgNode, aliasMap: Map<string, TableInstance>) {
  const ae = nk('A_Expr', qualsNode)
  if (!ae) return null
  if ((ae.kind ?? 'AEXPR_OP') !== 'AEXPR_OP') return null
  if (getOpName(ae.name ?? []) !== '=') return null

  const left = getColRefParts(ae.lexpr)
  const right = getColRefParts(ae.rexpr)
  if (!left || !right) return null
  if (!left.tableAlias || !right.tableAlias) return null
  if (!aliasMap.has(left.tableAlias) || !aliasMap.has(right.tableAlias)) return null

  return {
    leftTableAlias: left.tableAlias,
    leftColumn: left.colName,
    rightTableAlias: right.tableAlias,
    rightColumn: right.colName,
  }
}

function extractJoins(
  fromClause: PgNode[],
  aliasMap: Map<string, TableInstance>,
  warnings: string[]
): JoinDef[] {
  const joins: JoinDef[] = []

  const allJoinExprs = (fromClause ?? []).flatMap(flattenJoinExprs)

  for (const joinItem of allJoinExprs) {
    const je = nk('JoinExpr', joinItem)
    if (!je) continue

    const joinType: JoinType = PG_JOIN_TYPE_MAP[je.jointype ?? 'JOIN_INNER'] ?? 'INNER'

    // Determine the right table alias from rarg
    const rv = nk('RangeVar', je.rarg ?? {})
    if (!rv) continue
    const rightTableName: string = rv.relname ?? ''
    const rightAlias: string = rv.alias?.aliasname ?? rightTableName
    const rightInstance = aliasMap.get(rightAlias) ?? aliasMap.get(rightTableName)
    if (!rightInstance) continue

    let leftAlias: string | undefined
    let leftColumn: string | undefined
    let rightColumn: string | undefined
    let onExpression: string | undefined

    if (je.quals) {
      const simple = extractSimpleOnCondition(je.quals, aliasMap)
      if (simple) {
        // Determine which side is left vs right in our model
        if (simple.rightTableAlias === rightAlias || simple.rightTableAlias === rightTableName) {
          leftAlias = simple.leftTableAlias
          leftColumn = simple.leftColumn
          rightColumn = simple.rightColumn
        } else {
          leftAlias = simple.rightTableAlias
          leftColumn = simple.rightColumn
          rightColumn = simple.leftColumn
        }
      } else {
        // Complex ON condition — store as raw expression
        onExpression = stringifyNode(je.quals)
        warnings.push(`JOIN "${rightTableName}" has a complex ON condition — stored as raw expression.`)
      }
    }

    // Fallback: pick the first table that isn't the right table
    if (!leftAlias) {
      for (const [alias, inst] of aliasMap) {
        if (inst.id !== rightInstance.id && alias === inst.alias) {
          leftAlias = alias
          break
        }
      }
    }

    if (!leftAlias) {
      warnings.push(`Could not determine left table for JOIN "${rightTableName}" — join skipped.`)
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
    if (onExpression) join.onExpression = onExpression

    joins.push(join)
  }

  return joins
}

// ── Column extraction ──────────────────────────────────────────────────────

const AGGREGATE_NAMES = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'stddev', 'stddev_pop', 'stddev_samp', 'variance',
  'array_agg', 'string_agg', 'json_agg', 'jsonb_agg', 'bool_and', 'bool_or',
  'every', 'bit_and', 'bit_or', 'xml_agg',
])

function extractSelectedColumns(
  targetList: PgNode[],
  aliasMap: Map<string, TableInstance>,
  warnings: string[]
): SelectedColumn[] {
  const result: SelectedColumn[] = []

  for (const target of (targetList ?? [])) {
    const rt = nk('ResTarget', target)
    if (!rt) continue

    const alias: string | undefined = rt.name ?? undefined
    const val: PgNode = rt.val ?? {}

    // SELECT * (A_Star at top level is not typical; usually wrapped in ColumnRef with A_Star field)
    if (nk('A_Star', val) !== null) {
      // Expand to all columns from all tables
      for (const [tableAlias, instance] of aliasMap) {
        if (tableAlias !== instance.alias) continue
        for (const colMeta of instance.columns) {
          result.push({ id: crypto.randomUUID(), tableAlias: instance.alias, columnName: colMeta.name })
        }
      }
      warnings.push(`SELECT * expanded to ${result.length} column(s) from known schema.`)
      continue
    }

    // ColumnRef
    const cr = getColRefParts(val)
    if (cr !== null) {
      if (cr.colName === '*') {
        // table.*
        if (cr.tableAlias) {
          const inst = aliasMap.get(cr.tableAlias)
          if (inst) {
            for (const colMeta of inst.columns) {
              result.push({ id: crypto.randomUUID(), tableAlias: inst.alias, columnName: colMeta.name })
            }
          }
        }
        continue
      }
      const tableAlias = cr.tableAlias ?? inferTableAlias(cr.colName, aliasMap)
      result.push({
        id: crypto.randomUUID(),
        tableAlias: tableAlias ?? '',
        columnName: cr.colName,
        alias,
      })
      continue
    }

    // FuncCall — check for aggregate or AT TIME ZONE
    const fc = nk('FuncCall', val)
    if (fc) {
      const fnName = getFuncName(fc.funcname ?? [])

      // AT TIME ZONE → timezone(zone, col) → store as expression
      if (fnName === 'timezone' && (fc.args ?? []).length === 2) {
        const expr = stringifyNode(val)
        result.push({ id: crypto.randomUUID(), tableAlias: '', columnName: '', alias, expression: expr })
        continue
      }

      // Known aggregate
      if (AGGREGATE_NAMES.has(fnName.toLowerCase())) {
        const aggName = fnName.toUpperCase()
        const isDistinct = Boolean(fc.agg_distinct)
        const displayAgg = isDistinct && aggName === 'COUNT' ? 'COUNT DISTINCT' : aggName

        if (fc.agg_star) {
          result.push({ id: crypto.randomUUID(), tableAlias: '', columnName: '*', alias, aggregate: displayAgg })
          continue
        }

        const firstArgNode = fc.args?.[0]
        if (firstArgNode) {
          const argCr = getColRefParts(firstArgNode)
          if (argCr) {
            const tableAlias = argCr.tableAlias ?? inferTableAlias(argCr.colName, aliasMap)
            result.push({
              id: crypto.randomUUID(),
              tableAlias: tableAlias ?? '',
              columnName: argCr.colName,
              alias,
              aggregate: displayAgg,
            })
            continue
          }
        }
        // Complex aggregate arg
        const argStr = fc.args ? fc.args.map(stringifyNode).join(', ') : '*'
        result.push({ id: crypto.randomUUID(), tableAlias: '', columnName: argStr, alias, aggregate: displayAgg })
        continue
      }
    }

    // Everything else: store as expression
    const expr = stringifyNode(val)
    result.push({ id: crypto.randomUUID(), tableAlias: '', columnName: '', alias, expression: expr })
  }

  return result
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
  // PostgreSQL range operators — preserved as structured rules
  '<@': '<@',
  '@>': '@>',
  '&&': '&&',
  '>>': '>>',
  '<<': '<<',
  '&<': '&<',
  '&>': '&>',
  '-|-': '-|-',
}

function makeRule(field: string, operator: string, value: string): FilterRule {
  return { id: crypto.randomUUID(), field, operator, value }
}

function extractFilterGroup(node: PgNode | null | undefined, warnings: string[]): FilterGroup {
  const group = emptyFilterGroup()
  if (!node) return group

  const be = nk('BoolExpr', node)
  if (be && (be.boolop === 'AND_EXPR' || be.boolop === 'OR_EXPR')) {
    group.combinator = be.boolop === 'OR_EXPR' ? 'OR' : 'AND'
    for (const arg of (be.args ?? [])) {
      const item = extractFilterItem(arg, warnings)
      if (item) group.rules.push(item)
    }
    return group
  }

  const item = extractFilterItem(node, warnings)
  if (item) group.rules.push(item)
  return group
}

function extractFilterItem(
  node: PgNode,
  warnings: string[]
): FilterRule | FilterGroup | null {
  if (!node) return null

  // BoolExpr AND/OR → nested group
  const be = nk('BoolExpr', node)
  if (be && (be.boolop === 'AND_EXPR' || be.boolop === 'OR_EXPR')) {
    return extractFilterGroup(node, warnings)
  }
  // BoolExpr NOT → raw expression (FilterGroup has no 'not' field)
  if (be && be.boolop === 'NOT_EXPR') {
    const inner = be.args?.[0]
    if (inner) {
      warnings.push('NOT expression imported as raw filter expression')
      return {
        id: crypto.randomUUID(),
        field: '',
        operator: 'expression',
        value: `NOT (${stringifyNode(inner)})`,
      } as FilterRule
    }
    return null
  }

  // NullTest: IS NULL / IS NOT NULL
  const nt = nk('NullTest', node)
  if (nt) {
    const cr = getColRefParts(nt.arg ?? {})
    if (!cr) {
      const raw = stringifyNode(node)
      return makeRule('__raw__', '=', `__RAW__:${raw}`)
    }
    const field = cr.tableAlias ? `${cr.tableAlias}.${cr.colName}` : cr.colName
    return makeRule(field, nt.nulltesttype === 'IS_NOT_NULL' ? 'notNull' : 'null', '')
  }

  // A_Expr (binary operator including <@, @>, &&, etc.)
  const ae = nk('A_Expr', node)
  if (ae) {
    const kind: string = ae.kind ?? 'AEXPR_OP'

    // IN / NOT IN
    if (kind === 'AEXPR_IN') {
      const cr = getColRefParts(ae.lexpr ?? {})
      if (cr) {
        const field = cr.tableAlias ? `${cr.tableAlias}.${cr.colName}` : cr.colName
        const op = getOpName(ae.name ?? []) === '<>' ? 'notIn' : 'in'
        const listNode = nk('List', ae.rexpr ?? {})
        const values = (listNode?.items ?? []).map(getConstValue)
        return makeRule(field, op, values.join(','))
      }
    }

    // BETWEEN / NOT BETWEEN
    if (kind === 'AEXPR_BETWEEN' || kind === 'AEXPR_NOT_BETWEEN') {
      const cr = getColRefParts(ae.lexpr ?? {})
      if (cr) {
        const field = cr.tableAlias ? `${cr.tableAlias}.${cr.colName}` : cr.colName
        const op = kind === 'AEXPR_NOT_BETWEEN' ? 'notBetween' : 'between'
        const listNode = nk('List', ae.rexpr ?? {})
        const items = listNode?.items ?? []
        const lo = items[0] ? getConstValue(items[0]) : ''
        const hi = items[1] ? getConstValue(items[1]) : ''
        return makeRule(field, op, `${lo},${hi}`)
      }
    }

    // LIKE / ILIKE
    if (kind === 'AEXPR_LIKE' || kind === 'AEXPR_ILIKE') {
      const cr = getColRefParts(ae.lexpr ?? {})
      if (cr) {
        const field = cr.tableAlias ? `${cr.tableAlias}.${cr.colName}` : cr.colName
        return makeRule(field, 'contains', getConstValue(ae.rexpr ?? {}))
      }
    }

    // Regular binary operator (AEXPR_OP): =, !=, <, >, <=, >=, <@, @>, &&, >>, <<, etc.
    if (kind === 'AEXPR_OP' && ae.lexpr) {
      const op = getOpName(ae.name ?? [])

      // Check for Grafana macro sentinel in rexpr (A_Const string value)
      const constVal = nk('A_Const', ae.rexpr ?? {})
      if (constVal?.sval !== undefined) {
        const sentinelOp = SENTINEL_TO_OPERATOR[constVal.sval.sval ?? '']
        if (sentinelOp) {
          const cr = getColRefParts(ae.lexpr)
          if (cr) {
            const field = cr.tableAlias ? `${cr.tableAlias}.${cr.colName}` : cr.colName
            return makeRule(field, sentinelOp, '')
          }
        }
      }

      // Map to our operator set
      const mappedOp = OPERATOR_MAP[op]
      const leftCr = getColRefParts(ae.lexpr)

      if (mappedOp && leftCr) {
        const field = leftCr.tableAlias ? `${leftCr.tableAlias}.${leftCr.colName}` : leftCr.colName

        // For range operators, rexpr might be a ColumnRef or function call, not just a literal
        const rexprCr = getColRefParts(ae.rexpr ?? {})
        if (rexprCr) {
          const value = rexprCr.tableAlias ? `${rexprCr.tableAlias}.${rexprCr.colName}` : rexprCr.colName
          return makeRule(field, mappedOp, value)
        }

        // rexpr is a literal value
        const value = getConstValue(ae.rexpr ?? {})
        return makeRule(field, mappedOp, value)
      }
    }

    // Fallback: store as raw expression
    const raw = stringifyNode(node)
    warnings.push(`Complex WHERE condition stored as raw expression: "${raw.slice(0, 80)}${raw.length > 80 ? '...' : ''}"`)
    return makeRule('__raw__', '=', `__RAW__:${raw}`)
  }

  // Anything else (function call in WHERE, etc.)
  const raw = stringifyNode(node)
  warnings.push(`Unsupported WHERE expression stored as raw: "${raw.slice(0, 80)}${raw.length > 80 ? '...' : ''}"`)
  return makeRule('__raw__', '=', `__RAW__:${raw}`)
}

// ── GROUP BY extraction ────────────────────────────────────────────────────

function extractGroupBy(
  groupClause: PgNode[] | null | undefined,
  aliasMap: Map<string, TableInstance>
): ColumnRef[] {
  if (!groupClause) return []
  return (groupClause ?? []).flatMap((node) => {
    const cr = getColRefParts(node)
    if (!cr) return []
    const tableAlias = cr.tableAlias ?? inferTableAlias(cr.colName, aliasMap) ?? ''
    return [{ tableAlias, columnName: cr.colName }]
  })
}

// ── ORDER BY extraction ────────────────────────────────────────────────────

function extractOrderBy(
  sortClause: PgNode[] | null | undefined,
  aliasMap: Map<string, TableInstance>
): OrderByItem[] {
  if (!sortClause) return []
  return (sortClause ?? []).flatMap((item) => {
    const sb = nk('SortBy', item)
    if (!sb) return []
    const cr = getColRefParts(sb.node ?? {})
    if (!cr) return []
    const tableAlias = cr.tableAlias ?? inferTableAlias(cr.colName, aliasMap) ?? ''
    const direction = (sb.sortby_dir === 'SORTBY_DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC'
    return [{ tableAlias, columnName: cr.colName, direction }]
  })
}

// ── LIMIT / OFFSET extraction ──────────────────────────────────────────────

function extractLimitOffset(
  limitCount: PgNode | null | undefined,
  limitOffset: PgNode | null | undefined
): { limit: number | null; offset: number | null } {
  const limit = limitCount ? Number(getConstValue(limitCount)) || null : null
  const offset = limitOffset ? Number(getConstValue(limitOffset)) || null : null
  return { limit, offset }
}

// ── Text-level WITH clause splitter ───────────────────────────────────────
//
// Used to extract original (pre-preprocessing) CTE body texts for storage
// in CTEDef.rawSql and for text-level recursive CTE splitting.

interface CteEntry {
  name: string
  body: string  // text between the outer parens of AS (...)
}

interface WithClauseSplit {
  cteEntries: CteEntry[]
  mainQuery: string
}

/** Skip whitespace and SQL comments (-- and block comments). Returns new index. */
function skipWhitespaceAndComments(sql: string, i: number): number {
  while (i < sql.length) {
    // Whitespace
    if (/\s/.test(sql[i])) { i++; continue }
    // Line comment
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    // Block comment
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      continue
    }
    break
  }
  return i
}

/** Read a keyword (alphanumeric + _) starting at i. Returns { word, end } or null. */
function readWord(sql: string, i: number): { word: string; end: number } | null {
  if (i >= sql.length || !/[a-zA-Z_]/.test(sql[i])) return null
  let j = i
  while (j < sql.length && /\w/.test(sql[j])) j++
  return { word: sql.slice(i, j), end: j }
}

/**
 * Split a SQL string at WITH clause boundaries. Returns the CTE entries
 * (name + body text) and the main query text after all CTEs. Returns null
 * if the SQL has no WITH clause.
 *
 * The state machine tracks:
 * - Parenthesis depth (to find CTE body boundaries)
 * - Single-quoted string state
 * - Double-quoted identifier state
 * - Line and block comment state
 */
export function splitWithClause(sql: string): WithClauseSplit | null {
  let i = skipWhitespaceAndComments(sql, 0)

  // Expect WITH keyword
  const kw = readWord(sql, i)
  if (!kw || kw.word.toUpperCase() !== 'WITH') return null
  i = kw.end
  i = skipWhitespaceAndComments(sql, i)

  // Skip optional RECURSIVE
  const rec = readWord(sql, i)
  if (rec && rec.word.toUpperCase() === 'RECURSIVE') {
    i = rec.end
    i = skipWhitespaceAndComments(sql, i)
  }

  const cteEntries: CteEntry[] = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Read CTE name (possibly double-quoted)
    let cteName: string
    if (sql[i] === '"') {
      // Quoted identifier
      const start = i + 1
      i++
      while (i < sql.length && sql[i] !== '"') {
        if (sql[i] === '\\') i++ // skip escape
        i++
      }
      cteName = sql.slice(start, i)
      i++ // skip closing "
    } else {
      const w = readWord(sql, i)
      if (!w) break
      cteName = w.word
      i = w.end
    }

    i = skipWhitespaceAndComments(sql, i)

    // Optional column list before AS: (col1, col2)
    if (sql[i] === '(') {
      // Skip the column list
      let depth = 1
      i++
      while (i < sql.length && depth > 0) {
        if (sql[i] === '(') depth++
        else if (sql[i] === ')') depth--
        i++
      }
      i = skipWhitespaceAndComments(sql, i)
    }

    // Expect AS
    const asKw = readWord(sql, i)
    if (!asKw || asKw.word.toUpperCase() !== 'AS') break
    i = asKw.end
    i = skipWhitespaceAndComments(sql, i)

    // Optional MATERIALIZED / NOT MATERIALIZED
    const matKw = readWord(sql, i)
    if (matKw && matKw.word.toUpperCase() === 'NOT') {
      i = matKw.end
      i = skipWhitespaceAndComments(sql, i)
      const mKw = readWord(sql, i)
      if (mKw && mKw.word.toUpperCase() === 'MATERIALIZED') {
        i = mKw.end
        i = skipWhitespaceAndComments(sql, i)
      }
    } else if (matKw && matKw.word.toUpperCase() === 'MATERIALIZED') {
      i = matKw.end
      i = skipWhitespaceAndComments(sql, i)
    }

    // Expect ( — CTE body starts here
    if (sql[i] !== '(') break
    const bodyStart = i + 1

    // Find the matching ) with full quote/comment awareness
    let depth = 1
    let j = bodyStart
    while (j < sql.length && depth > 0) {
      const ch = sql[j]
      if (ch === '\'') {
        // Single-quoted string
        j++
        while (j < sql.length && sql[j] !== '\'') {
          if (sql[j] === '\\') j++
          j++
        }
        j++ // closing '
      } else if (ch === '"') {
        // Double-quoted identifier
        j++
        while (j < sql.length && sql[j] !== '"') j++
        j++ // closing "
      } else if (ch === '-' && sql[j + 1] === '-') {
        // Line comment
        while (j < sql.length && sql[j] !== '\n') j++
      } else if (ch === '/' && sql[j + 1] === '*') {
        // Block comment
        j += 2
        while (j < sql.length && !(sql[j] === '*' && sql[j + 1] === '/')) j++
        j += 2
      } else if (ch === '(') {
        depth++
        j++
      } else if (ch === ')') {
        depth--
        if (depth > 0) j++
      } else {
        j++
      }
    }

    const bodyText = sql.slice(bodyStart, j).trim()
    cteEntries.push({ name: cteName, body: bodyText })
    i = j + 1  // skip the closing )

    i = skipWhitespaceAndComments(sql, i)

    // Comma → more CTEs; otherwise → main query starts
    if (sql[i] === ',') {
      i++
      i = skipWhitespaceAndComments(sql, i)
      // Skip optional RECURSIVE keyword between CTEs (non-standard but defensive)
      const nextRec = readWord(sql, i)
      if (nextRec && nextRec.word.toUpperCase() === 'RECURSIVE') {
        i = nextRec.end
        i = skipWhitespaceAndComments(sql, i)
      }
    } else {
      break
    }
  }

  if (cteEntries.length === 0) return null

  return {
    cteEntries,
    mainQuery: sql.slice(i).trim(),
  }
}

/**
 * Split a recursive CTE body at the top-level UNION ALL.
 * Returns { anchor, recursive } or null if no UNION ALL found at depth 0.
 */
function splitRecursiveCte(body: string): { anchor: string; recursive: string } | null {
  let i = 0
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  while (i < body.length) {
    const ch = body[i]

    if (inSingleQuote) {
      if (ch === '\'' && body[i - 1] !== '\\') inSingleQuote = false
      i++; continue
    }
    if (inDoubleQuote) {
      if (ch === '"') inDoubleQuote = false
      i++; continue
    }

    if (ch === '\'') { inSingleQuote = true; i++; continue }
    if (ch === '"') { inDoubleQuote = true; i++; continue }
    if (ch === '(') { depth++; i++; continue }
    if (ch === ')') { depth--; i++; continue }

    // Look for UNION ALL at depth 0
    if (depth === 0) {
      const upper = body.slice(i).toUpperCase()
      if (upper.startsWith('UNION ALL')) {
        return {
          anchor: body.slice(0, i).trim(),
          recursive: body.slice(i + 'UNION ALL'.length).trim(),
        }
      }
      if (upper.startsWith('UNION')) {
        // UNION without ALL — also a recursion boundary
        return {
          anchor: body.slice(0, i).trim(),
          recursive: body.slice(i + 'UNION'.length).trim(),
        }
      }
    }
    i++
  }
  return null
}

// ── Output column inference for raw-SQL CTEs ──────────────────────────────

/**
 * Heuristic extraction of column aliases from a CTE body SELECT statement.
 * Used to populate outputColumns for raw-SQL CTEDefs so other CTEs/the main
 * query can reference them.
 */
function inferOutputColumns(selectSql: string): CteOutputColumn[] {
  // Find SELECT keyword
  const selectMatch = selectSql.match(/\bSELECT\b/i)
  if (!selectMatch) return []
  const afterSelect = selectSql.slice(selectMatch.index! + 6)

  // Find the first FROM at depth 0
  let depth = 0
  let inSQ = false
  let inDQ = false
  let fromIdx = -1
  for (let i = 0; i < afterSelect.length; i++) {
    const ch = afterSelect[i]
    if (inSQ) { if (ch === '\'' && afterSelect[i-1] !== '\\') inSQ = false; continue }
    if (inDQ) { if (ch === '"') inDQ = false; continue }
    if (ch === '\'') { inSQ = true; continue }
    if (ch === '"') { inDQ = true; continue }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (depth === 0 && afterSelect.slice(i).match(/^FROM\b/i)) {
      fromIdx = i; break
    }
  }

  const selectList = fromIdx >= 0 ? afterSelect.slice(0, fromIdx) : afterSelect

  // Split by comma at depth 0
  const expressions: string[] = []
  let current = ''
  depth = 0
  for (const ch of selectList) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      expressions.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) expressions.push(current.trim())

  // Extract alias from each expression
  const columns: CteOutputColumn[] = []
  for (const expr of expressions) {
    // AS alias (case-insensitive, last occurrence at depth 0)
    const asMatch = expr.match(/\bAS\s+("([^"]+)"|([a-zA-Z_]\w*))\s*$/i)
    if (asMatch) {
      const name = asMatch[2] ?? asMatch[3] ?? ''
      if (name) { columns.push({ name, pgType: 'text' }); continue }
    }
    // Plain column ref: [table.]column
    const colMatch = expr.match(/(?:\w+\.)?(\w+)\s*$/)
    if (colMatch) {
      columns.push({ name: colMatch[1], pgType: 'text' })
    }
  }
  return columns
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
 * Extract CTEs from a WithClause, reconstructing each into visual QueryState mode.
 * Processes in declaration order so each CTE can reference earlier ones via cteMap.
 *
 * - Non-recursive CTEs: fully parsed into nested QueryState (visual mode).
 * - Recursive CTEs (UNION ALL): guided mode with anchorSql + recursiveStepSql,
 *   extracted via text-level splitting of the original CTE body.
 */
async function extractCtes(
  withClause: PgNode | null | undefined,
  originalCteTexts: Map<string, string>,
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[],
  warnings: string[]
): Promise<{ ctes: CTEDef[]; cteMap: Map<string, CTEDef> }> {
  if (!withClause) return { ctes: [], cteMap: new Map() }

  const ctes: CTEDef[] = []
  const cteMap = new Map<string, CTEDef>()

  const cteNodes: PgNode[] = withClause.ctes ?? []

  for (const cteNode of cteNodes) {
    const cte = nk('CommonTableExpr', cteNode)
    if (!cte) continue

    const name: string = cte.ctename ?? 'cte'
    const cteId = crypto.randomUUID()
    const isRecursive: boolean = Boolean(cte.cterecursive)

    if (isRecursive) {
      // Guided mode: use text-level splitting to get anchor and recursive SQL
      const originalBody = originalCteTexts.get(name) ?? originalCteTexts.get(name.toLowerCase())
      let anchorSql = ''
      let recursiveStepSql = ''

      if (originalBody) {
        const split = splitRecursiveCte(originalBody)
        if (split) {
          anchorSql = restoreSentinelsInSql(split.anchor)
          recursiveStepSql = restoreSentinelsInSql(split.recursive)
        } else {
          anchorSql = restoreSentinelsInSql(originalBody)
          warnings.push(`Recursive CTE "${name}": could not split anchor from recursive step — using full body as anchor.`)
        }
      } else {
        warnings.push(`Recursive CTE "${name}": original body text unavailable.`)
      }

      // Derive output columns by parsing the anchor AST
      let outputColumns: CteOutputColumn[] = []
      const cteQuery = cte.ctequery
      if (cteQuery) {
        const cteSelectStmt = nk('SelectStmt', cteQuery)
        if (cteSelectStmt) {
          // For UNION ALL, larg is the anchor.
          // Note: larg/rarg are already unwrapped SelectStmt data — no nk() wrapper needed.
          const anchorAst = cteSelectStmt.larg ? cteSelectStmt.larg : cteSelectStmt
          if (anchorAst) {
            const anchorQs = parseSelectAst(anchorAst, appTables, appColumns, schemas, cteMap, [], true)
            outputColumns = deriveOutputColumns(anchorQs)
          }
        }
      }
      if (outputColumns.length === 0 && originalBody) {
        outputColumns = inferOutputColumns(anchorSql || originalBody)
      }

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
      const cteQuery = cte.ctequery
      const cteSelectStmt = cteQuery ? nk('SelectStmt', cteQuery) : null

      if (!cteSelectStmt) {
        // Non-SELECT CTE (unlikely) — store as raw
        const originalBody = originalCteTexts.get(name) ?? originalCteTexts.get(name.toLowerCase()) ?? ''
        const cteDef: CTEDef = {
          id: cteId,
          name,
          recursive: false,
          queryState: emptyQueryState(),
          rawSql: originalBody,
          outputColumns: inferOutputColumns(originalBody),
        }
        ctes.push(cteDef)
        cteMap.set(name.toLowerCase(), cteDef)
        continue
      }

      const cteWarnings: string[] = []
      const innerQs = parseSelectAst(cteSelectStmt, appTables, appColumns, schemas, cteMap, cteWarnings, true)
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

// ── Core SELECT AST → QueryState pipeline ─────────────────────────────────

/** Walk to the tail of a unionQuery chain and append a new branch. */
function appendUnionBranch(qs: QueryState, operator: UnionOperator, branch: QueryState): void {
  let current = qs
  while (current.unionQuery) current = current.unionQuery.queryState
  current.unionQuery = { operator, queryState: branch } as UnionBranch
}

function parseSelectAst(
  selectStmt: PgNode,
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[],
  cteMap: Map<string, CTEDef>,
  warnings: string[],
  isSubquery: boolean
): QueryState {
  // ── Set operations (UNION / INTERSECT / EXCEPT) ──────────────────────────
  // For set ops, pgsql-parser puts the per-SELECT data in larg/rarg, not on
  // the outer node. ORDER BY / LIMIT / OFFSET are on the outer node.
  if (selectStmt.op && selectStmt.op !== 'SETOP_NONE') {
    // larg/rarg are already unwrapped SelectStmt data objects — no { SelectStmt: ... } wrapper.
    const largStmt = selectStmt.larg && Object.keys(selectStmt.larg).length > 0 ? selectStmt.larg : null
    const rargStmt = selectStmt.rarg && Object.keys(selectStmt.rarg).length > 0 ? selectStmt.rarg : null

    // Recurse into both branches (handles 3+ chained UNIONs naturally)
    const largQs = largStmt
      ? parseSelectAst(largStmt, appTables, appColumns, schemas, cteMap, warnings, isSubquery)
      : { ...emptyQueryState(), isSubquery }
    const rargQs = rargStmt
      ? parseSelectAst(rargStmt, appTables, appColumns, schemas, cteMap, warnings, isSubquery)
      : { ...emptyQueryState(), isSubquery }

    // Map set operation type
    const isAll = Boolean(selectStmt.all)
    const op = String(selectStmt.op)
    let operator: UnionOperator = isAll ? 'UNION ALL' : 'UNION'
    if (op === 'SETOP_INTERSECT') operator = isAll ? 'INTERSECT ALL' : 'INTERSECT'
    if (op === 'SETOP_EXCEPT')    operator = isAll ? 'EXCEPT ALL'    : 'EXCEPT'

    // Append rarg to the tail of larg's union chain
    appendUnionBranch(largQs, operator, rargQs)

    // Apply ORDER BY / LIMIT / OFFSET from the outer (UNION) node
    const { limit, offset } = extractLimitOffset(selectStmt.limitCount, selectStmt.limitOffset)
    if (limit  !== null) largQs.limit  = limit
    if (offset !== null) largQs.offset = offset
    const outerAliasMap = new Map(largQs.tables.map((t) => [t.alias, t]))
    const outerOrderBy = extractOrderBy(selectStmt.sortClause, outerAliasMap)
    if (outerOrderBy.length > 0) largQs.orderBy = outerOrderBy

    return largQs
  }

  // ── Normal single SELECT ─────────────────────────────────────────────────
  const fromClause: PgNode[] = selectStmt.fromClause ?? []

  const { instances, aliasMap, warnings: tableWarnings } = extractTables(
    fromClause, appTables, appColumns, schemas, cteMap
  )
  warnings.push(...tableWarnings)

  const joins = extractJoins(fromClause, aliasMap, warnings)
  const selectedColumns = extractSelectedColumns(selectStmt.targetList ?? [], aliasMap, warnings)
  const where = extractFilterGroup(selectStmt.whereClause, warnings)
  const groupBy = extractGroupBy(selectStmt.groupClause, aliasMap)
  const having = extractFilterGroup(selectStmt.havingClause, warnings)
  const orderBy = extractOrderBy(selectStmt.sortClause, aliasMap)
  const { limit, offset } = extractLimitOffset(selectStmt.limitCount, selectStmt.limitOffset)
  const distinct = Array.isArray(selectStmt.distinctClause) && selectStmt.distinctClause.length > 0

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

// ── Per-CTE fallback ───────────────────────────────────────────────────────

/**
 * Called when the full-query parse fails. Splits the query text and attempts
 * to parse each CTE independently, falling back to raw SQL for any that fail.
 */
async function parseSqlWithPerCteStrategy(
  originalSql: string,
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[],
  warnings: string[]
): Promise<ImportResult> {
  const split = splitWithClause(originalSql)
  if (!split) {
    // No WITH clause — return raw SQL fallback
    return { queryState: emptyQueryState(), warnings, rawSql: originalSql }
  }

  const ctes: CTEDef[] = []
  const cteMap = new Map<string, CTEDef>()
  let mainQsFailed = false

  for (const entry of split.cteEntries) {
    const cteId = crypto.randomUUID()
    const { masked } = preprocessGrafanaMacros(entry.body)

    let parsedVisually = false
    try {
      const result = await parse(masked)
      const selectStmt = result?.stmts?.[0]?.stmt?.SelectStmt
      if (selectStmt) {
        const cteWarnings: string[] = []
        const innerQs = parseSelectAst(selectStmt, appTables, appColumns, schemas, cteMap, cteWarnings, true)
        warnings.push(...cteWarnings.map((w) => `CTE "${entry.name}": ${w}`))
        const outputColumns = deriveOutputColumns(innerQs)
        const cteDef: CTEDef = {
          id: cteId,
          name: entry.name,
          recursive: false,
          queryState: innerQs,
          outputColumns,
        }
        ctes.push(cteDef)
        cteMap.set(entry.name.toLowerCase(), cteDef)
        parsedVisually = true
      }
    } catch { /* fall through to raw SQL */ }

    if (!parsedVisually) {
      const cteDef: CTEDef = {
        id: cteId,
        name: entry.name,
        recursive: false,
        queryState: emptyQueryState(),
        rawSql: entry.body,
        outputColumns: inferOutputColumns(entry.body),
      }
      ctes.push(cteDef)
      cteMap.set(entry.name.toLowerCase(), cteDef)
      warnings.push(`CTE "${entry.name}" uses unsupported syntax — imported as raw SQL.`)
    }
  }

  // Try to parse the main query
  let mainQs: QueryState = emptyQueryState()
  const { masked: mainMasked } = preprocessGrafanaMacros(split.mainQuery)
  try {
    const result = await parse(mainMasked)
    const selectStmt = result?.stmts?.[0]?.stmt?.SelectStmt
    if (selectStmt) {
      mainQs = parseSelectAst(selectStmt, appTables, appColumns, schemas, cteMap, warnings, false)
    } else {
      mainQsFailed = true
    }
  } catch {
    mainQsFailed = true
    warnings.push('Main SELECT could not be parsed — canvas will be empty but CTEs have been imported.')
  }

  const queryState: QueryState = { ...mainQs, ctes }
  const { panelType, timeColumn } = detectGrafanaIntent(queryState)
  if (timeColumn) {
    queryState.timeColumn = timeColumn
    queryState.grafanaPanelType = panelType
  } else if (panelType) {
    queryState.grafanaPanelType = panelType
  }

  return {
    queryState,
    warnings,
    detectedPanelType: panelType,
    rawSql: mainQsFailed ? originalSql : undefined,
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Parse a SELECT SQL string into a QueryState.
 * Returns the best-effort QueryState along with any warnings.
 */
export async function parseSqlToQueryState(
  sql: string,
  appTables: AppTable[],
  appColumns: Record<number, AppColumn[]>,
  schemas: AppSchema[]
): Promise<ImportResult> {
  const warnings: string[] = []

  const originalSql = sql.trim()
  const { masked, hasMacros } = preprocessGrafanaMacros(originalSql)
  if (hasMacros) {
    warnings.push('Grafana macros detected ($__timeFilter, $__interval, etc.) — preserved as-is in the imported query.')
  }

  // Extract original CTE body texts (for rawSql storage and recursive CTE splitting)
  const splitResult = splitWithClause(originalSql)
  const originalCteTexts = new Map<string, string>()
  if (splitResult) {
    for (const entry of splitResult.cteEntries) {
      originalCteTexts.set(entry.name, entry.body)
      originalCteTexts.set(entry.name.toLowerCase(), entry.body)
    }
  }

  let rawAst: PgNode
  try {
    rawAst = await parse(masked)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`Full query parse failed (${msg}) — attempting per-CTE fallback.`)
    return parseSqlWithPerCteStrategy(originalSql, appTables, appColumns, schemas, warnings)
  }

  // pgsql-parser returns { version, stmts: [{ stmt: Node }] }
  const selectStmt: PgNode | null = rawAst?.stmts?.[0]?.stmt?.SelectStmt ?? null

  if (!selectStmt) {
    warnings.push('Only SELECT statements can be imported.')
    return { queryState: emptyQueryState(), warnings }
  }

  // CTEs — processed in declaration order
  const { ctes, cteMap } = await extractCtes(
    selectStmt.withClause ?? null,
    originalCteTexts,
    appTables,
    appColumns,
    schemas,
    warnings
  )

  // Main query — uses cteMap so CTE virtual tables are resolved
  const mainQs = parseSelectAst(selectStmt, appTables, appColumns, schemas, cteMap, warnings, false)

  const queryState: QueryState = { ...mainQs, ctes }

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
