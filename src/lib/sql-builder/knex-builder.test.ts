import { describe, it, expect } from 'vitest'
import { buildSql } from './index'
import {
  emptyQueryState,
  emptyFilterGroup,
  type QueryState,
  type TableInstance,
  type SelectedColumn,
  type JoinDef,
  type ColumnRef,
  type FilterGroup,
  type FilterRule,
  type OrderByItem,
  type WindowFunctionDef,
  type CTEDef,
} from '@/types/query'

// ---------------------------------------------------------------------------
// Factories — every test derives expected SQL from the same variables
// used to build the input state.  Nothing is duplicated.
// ---------------------------------------------------------------------------

function makeTable(overrides: Partial<TableInstance> & { alias: string; tableName: string }): TableInstance {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tableId: overrides.tableId ?? 1,
    tableName: overrides.tableName,
    schemaName: overrides.schemaName ?? 'public',
    alias: overrides.alias,
    position: overrides.position ?? { x: 0, y: 0 },
    columns: overrides.columns ?? [],
  }
}

function makeCol(
  tableAlias: string,
  columnName: string,
  overrides?: Partial<SelectedColumn>
): SelectedColumn {
  return {
    id: crypto.randomUUID(),
    tableAlias,
    columnName,
    ...overrides,
  }
}

function makeRule(field: string, operator: string, value: FilterRule['value']): FilterRule {
  return { id: crypto.randomUUID(), field, operator, value }
}

function makeGroup(combinator: 'AND' | 'OR', rules: FilterGroup['rules']): FilterGroup {
  return { id: crypto.randomUUID(), combinator, rules }
}

function makeState(overrides: Partial<QueryState>): QueryState {
  return { ...emptyQueryState(), ...overrides }
}

// Normalise whitespace so formatting differences don't cause failures
function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Empty / trivial
// ---------------------------------------------------------------------------

describe('empty state', () => {
  it('returns a comment when no tables are on the canvas', () => {
    const sql = buildSql(emptyQueryState())
    expect(sql).toMatch(/--/)
  })
})

// ---------------------------------------------------------------------------
// SELECT list
// ---------------------------------------------------------------------------

describe('SELECT list', () => {
  it('emits SELECT * when no columns are selected', () => {
    const alias = 'orders'
    const tableName = 'orders'
    const state = makeState({ tables: [makeTable({ alias, tableName })] })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('SELECT *')
  })

  it('emits selected columns with qualified names', () => {
    const alias = 'o'
    const col1 = 'id'
    const col2 = 'total'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col1), makeCol(alias, col2)],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col1}`)
    expect(sql).toContain(`${alias}.${col2}`)
  })

  it('applies a column alias when set', () => {
    const alias = 'o'
    const col = 'created_at'
    const outputAlias = 'order_date'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col, { alias: outputAlias })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`AS ${outputAlias}`)
  })

  it('emits expression as-is when SelectedColumn.expression is set', () => {
    const tableAlias = 'o'
    const expression = `COUNT(${tableAlias}.id)`
    const outputAlias = 'order_count'
    const state = makeState({
      tables: [makeTable({ alias: tableAlias, tableName: 'orders' })],
      selectedColumns: [makeCol(tableAlias, 'id', { expression, alias: outputAlias })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${expression} AS ${outputAlias}`)
  })

  it('emits DISTINCT when distinct flag is set', () => {
    const alias = 'u'
    const col = 'email'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'users' })],
      selectedColumns: [makeCol(alias, col)],
      distinct: true,
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('SELECT DISTINCT')
  })
})

// ---------------------------------------------------------------------------
// Identifier quoting
// ---------------------------------------------------------------------------

