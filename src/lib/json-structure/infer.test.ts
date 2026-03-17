import { describe, it, expect } from 'vitest'
import { inferJsonStructure, flattenToPathOptions, buildJsonbPathExpr } from './infer'
import type { JsonField } from '@/types/json-structure'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findField(fields: JsonField[], key: string): JsonField | undefined {
  return fields.find((f) => f.key === key)
}

// ---------------------------------------------------------------------------
// inferJsonStructure
// ---------------------------------------------------------------------------

describe('inferJsonStructure', () => {
  it('returns empty array for non-object inputs', () => {
    const inputs: unknown[] = [null, undefined, 42, 'string', true, [], [1, 2, 3]]
    for (const input of inputs) {
      expect(inferJsonStructure(input)).toEqual([])
    }
  })

  it('infers string fields', () => {
    const key = 'machine_type'
    const value = 'lathe'
    const fields = inferJsonStructure({ [key]: value })
    const field = findField(fields, key)
    expect(field).toBeDefined()
    expect(field?.type).toBe('string')
  })

  it('infers number fields', () => {
    const key = 'rpm'
    const value = 3000
    const fields = inferJsonStructure({ [key]: value })
    const field = findField(fields, key)
    expect(field?.type).toBe('number')
  })

  it('infers boolean fields', () => {
    const key = 'is_active'
    const value = true
    const fields = inferJsonStructure({ [key]: value })
    const field = findField(fields, key)
    expect(field?.type).toBe('boolean')
  })

  it('infers object fields with children', () => {
    const parentKey = 'config'
    const childKey = 'timeout'
    const childValue = 30
    const fields = inferJsonStructure({ [parentKey]: { [childKey]: childValue } })
    const parent = findField(fields, parentKey)
    expect(parent?.type).toBe('object')
    expect(parent?.children).toBeDefined()
    const child = findField(parent!.children!, childKey)
    expect(child?.type).toBe('number')
  })

  it('infers array field from an array value', () => {
    const key = 'tags'
    const value = ['alpha', 'beta']
    const fields = inferJsonStructure({ [key]: value })
    const field = findField(fields, key)
    expect(field?.type).toBe('array')
  })

  it('infers itemSchema from array of objects by sampling first element', () => {
    const key = 'sensors'
    const itemKey = 'sensor_id'
    const itemValue = 'S-001'
    const value = [{ [itemKey]: itemValue }, { [itemKey]: 'S-002' }]
    const fields = inferJsonStructure({ [key]: value })
    const field = findField(fields, key)
    expect(field?.type).toBe('array')
    expect(field?.itemSchema).toBeDefined()
    const itemField = findField(field!.itemSchema!, itemKey)
    expect(itemField?.type).toBe('string')
  })

  it('returns itemSchema as undefined for array of primitives', () => {
    const key = 'codes'
    const fields = inferJsonStructure({ [key]: [1, 2, 3] })
    const field = findField(fields, key)
    expect(field?.type).toBe('array')
    expect(field?.itemSchema).toBeUndefined()
  })

  it('treats null field values as string type', () => {
    const key = 'optional_field'
    const fields = inferJsonStructure({ [key]: null })
    const field = findField(fields, key)
    expect(field?.type).toBe('string')
  })

  it('preserves all top-level key names', () => {
    const keys = ['alpha', 'beta', 'gamma']
    const obj = Object.fromEntries(keys.map((k) => [k, k]))
    const fields = inferJsonStructure(obj)
    for (const key of keys) {
      expect(findField(fields, key)).toBeDefined()
    }
  })

  it('handles deeply nested objects', () => {
    const level1 = 'network'
    const level2 = 'wifi'
    const level3 = 'ssid'
    const deepValue = 'corp-net'
    const fields = inferJsonStructure({ [level1]: { [level2]: { [level3]: deepValue } } })
    const l1 = findField(fields, level1)
    expect(l1?.type).toBe('object')
    const l2 = findField(l1!.children!, level2)
    expect(l2?.type).toBe('object')
    const l3 = findField(l2!.children!, level3)
    expect(l3?.type).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// flattenToPathOptions
// ---------------------------------------------------------------------------

describe('flattenToPathOptions', () => {
  const alias = 'f'
  const col = 'payload'

  it('returns one option per scalar leaf field', () => {
    const key1 = 'machine_name'
    const key2 = 'rpm'
    const fields: JsonField[] = [
      { key: key1, type: 'string' },
      { key: key2, type: 'number' },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    expect(opts).toHaveLength(2)
    expect(opts.map((o) => o.path)).toContain(key1)
    expect(opts.map((o) => o.path)).toContain(key2)
  })

  it('excludes array fields from the output', () => {
    const arrayKey = 'sensors'
    const scalarKey = 'name'
    const fields: JsonField[] = [
      { key: arrayKey, type: 'array' },
      { key: scalarKey, type: 'string' },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    expect(opts.map((o) => o.path)).not.toContain(arrayKey)
    expect(opts.map((o) => o.path)).toContain(scalarKey)
  })

  it('produces dot-separated path for nested fields', () => {
    const parentKey = 'config'
    const childKey = 'mode'
    const fields: JsonField[] = [
      { key: parentKey, type: 'object', children: [{ key: childKey, type: 'string' }] },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    const dotPath = `${parentKey}.${childKey}`
    const opt = opts.find((o) => o.path === dotPath)
    expect(opt).toBeDefined()
  })

  it('produces correct > separated label for nested fields', () => {
    const parentKey = 'network'
    const childKey = 'ip'
    const fields: JsonField[] = [
      { key: parentKey, type: 'object', children: [{ key: childKey, type: 'string' }] },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    const opt = opts.find((o) => o.path === `${parentKey}.${childKey}`)
    expect(opt?.label).toBe(`${parentKey} > ${childKey}`)
  })

  it('produces single-segment expression with ->>', () => {
    const key = 'machine_type'
    const fields: JsonField[] = [{ key, type: 'string' }]
    const opts = flattenToPathOptions(fields, alias, col)
    const opt = opts.find((o) => o.path === key)
    expect(opt?.pgExpression).toContain(`->>'${key}'`)
    expect(opt?.pgExpression).toContain(`${alias}.${col}`)
  })

  it('produces multi-segment expression with #>>', () => {
    const parentKey = 'config'
    const childKey = 'speed'
    const fields: JsonField[] = [
      { key: parentKey, type: 'object', children: [{ key: childKey, type: 'number' }] },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    const opt = opts.find((o) => o.path === `${parentKey}.${childKey}`)
    expect(opt?.pgExpression).toContain(`#>>`)
    expect(opt?.pgExpression).toContain(`{${parentKey},${childKey}}`)
  })

  it('applies pgCast from JsonField to the expression', () => {
    const key = 'rpm'
    const cast = 'numeric'
    const fields: JsonField[] = [{ key, type: 'number', pgCast: cast }]
    const opts = flattenToPathOptions(fields, alias, col)
    const opt = opts.find((o) => o.path === key)
    expect(opt?.pgExpression).toContain(`::${cast}`)
    expect(opt?.pgExpression).toMatch(/^\(.*\)::/)
  })

  it('does not apply cast when pgCast is absent', () => {
    const key = 'label'
    const fields: JsonField[] = [{ key, type: 'string' }]
    const opts = flattenToPathOptions(fields, alias, col)
    const opt = opts.find((o) => o.path === key)
    expect(opt?.pgExpression).not.toContain('::')
  })

  it('reports correct valueType for each leaf', () => {
    const fields: JsonField[] = [
      { key: 'a', type: 'string' },
      { key: 'b', type: 'number' },
      { key: 'c', type: 'boolean' },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    for (const f of fields) {
      const opt = opts.find((o) => o.path === f.key)
      expect(opt?.valueType).toBe(f.type)
    }
  })

  it('handles object with no children as a leaf', () => {
    const key = 'metadata'
    const fields: JsonField[] = [{ key, type: 'object' }]
    const opts = flattenToPathOptions(fields, alias, col)
    // object with no children should be treated as leaf
    expect(opts.find((o) => o.path === key)).toBeDefined()
  })

  it('returns empty array for all-array fields', () => {
    const fields: JsonField[] = [
      { key: 'events', type: 'array' },
      { key: 'tags', type: 'array' },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    expect(opts).toHaveLength(0)
  })

  it('flattens three levels of nesting', () => {
    const l1 = 'network'
    const l2 = 'wifi'
    const l3 = 'ssid'
    const fields: JsonField[] = [
      {
        key: l1,
        type: 'object',
        children: [
          { key: l2, type: 'object', children: [{ key: l3, type: 'string' }] },
        ],
      },
    ]
    const opts = flattenToPathOptions(fields, alias, col)
    const dotPath = `${l1}.${l2}.${l3}`
    const opt = opts.find((o) => o.path === dotPath)
    expect(opt).toBeDefined()
    expect(opt?.pgExpression).toContain('#>>')
    expect(opt?.pgExpression).toContain(`{${l1},${l2},${l3}}`)
  })
})

// ---------------------------------------------------------------------------
// buildJsonbPathExpr
// ---------------------------------------------------------------------------

describe('buildJsonbPathExpr', () => {
  it('single segment uses ->>', () => {
    const alias = 'f'
    const col = 'data'
    const key = 'machine_type'
    const expr = buildJsonbPathExpr(alias, col, key)
    expect(expr).toBe(`${alias}.${col}->>'${key}'`)
  })

  it('two segments use #>>', () => {
    const alias = 'f'
    const col = 'data'
    const segments = ['config', 'mode']
    const expr = buildJsonbPathExpr(alias, col, segments.join('.'))
    expect(expr).toBe(`${alias}.${col}#>>'{${segments.join(',')}}'`)
  })

  it('three or more segments use #>>', () => {
    const alias = 'r'
    const col = 'payload'
    const segments = ['a', 'b', 'c', 'd']
    const expr = buildJsonbPathExpr(alias, col, segments.join('.'))
    expect(expr).toBe(`${alias}.${col}#>>'{${segments.join(',')}}'`)
  })

  it('wraps expression in cast parentheses when pgCast is supplied', () => {
    const alias = 'f'
    const col = 'data'
    const key = 'rpm'
    const cast = 'numeric'
    const expr = buildJsonbPathExpr(alias, col, key, cast)
    const inner = `${alias}.${col}->>'${key}'`
    expect(expr).toBe(`(${inner})::${cast}`)
  })

  it('does not wrap when pgCast is undefined', () => {
    const alias = 'f'
    const col = 'data'
    const key = 'label'
    const expr = buildJsonbPathExpr(alias, col, key, undefined)
    expect(expr).not.toContain('(')
    expect(expr).not.toContain(')')
    expect(expr).not.toContain('::')
  })

  it('quotes table alias that contains uppercase letters', () => {
    const alias = 'MyTable'
    const col = 'data'
    const key = 'field'
    const expr = buildJsonbPathExpr(alias, col, key)
    expect(expr).toContain(`"${alias}"`)
  })

  it('quotes column name that contains uppercase letters', () => {
    const alias = 'tbl'
    const col = 'configData'
    const key = 'field'
    const expr = buildJsonbPathExpr(alias, col, key)
    expect(expr).toContain(`"${col}"`)
  })

  it('does not quote plain lowercase identifiers', () => {
    const alias = 'tbl'
    const col = 'payload'
    const key = 'value'
    const expr = buildJsonbPathExpr(alias, col, key)
    expect(expr).not.toContain('"')
  })

  it('path key segments are single-quoted string literals not pg-identifier-quoted', () => {
    // Segment names must use 'key' notation inside ->> or #>>, NOT "key" notation
    const alias = 'f'
    const col = 'data'
    const key = 'Select'  // uppercase — must NOT be identifier-quoted
    const expr = buildJsonbPathExpr(alias, col, key)
    // The key in the arrow operator is a literal, not an identifier
    expect(expr).toContain(`->>'${key}'`)
    // The key should not appear inside double-quotes
    expect(expr).not.toContain(`"${key}"`)
  })
})
