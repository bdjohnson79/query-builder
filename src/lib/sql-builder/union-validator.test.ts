import { describe, it, expect } from 'vitest'
import { validateUnion } from './union-validator'
import {
  emptyQueryState,
  type QueryState,
  type TableInstance,
  type SelectedColumn,
  type UnionBranch,
  type ColumnMeta,
} from '@/types/query'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTable(
  alias: string,
  tableName: string,
  columns: ColumnMeta[] = []
): TableInstance {
  return {
    id: crypto.randomUUID(),
    tableId: 1,
    tableName,
    schemaName: 'public',
    alias,
    position: { x: 0, y: 0 },
    columns,
  }
}

function makeColumnMeta(name: string, pgType: string): ColumnMeta {
  return { id: Math.random(), name, pgType, isNullable: true, isPrimaryKey: false }
}

function makeSelectedCol(tableAlias: string, columnName: string, overrides?: Partial<SelectedColumn>): SelectedColumn {
  return { id: crypto.randomUUID(), tableAlias, columnName, ...overrides }
}

function makeQueryState(
  tableAlias: string,
  tableName: string,
  colDefs: Array<{ name: string; pgType: string }>,
  selectedNames: string[],
  selectedOverrides?: Array<Partial<SelectedColumn>>
): QueryState {
  const columns = colDefs.map(({ name, pgType }) => makeColumnMeta(name, pgType))
  const table = makeTable(tableAlias, tableName, columns)
  const selectedColumns = selectedNames.map((name, i) =>
    makeSelectedCol(tableAlias, name, selectedOverrides?.[i])
  )
  return { ...emptyQueryState(), tables: [table], selectedColumns }
}

// ---------------------------------------------------------------------------
// Raw SQL branch — skips all validation
// ---------------------------------------------------------------------------

describe('validateUnion — raw SQL branch', () => {
  it('returns valid with no warnings when unionBranch.rawSql is set', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'id', pgType: 'integer' }], ['id'])
    const branch: UnionBranch = {
      operator: 'UNION ALL',
      queryState: emptyQueryState(),
      rawSql: 'SELECT 1 AS id',
    }
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns valid even if rawSql is an empty string (truthy check is on != null)', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'id', pgType: 'integer' }], ['id'])
    const branch: UnionBranch = {
      operator: 'UNION ALL',
      queryState: emptyQueryState(),
      rawSql: '',
    }
    // rawSql !== null/undefined so validation is skipped entirely
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// No columns — no_columns warning
// ---------------------------------------------------------------------------

describe('validateUnion — no_columns warning', () => {
  it('returns invalid with no_columns warning when main has no selected columns', () => {
    const main: QueryState = { ...emptyQueryState(), tables: [makeTable('a', 'table_a')] }
    const branchState = makeQueryState('b', 'table_b', [{ name: 'id', pgType: 'integer' }], ['id'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(false)
    expect(result.warnings.some(w => w.type === 'no_columns')).toBe(true)
  })

  it('returns invalid with no_columns warning when branch has no selected columns', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'id', pgType: 'integer' }], ['id'])
    const branchState: QueryState = { ...emptyQueryState(), tables: [makeTable('b', 'table_b')] }
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(false)
    expect(result.warnings.some(w => w.type === 'no_columns')).toBe(true)
  })

  it('returns invalid with no_columns when both sides have no columns', () => {
    const main: QueryState = emptyQueryState()
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: emptyQueryState() }
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(false)
    expect(result.warnings[0].type).toBe('no_columns')
  })
})

// ---------------------------------------------------------------------------
// Column count mismatch
// ---------------------------------------------------------------------------

describe('validateUnion — column count mismatch', () => {
  it('emits count_mismatch warning when branch has fewer columns than main', () => {
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'id', pgType: 'integer' }, { name: 'name', pgType: 'text' }],
      ['id', 'name']
    )
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'id', pgType: 'integer' }],
      ['id']
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'count_mismatch')).toBe(true)
  })

  it('emits count_mismatch warning when branch has more columns than main', () => {
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'id', pgType: 'integer' }],
      ['id']
    )
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'id', pgType: 'integer' }, { name: 'extra', pgType: 'text' }],
      ['id', 'extra']
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'count_mismatch')).toBe(true)
  })

  it('count_mismatch message contains both column counts', () => {
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'id', pgType: 'integer' }, { name: 'name', pgType: 'text' }],
      ['id', 'name']
    )
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'id', pgType: 'integer' }],
      ['id']
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    const w = result.warnings.find(w => w.type === 'count_mismatch')!
    expect(w.message).toContain('2')
    expect(w.message).toContain('1')
  })

  it('still checks type compatibility for overlapping columns when count differs', () => {
    // Main has 2 cols (integer, text), branch has 1 col (text for position 0 which is integer in main)
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'id', pgType: 'integer' }, { name: 'name', pgType: 'text' }],
      ['id', 'name']
    )
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'label', pgType: 'text' }],
      ['label']
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    // Should have count_mismatch AND type_mismatch
    expect(result.warnings.some(w => w.type === 'count_mismatch')).toBe(true)
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Type mismatch
// ---------------------------------------------------------------------------