describe('identifier quoting', () => {
  it('quotes reserved-word column names', () => {
    const alias = 'src'
    const reservedCol = 'select'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'events' })],
      selectedColumns: [makeCol(alias, reservedCol)],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}."${reservedCol}"`)
  })

  it('quotes column names containing uppercase letters', () => {
    const alias = 't'
    const mixedCaseCol = 'firstName'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'people' })],
      selectedColumns: [makeCol(alias, mixedCaseCol)],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`"${mixedCaseCol}"`)
  })

  it('does not quote plain lowercase identifiers', () => {
    const alias = 'items'
    const plainCol = 'price'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'items' })],
      selectedColumns: [makeCol(alias, plainCol)],
    })
    const sql = buildSql(state)
    // Should appear unquoted
    expect(sql).toContain(`${alias}.${plainCol}`)
    expect(sql).not.toContain(`"${alias}"`)
    expect(sql).not.toContain(`"${plainCol}"`)
  })
})

// ---------------------------------------------------------------------------
// FROM / schema prefix
// ---------------------------------------------------------------------------

describe('FROM clause', () => {
  it('omits schema prefix when all tables share one schema', () => {
    const schema = 'reporting'
    const tableName = 'sales'
    const alias = 'sales'
    const state = makeState({ tables: [makeTable({ alias, tableName, schemaName: schema })] })
    const sql = normalise(buildSql(state))
    expect(sql).not.toContain(`${schema}.`)
    expect(sql).toContain(`FROM ${tableName}`)
  })

  it('includes schema prefix when tables span multiple schemas', () => {
    const schemaA = 'app'
    const schemaB = 'reporting'
    const tableA = makeTable({ alias: 'u', tableName: 'users', schemaName: schemaA })
    const tableB = makeTable({ alias: 'r', tableName: 'reports', schemaName: schemaB })
    const join: JoinDef = {
      id: crypto.randomUUID(),
      type: 'LEFT',
      leftTableAlias: tableA.alias,
      leftColumn: 'id',
      rightTableAlias: tableB.alias,
      rightColumn: 'user_id',
    }
    const state = makeState({ tables: [tableA, tableB], joins: [join] })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${schemaA}.${tableA.tableName}`)
    expect(sql).toContain(`${schemaB}.${tableB.tableName}`)
  })

  it('emits AS alias when alias differs from table name', () => {
    const tableName = 'order_items'
    const alias = 'oi'
    const state = makeState({ tables: [makeTable({ alias, tableName })] })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`AS ${alias}`)
  })

  it('omits AS alias when alias equals table name', () => {
    const tableName = 'products'
    const state = makeState({ tables: [makeTable({ alias: tableName, tableName })] })
    const sql = normalise(buildSql(state))
    // "AS products" should not appear
    expect(sql).not.toMatch(new RegExp(`AS ${tableName}\\b`))
  })
})

// ---------------------------------------------------------------------------
// JOINs
// ---------------------------------------------------------------------------

describe('JOIN clauses', () => {
  const joinTypes: Array<{ type: JoinDef['type']; keyword: string }> = [
    { type: 'INNER', keyword: 'INNER JOIN' },
    { type: 'LEFT', keyword: 'LEFT JOIN' },
    { type: 'RIGHT', keyword: 'RIGHT JOIN' },
    { type: 'FULL OUTER', keyword: 'FULL OUTER JOIN' },
    { type: 'CROSS', keyword: 'CROSS JOIN' },
  ]

  for (const { type, keyword } of joinTypes) {
    it(`emits ${keyword} for type "${type}"`, () => {
      const leftAlias = 'a'
      const rightAlias = 'b'
      const leftCol = 'id'
      const rightCol = 'a_id'
      const tableA = makeTable({ alias: leftAlias, tableName: 'table_a' })
      const tableB = makeTable({ alias: rightAlias, tableName: 'table_b' })
      const join: JoinDef = {
        id: crypto.randomUUID(),
        type,
        leftTableAlias: leftAlias,
        leftColumn: leftCol,
        rightTableAlias: rightAlias,
        rightColumn: rightCol,
      }
      const state = makeState({ tables: [tableA, tableB], joins: [join] })
      const sql = normalise(buildSql(state))
      expect(sql).toContain(keyword)
      expect(sql).toContain(`${leftAlias}.${leftCol} = ${rightAlias}.${rightCol}`)
    })
  }
})

// ---------------------------------------------------------------------------
// WHERE clause — comparison operators
// ---------------------------------------------------------------------------

describe('WHERE — comparison operators', () => {
  const comparisons: Array<{ operator: string }> = [
    { operator: '=' },
    { operator: '!=' },
    { operator: '<' },
    { operator: '<=' },
    { operator: '>' },
    { operator: '>=' },
  ]

  for (const { operator } of comparisons) {
    it(`generates correct SQL for operator "${operator}" with a numeric value`, () => {
      const alias = 'o'
      const col = 'total'
      const value = 100
      const field = `${alias}.${col}`
      const state = makeState({
        tables: [makeTable({ alias, tableName: 'orders' })],
        where: makeGroup('AND', [makeRule(field, operator, value)]),
      })
      const sql = normalise(buildSql(state))
      expect(sql).toContain(`WHERE`)
      expect(sql).toContain(`${alias}.${col} ${operator} ${value}`)
    })

    it(`generates correct SQL for operator "${operator}" with a string value`, () => {
      const alias = 'u'
      const col = 'status'
      const value = 'active'
      const field = `${alias}.${col}`
      const state = makeState({
        tables: [makeTable({ alias, tableName: 'users' })],
        where: makeGroup('AND', [makeRule(field, operator, value)]),
      })
      const sql = normalise(buildSql(state))
      expect(sql).toContain(`${alias}.${col} ${operator} '${value}'`)
    })
  }
})

