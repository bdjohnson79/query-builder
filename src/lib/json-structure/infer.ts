// Pure utilities for JSON structure inference and path flattening

import type { JsonField, JsonFieldType, JsonbPathOption } from '@/types/json-structure'

/**
 * Walk a parsed JSON value and produce a JsonField tree.
 * Arrays are sampled (first element) to derive itemSchema.
 */
export function inferJsonStructure(value: unknown): JsonField[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  return inferObject(value as Record<string, unknown>)
}

function inferObject(obj: Record<string, unknown>): JsonField[] {
  return Object.entries(obj).map(([key, val]) => inferField(key, val))
}

function inferField(key: string, val: unknown): JsonField {
  if (val === null || val === undefined) {
    return { key, type: 'string' }
  }
  if (typeof val === 'boolean') {
    return { key, type: 'boolean' }
  }
  if (typeof val === 'number') {
    return { key, type: 'number' }
  }
  if (typeof val === 'string') {
    return { key, type: 'string' }
  }
  if (Array.isArray(val)) {
    const sample = val.find((v) => v !== null && v !== undefined)
    if (sample !== undefined && typeof sample === 'object' && !Array.isArray(sample)) {
      return { key, type: 'array', itemSchema: inferObject(sample as Record<string, unknown>) }
    }
    return { key, type: 'array' }
  }
  if (typeof val === 'object') {
    return { key, type: 'object', children: inferObject(val as Record<string, unknown>) }
  }
  return { key, type: 'string' }
}

function detectType(val: unknown): JsonFieldType {
  if (val === null || val === undefined) return 'string'
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'number') return 'number'
  if (typeof val === 'string') return 'string'
  if (Array.isArray(val)) return 'array'
  if (typeof val === 'object') return 'object'
  return 'string'
}

// Keep detectType available for potential future use
void detectType

/**
 * Depth-first walk of a JsonField tree, producing a flat list of
 * selectable (non-array) leaf paths with their PostgreSQL expressions.
 */
export function flattenToPathOptions(
  fields: JsonField[],
  tableAlias: string,
  columnName: string
): JsonbPathOption[] {
  const results: JsonbPathOption[] = []
  walkFields(fields, [], tableAlias, columnName, results)
  return results
}

function walkFields(
  fields: JsonField[],
  parentSegments: string[],
  tableAlias: string,
  columnName: string,
  out: JsonbPathOption[]
): void {
  for (const field of fields) {
    const segments = [...parentSegments, field.key]

    if (field.type === 'array') {
      // Arrays are not selectable as leaf paths in v1 — skip subtree
      continue
    }

    if (field.type === 'object' && field.children && field.children.length > 0) {
      // Recurse into object children
      walkFields(field.children, segments, tableAlias, columnName, out)
    } else {
      // Leaf node (string, number, boolean, or object with no children)
      const path = segments.join('.')
      const label = segments.join(' > ')
      const pgExpression = buildJsonbPathExpr(tableAlias, columnName, path, field.pgCast)
      out.push({ label, path, pgExpression, valueType: field.type })
    }
  }
}

/**
 * Build a PostgreSQL JSONB extraction expression.
 * Single-segment paths use ->>, multi-segment paths use #>>.
 * Optional pgCast appends a type cast like ::numeric.
 */
export function buildJsonbPathExpr(
  tableAlias: string,
  columnName: string,
  dotPath: string,
  pgCast?: string
): string {
  const segments = dotPath.split('.')
  // Quote identifiers: table alias and column name need PG quoting
  const quotedAlias = needsQuoting(tableAlias) ? `"${tableAlias}"` : tableAlias
  const quotedCol = needsQuoting(columnName) ? `"${columnName}"` : columnName
  const base = `${quotedAlias}.${quotedCol}`

  let expr: string
  if (segments.length === 1) {
    expr = `${base}->>'${segments[0]}'`
  } else {
    const pgPathLiteral = `'{${segments.join(',')}}'`
    expr = `${base}#>>${pgPathLiteral}`
  }

  return pgCast ? `(${expr})::${pgCast}` : expr
}

function needsQuoting(name: string): boolean {
  return !/^[a-z_][a-z0-9_]*$/.test(name)
}

/**
 * Suggest a SQL alias from a dot-path string.
 * Strips a leading 'data.' prefix (common in form_event/form_data structures),
 * then replaces dots and non-identifier characters with underscores.
 *
 * Examples:
 *   'sku.label'          → 'sku_label'
 *   'data.category.value' → 'category_value'
 *   'shift'              → 'shift'
 */
export function suggestAlias(dotPath: string): string {
  const cleaned = dotPath.replace(/^data\./, '')
  return cleaned.replace(/\./g, '_').replace(/[^a-z0-9_]/gi, '_').toLowerCase()
}