describe('validateUnion — type_mismatch warning', () => {
  it('emits type_mismatch when numeric column is paired with text column', () => {
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'amount', pgType: 'numeric' }],
      ['amount']
    )
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'label', pgType: 'text' }],
      ['label']
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    const w = result.warnings.find(w => w.type === 'type_mismatch')!
    expect(w).toBeDefined()
    expect(w.colIndex).toBe(0)
    expect(w.message).toContain('numeric')
    expect(w.message).toContain('text')
  })

  it('emits type_mismatch for boolean vs uuid', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'flag', pgType: 'boolean' }], ['flag'])
    const branchState = makeQueryState('b', 'table_b', [{ name: 'rid', pgType: 'uuid' }], ['rid'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(true)
  })

  it('does not emit type_mismatch for compatible integer and bigint (both numeric)', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'id', pgType: 'integer' }], ['id'])
    const branchState = makeQueryState('b', 'table_b', [{ name: 'id', pgType: 'bigint' }], ['id'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(false)
  })

  it('does not emit type_mismatch for varchar and text (both text)', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'label', pgType: 'varchar' }], ['label'])
    const branchState = makeQueryState('b', 'table_b', [{ name: 'label', pgType: 'text' }], ['label'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(false)
  })

  it('does not emit type_mismatch for timestamp and timestamptz (both datetime)', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'created_at', pgType: 'timestamp' }], ['created_at'])
    const branchState = makeQueryState('b', 'table_b', [{ name: 'ts', pgType: 'timestamptz' }], ['ts'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(false)
  })

  it('does not emit type_mismatch for jsonb vs json (both json)', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'data', pgType: 'jsonb' }], ['data'])
    const branchState = makeQueryState('b', 'table_b', [{ name: 'data', pgType: 'json' }], ['data'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(false)
  })

  it('colIndex is correct for a mismatch at column position 1 (second column)', () => {
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'id', pgType: 'integer' }, { name: 'score', pgType: 'numeric' }],
      ['id', 'score']
    )
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'id', pgType: 'integer' }, { name: 'label', pgType: 'text' }],
      ['id', 'label']
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    const w = result.warnings.find(w => w.type === 'type_mismatch')!
    expect(w.colIndex).toBe(1)
  })

  it('skips type check when main column has a custom expression', () => {
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'id', pgType: 'integer' }],
      ['id'],
      [{ expression: 'COUNT(a.id)' }]  // expression-based — type unknown
    )
    const branchState = makeQueryState('b', 'table_b', [{ name: 'label', pgType: 'text' }], ['label'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    // Expression columns are skipped — no type_mismatch should be emitted
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(false)
  })

  it('skips type check when branch column has a custom expression', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'id', pgType: 'integer' }], ['id'])
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'id', pgType: 'integer' }],
      ['id'],
      [{ expression: 'COALESCE(b.id, 0)' }]
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(false)
  })

  it('skips type check when column pgType is not found in the table column map', () => {
    // Column is selected but not present in the table's column metadata
    const main = makeQueryState(
      'a', 'table_a',
      [],  // no column metadata
      []
    )
    // Manually set selectedColumns pointing to a col that has no metadata entry
    main.selectedColumns = [makeSelectedCol('a', 'ghost_col')]
    main.tables[0].columns = []

    const branchState = makeQueryState('b', 'table_b', [{ name: 'id', pgType: 'integer' }], ['id'])
    branchState.selectedColumns = [makeSelectedCol('b', 'id')]

    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    // Missing metadata means skip — no type_mismatch
    expect(result.warnings.some(w => w.type === 'type_mismatch')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Happy path — valid unions
// ---------------------------------------------------------------------------

describe('validateUnion — valid cases', () => {
  it('returns valid with no warnings for matching column count and compatible types', () => {
    const main = makeQueryState(
      'a', 'table_a',
      [{ name: 'id', pgType: 'integer' }, { name: 'name', pgType: 'text' }],
      ['id', 'name']
    )
    const branchState = makeQueryState(
      'b', 'table_b',
      [{ name: 'id', pgType: 'bigint' }, { name: 'label', pgType: 'varchar' }],
      ['id', 'label']
    )
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns valid for a single uuid column on both sides', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'rid', pgType: 'uuid' }], ['rid'])
    const branchState = makeQueryState('b', 'table_b', [{ name: 'rid', pgType: 'uuid' }], ['rid'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(true)
  })

  it('returns valid when both sides use unknown/custom types (falls back to "other" category)', () => {
    const main = makeQueryState('a', 'table_a', [{ name: 'val', pgType: 'custom_type' }], ['val'])
    const branchState = makeQueryState('b', 'table_b', [{ name: 'val', pgType: 'custom_type' }], ['val'])
    const branch: UnionBranch = { operator: 'UNION ALL', queryState: branchState }
    const result = validateUnion(main, branch)
    expect(result.valid).toBe(true)
  })
})