// ---------------------------------------------------------------------------
// WHERE clause — string pattern operators
// ---------------------------------------------------------------------------

describe('WHERE — string pattern operators', () => {
  it('ILIKE %value% for "contains"', () => {
    const alias = 'p'
    const col = 'name'
    const fragment = 'widget'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'products' })],
      where: makeGroup('AND', [makeRule(field, 'contains', fragment)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} ILIKE '%${fragment}%'`)
  })

  it('ILIKE value% for "beginsWith"', () => {
    const alias = 'p'
    const col = 'sku'
    const prefix = 'WGT'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'products' })],
      where: makeGroup('AND', [makeRule(field, 'beginsWith', prefix)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} ILIKE '${prefix}%'`)
  })

  it('ILIKE %value for "endsWith"', () => {
    const alias = 'p'
    const col = 'sku'
    const suffix = '_V2'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'products' })],
      where: makeGroup('AND', [makeRule(field, 'endsWith', suffix)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} ILIKE '%${suffix}'`)
  })

  it('NOT ILIKE for "doesNotContain"', () => {
    const alias = 'p'
    const col = 'description'
    const fragment = 'deprecated'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'products' })],
      where: makeGroup('AND', [makeRule(field, 'doesNotContain', fragment)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} NOT ILIKE '%${fragment}%'`)
  })
})

// ---------------------------------------------------------------------------
// WHERE clause — set and null operators
// ---------------------------------------------------------------------------

describe('WHERE — set and null operators', () => {
  it('IS NULL', () => {
    const alias = 'u'
    const col = 'deleted_at'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'users' })],
      where: makeGroup('AND', [makeRule(field, 'null', null)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} IS NULL`)
  })

  it('IS NOT NULL', () => {
    const alias = 'u'
    const col = 'email'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'users' })],
      where: makeGroup('AND', [makeRule(field, 'notNull', null)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} IS NOT NULL`)
  })

  it('IN with a comma-separated value list', () => {
    const alias = 'o'
    const col = 'status'
    const values = ['pending', 'processing', 'shipped']
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(field, 'in', values.join(','))]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} IN`)
    for (const v of values) {
      expect(sql).toContain(`'${v}'`)
    }
  })

  it('NOT IN with a comma-separated value list', () => {
    const alias = 'o'
    const col = 'status'
    const values = ['cancelled', 'refunded']
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(field, 'notIn', values.join(','))]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} NOT IN`)
    for (const v of values) {
      expect(sql).toContain(`'${v}'`)
    }
  })

  it('BETWEEN with two numeric bounds', () => {
    const alias = 'o'
    const col = 'total'
    const lower = 50
    const upper = 200
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(field, 'between', `${lower},${upper}`)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} BETWEEN ${lower} AND ${upper}`)
  })
})

// ---------------------------------------------------------------------------
// WHERE — boolean combinators
// ---------------------------------------------------------------------------

describe('WHERE — boolean combinators', () => {
  it('joins multiple rules in one group with AND', () => {
    const alias = 'u'
    const col1 = 'age'
    const col2 = 'active'
    const val1 = 18
    const val2 = true
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'users' })],
      where: makeGroup('AND', [
        makeRule(`${alias}.${col1}`, '>=', val1),
        makeRule(`${alias}.${col2}`, '=', val2),
      ]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col1} >= ${val1}`)
    expect(sql).toContain(' AND ')
    expect(sql).toContain(`${alias}.${col2} = TRUE`)
  })

  it('joins rules with OR when combinator is OR', () => {
    const alias = 'o'
    const col = 'status'
    const val1 = 'pending'
    const val2 = 'processing'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('OR', [
        makeRule(`${alias}.${col}`, '=', val1),
        makeRule(`${alias}.${col}`, '=', val2),
      ]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(' OR ')
  })

  it('wraps nested groups in parentheses', () => {
    const alias = 'o'
    const colA = 'region'
    const colB = 'status'
    const colC = 'priority'
    const valA = 'west'
    const valB = 'open'
    const valC = 'high'
    const inner = makeGroup('OR', [
      makeRule(`${alias}.${colB}`, '=', valB),
      makeRule(`${alias}.${colC}`, '=', valC),
    ])
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(`${alias}.${colA}`, '=', valA), inner]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('(')
    expect(sql).toContain(' OR ')
    expect(sql).toContain(' AND ')
  })
})

// ---------------------------------------------------------------------------
// WHERE — Grafana macros
// ---------------------------------------------------------------------------

describe('WHERE — Grafana macros', () => {
  const macros: Array<{ operator: string; macro: string }> = [
    { operator: '$__timeFilter', macro: '$__timeFilter' },
    { operator: '$__unixEpochFilter', macro: '$__unixEpochFilter' },
    { operator: '$__unixEpochNanoFilter', macro: '$__unixEpochNanoFilter' },
  ]

  for (const { operator, macro } of macros) {
    it(`wraps column in ${macro}(col)`, () => {
      const alias = 'metrics'
      // 'time' and 'timestamp' are PG reserved words; use a plain name to avoid quoting
      const col = 'event_ts'
      const field = `${alias}.${col}`
      const state = makeState({
        tables: [makeTable({ alias, tableName: 'metrics' })],
        where: makeGroup('AND', [makeRule(field, operator, null)]),
      })
      const sql = normalise(buildSql(state))
      expect(sql).toContain(`${macro}(${alias}.${col})`)
    })
  }
})

// ---------------------------------------------------------------------------
// GROUP BY
// ---------------------------------------------------------------------------

describe('GROUP BY', () => {
  it('emits GROUP BY with all specified columns', () => {
    const alias = 'o'
    const groupCols: ColumnRef[] = [
      { tableAlias: alias, columnName: 'region' },
      { tableAlias: alias, columnName: 'status' },
    ]
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, 'total')],
      groupBy: groupCols,
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('GROUP BY')
    for (const g of groupCols) {
      expect(sql).toContain(`${g.tableAlias}.${g.columnName}`)
    }
  })

  it('omits GROUP BY when groupBy is empty', () => {
    const alias = 'o'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
    })
    const sql = buildSql(state)
    expect(sql).not.toContain('GROUP BY')
  })
})

// ---------------------------------------------------------------------------
// ORDER BY
// ---------------------------------------------------------------------------

describe('ORDER BY', () => {
  it('emits ORDER BY col ASC', () => {
    const alias = 'p'
    const col = 'price'
    const direction = 'ASC'
    const item: OrderByItem = { tableAlias: alias, columnName: col, direction }
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'products' })],
      orderBy: [item],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`ORDER BY ${alias}.${col} ${direction}`)
  })

  it('emits ORDER BY col DESC NULLS LAST', () => {
    const alias = 'p'
    const col = 'rating'
    const direction = 'DESC'
    const nulls = 'NULLS LAST'
    const item: OrderByItem = { tableAlias: alias, columnName: col, direction, nulls }
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'products' })],
      orderBy: [item],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} ${direction} ${nulls}`)
  })
})

// ---------------------------------------------------------------------------
// LIMIT / OFFSET
// ---------------------------------------------------------------------------

describe('LIMIT and OFFSET', () => {
  it('emits LIMIT when set', () => {
    const limitValue = 25
    const state = makeState({
      tables: [makeTable({ alias: 't', tableName: 'things' })],
      limit: limitValue,
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`LIMIT ${limitValue}`)
  })

  it('emits OFFSET when set', () => {
    const offsetValue = 50
    const state = makeState({
      tables: [makeTable({ alias: 't', tableName: 'things' })],
      offset: offsetValue,
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`OFFSET ${offsetValue}`)
  })

  it('omits LIMIT and OFFSET when both are null', () => {
    const state = makeState({ tables: [makeTable({ alias: 't', tableName: 'things' })] })
    const sql = buildSql(state)
    expect(sql).not.toContain('LIMIT')
    expect(sql).not.toContain('OFFSET')
  })
})

// ---------------------------------------------------------------------------
// Window functions
// ---------------------------------------------------------------------------

describe('Window functions', () => {
  it('emits a basic ROW_NUMBER() window function with OVER (PARTITION BY ... ORDER BY ...)', () => {
    const alias = 'o'
    const partCol = 'region'
    const orderCol = 'created_at'
    const outputAlias = 'row_num'
    const wf: WindowFunctionDef = {
      id: crypto.randomUUID(),
      fn: 'ROW_NUMBER',
      partitionBy: [{ tableAlias: alias, columnName: partCol }],
      orderBy: [{ tableAlias: alias, columnName: orderCol, direction: 'ASC' }],
      alias: outputAlias,
    }
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      windowFunctions: [wf],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('ROW_NUMBER()')
    expect(sql).toContain(`PARTITION BY ${alias}.${partCol}`)
    expect(sql).toContain(`ORDER BY ${alias}.${orderCol}`)
    expect(sql).toContain(`AS ${outputAlias}`)
  })

  it('emits a SUM window function with an expression argument', () => {
    const alias = 's'
    const valueCol = 'amount'
    const partCol = 'category'
    const outputAlias = 'running_total'
    const wf: WindowFunctionDef = {
      id: crypto.randomUUID(),
      fn: 'SUM',
      expression: `${alias}.${valueCol}`,
      partitionBy: [{ tableAlias: alias, columnName: partCol }],
      orderBy: [],
      alias: outputAlias,
    }
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'sales' })],
      windowFunctions: [wf],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`SUM(${alias}.${valueCol})`)
    expect(sql).toContain(`AS ${outputAlias}`)
  })
})

// ---------------------------------------------------------------------------
// CTEs
// ---------------------------------------------------------------------------

describe('CTEs', () => {
  it('emits WITH <name> AS (...) before the main SELECT', () => {
    const cteName = 'recent_orders'
    const outerAlias = 'ro'
    const innerAlias = 'o'
    const innerTable = makeTable({ alias: innerAlias, tableName: 'orders' })
    const innerState: QueryState = makeState({
      tables: [innerTable],
      isSubquery: true,
    })
    const cte: CTEDef = {
      id: crypto.randomUUID(),
      name: cteName,
      recursive: false,
      queryState: innerState,
    }
    const state = makeState({
      tables: [makeTable({ alias: outerAlias, tableName: cteName })],
      ctes: [cte],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`WITH`)
    expect(sql).toContain(`${cteName} AS (`)
  })

  it('emits WITH RECURSIVE when any CTE is marked recursive', () => {
    const cteName = 'hierarchy'
    const alias = 'h'
    const innerTable = makeTable({ alias, tableName: 'categories' })
    const cte: CTEDef = {
      id: crypto.randomUUID(),
      name: cteName,
      recursive: true,
      queryState: makeState({ tables: [innerTable], isSubquery: true }),
    }
    const state = makeState({
      tables: [makeTable({ alias, tableName: cteName })],
      ctes: [cte],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('WITH RECURSIVE')
  })
})

// ---------------------------------------------------------------------------
// JSONB path extraction
// ---------------------------------------------------------------------------

describe('JSONB — WHERE path extraction via ::jsonb:: sentinel', () => {
  // Note: sql-formatter pads JSONB operators with spaces, so `->>` becomes ` ->> `
  // and `#>>` becomes ` #>> ` in the formatted output. Assertions reflect this.

  it('single-segment path emits ->>', () => {
    const alias = 'f'
    const col = 'payload'
    const key = 'machine_type'
    const expectedValue = 'lathe'
    const field = `${alias}::jsonb::${col}::${key}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'forms' })],
      where: makeGroup('AND', [makeRule(field, '=', expectedValue)]),
    })
    const sql = normalise(buildSql(state))
    // Formatter inserts spaces around ->>
    expect(sql).toContain(`${alias}.${col} ->> '${key}'`)
    expect(sql).toContain(`'${expectedValue}'`)
  })

  it('multi-segment path emits #>>', () => {
    const alias = 'f'
    const col = 'payload'
    const segments = ['config', 'network', 'ip_address']
    const dotPath = segments.join('.')
    const expectedValue = '10.0.0.1'
    const field = `${alias}::jsonb::${col}::${dotPath}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'forms' })],
      where: makeGroup('AND', [makeRule(field, '=', expectedValue)]),
    })
    const sql = normalise(buildSql(state))
    // Formatter inserts spaces around #>>
    expect(sql).toContain(`${alias}.${col} #>> '{${segments.join(',')}}'`)
    expect(sql).toContain(`'${expectedValue}'`)
  })

  it('two-segment path emits #>>', () => {
    const alias = 'r'
    const col = 'data'
    const segments = ['config', 'mode']
    const dotPath = segments.join('.')
    const expectedValue = 'auto'
    const field = `${alias}::jsonb::${col}::${dotPath}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'records' })],
      where: makeGroup('AND', [makeRule(field, '=', expectedValue)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} #>> '{${segments.join(',')}}'`)
  })

  it('JSONB path with numeric comparison operators', () => {
    const alias = 'm'
    const col = 'metrics'
    const key = 'rpm'
    const threshold = 3000
    const field = `${alias}::jsonb::${col}::${key}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'machines' })],
      where: makeGroup('AND', [makeRule(field, '>', threshold)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} ->> '${key}' > ${threshold}`)
  })

  it('JSONB path with reserved-word column name is quoted', () => {
    const alias = 'e'
    // 'order' is a PG reserved word — the column name must be quoted
    const col = 'order'
    const key = 'type'
    const val = 'bulk'
    const field = `${alias}::jsonb::${col}::${key}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'events' })],
      where: makeGroup('AND', [makeRule(field, '=', val)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`"${col}"`)
    // Formatter adds spaces around ->>
    expect(sql).toContain(` ->> '${key}'`)
  })
})

describe('JSONB — SELECT expression path (pre-built via SelectedColumn.expression)', () => {
  // The expression is passed through as-is to the SQL builder, then the overall SQL
  // goes through sql-formatter which pads operators like ->> and #>> with spaces.
  // Assertions check for the structural parts rather than the exact compact string.

  it('emits single-segment JSONB path and alias in SELECT', () => {
    const alias = 'f'
    const col = 'payload'
    const key = 'machine_name'
    const expression = `${alias}.${col}->>'${key}'`
    const outputAlias = key
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'forms' })],
      selectedColumns: [makeCol(alias, col, { expression, alias: outputAlias })],
    })
    const sql = normalise(buildSql(state))
    // The column reference and key must both appear; formatter may space the operator
    expect(sql).toContain(`${alias}.${col}`)
    expect(sql).toContain(`'${key}'`)
    expect(sql).toContain(`AS ${outputAlias}`)
  })

  it('emits multi-segment #>> path in SELECT', () => {
    const alias = 'f'
    const col = 'payload'
    const segments = ['config', 'speed']
    const expression = `${alias}.${col}#>>'{${segments.join(',')}}'`
    const outputAlias = segments[segments.length - 1]
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'forms' })],
      selectedColumns: [makeCol(alias, col, { expression, alias: outputAlias })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col}`)
    expect(sql).toContain(`'{${segments.join(',')}}'`)
    expect(sql).toContain(`AS ${outputAlias}`)
  })

  it('emits ::cast suffix for typed JSONB extraction', () => {
    const alias = 'f'
    const col = 'payload'
    const key = 'rpm'
    const cast = 'numeric'
    const expression = `(${alias}.${col}->>'${key}')::${cast}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'forms' })],
      selectedColumns: [makeCol(alias, col, { expression, alias: key })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`::${cast}`)
    expect(sql).toContain(`'${key}'`)
  })
})

// ---------------------------------------------------------------------------
// Value quoting edge cases
// ---------------------------------------------------------------------------

describe('value quoting', () => {
  it('emits numeric strings unquoted', () => {
    const alias = 'o'
    const col = 'total'
    const numericString = '42.5'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(field, '=', numericString)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} = ${numericString}`)
    expect(sql).not.toContain(`'${numericString}'`)
  })

  it('escapes single quotes inside string values', () => {
    const alias = 'p'
    const col = 'name'
    const valueWithQuote = "O'Brien"
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'people' })],
      where: makeGroup('AND', [makeRule(field, '=', valueWithQuote)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain("O''Brien")
  })

  it('emits TRUE for boolean true value', () => {
    const alias = 'u'
    const col = 'verified'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'users' })],
      where: makeGroup('AND', [makeRule(field, '=', true)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('TRUE')
  })

  it('emits FALSE for boolean false value', () => {
    const alias = 'u'
    const col = 'verified'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'users' })],
      where: makeGroup('AND', [makeRule(field, '=', false)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('FALSE')
  })

  it('emits NULL for null value', () => {
    const alias = 'o'
    const col = 'discount'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(field, '=', null)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('NULL')
  })
})

// ---------------------------------------------------------------------------
// SQL generation does not throw on error — returns comment
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('returns an error comment rather than throwing on invalid state', () => {
    // Force an error by passing a completely broken state object
    const broken = { tables: null } as unknown as QueryState
    expect(() => buildSql(broken)).not.toThrow()
    const sql = buildSql(broken)
    expect(sql).toMatch(/--/)
  })
})
