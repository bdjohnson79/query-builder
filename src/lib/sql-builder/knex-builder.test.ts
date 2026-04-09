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
// WHERE — timeLookback and column references
// ---------------------------------------------------------------------------

describe('WHERE — timeLookback and column references', () => {
  it('emits timeLookback BETWEEN expression', () => {
    const alias = 'e'
    const col = 'evt_time'
    const field = `${alias}.${col}`
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'event' })],
      where: makeGroup('AND', [makeRule(field, 'timeLookback', '30d')]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`${alias}.${col} BETWEEN $__timeFrom()::timestamp - INTERVAL '30d' AND $__timeFrom()::timestamp`)
  })

  it('emits column reference value unquoted for correlated conditions', () => {
    const state = makeState({
      tables: [makeTable({ alias: 'e', tableName: 'event' })],
      where: makeGroup('AND', [makeRule('e.tag', '=', 't2.name')]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('e.tag = t2.name')
    expect(sql).not.toContain("'t2.name'")
  })
})

// ---------------------------------------------------------------------------
// LATERAL join
// ---------------------------------------------------------------------------

describe('LATERAL join', () => {
  it('emits LEFT JOIN LATERAL with subquery and ON clause', () => {
    const lateralSub: QueryState = {
      ...emptyQueryState(),
      tables: [makeTable({ alias: 'inner_e', tableName: 'event' })],
      selectedColumns: [makeCol('inner_e', 'value')],
      where: makeGroup('AND', [makeRule('inner_e.tag', '=', 't2.name')]),
      orderBy: [{ tableAlias: 'inner_e', columnName: 'ts', direction: 'DESC' }],
      limit: 1,
    }
    const lateralJoin: JoinDef = {
      id: 'j1',
      type: 'LATERAL',
      leftTableAlias: '',
      leftColumn: '',
      rightTableAlias: 'e2',
      rightColumn: '',
      lateralAlias: 'e2',
      onExpression: 'TRUE',
      lateralSubquery: lateralSub,
    }
    const state = makeState({
      tables: [makeTable({ alias: 't2', tableName: 'tags' })],
      selectedColumns: [makeCol('t2', 'description'), makeCol('e2', 'value')],
      joins: [lateralJoin],
      where: makeGroup('AND', [makeRule('e2.value', 'notNull', '')]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('LEFT JOIN LATERAL')
    expect(sql).toContain('AS e2 ON TRUE')
    expect(sql).toContain('inner_e.tag = t2.name')
    expect(sql).toContain('e2.value IS NOT NULL')
  })
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
      outputColumns: [],
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
      outputColumns: [],
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

// ---------------------------------------------------------------------------
// Aggregate functions in SELECT
// ---------------------------------------------------------------------------

describe('aggregates in SELECT', () => {
  const simpleAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const

  for (const agg of simpleAggregates) {
    it(`wraps column with ${agg}(...)`, () => {
      const alias = 's'
      const col = 'amount'
      const state = makeState({
        tables: [makeTable({ alias, tableName: 'sales' })],
        selectedColumns: [makeCol(alias, col, { aggregate: agg })],
      })
      const sql = normalise(buildSql(state))
      expect(sql).toContain(`${agg}(${alias}.${col})`)
    })
  }

  it('emits COUNT(DISTINCT col) for COUNT DISTINCT', () => {
    const alias = 'o'
    const col = 'customer_id'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col, { aggregate: 'COUNT DISTINCT' })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`COUNT(DISTINCT ${alias}.${col})`)
  })

  it('emits PERCENTILE_CONT(fraction) WITHIN GROUP (ORDER BY col) for PERCENTILE_CONT', () => {
    const alias = 'o'
    const col = 'response_ms'
    const fraction = '0.95'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col, { aggregate: 'PERCENTILE_CONT', aggregateArg: fraction })],
    })
    const sql = normalise(buildSql(state))
    // sql-formatter inserts a space after '(' in WITHIN GROUP: '( ORDER BY'
    expect(sql).toMatch(new RegExp(`PERCENTILE_CONT\\(${fraction}\\) WITHIN GROUP \\( ORDER BY ${alias}\\.${col}`))
  })

  it('PERCENTILE_CONT defaults to 0.5 when aggregateArg is absent', () => {
    const alias = 'o'
    const col = 'score'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col, { aggregate: 'PERCENTILE_CONT' })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('PERCENTILE_CONT(0.5)')
  })

  it('emits PERCENTILE_DISC(fraction) WITHIN GROUP (ORDER BY col)', () => {
    const alias = 'o'
    const col = 'latency'
    const fraction = '0.99'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col, { aggregate: 'PERCENTILE_DISC', aggregateArg: fraction })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toMatch(new RegExp(`PERCENTILE_DISC\\(${fraction}\\) WITHIN GROUP \\( ORDER BY ${alias}\\.${col}`))
  })

  it('emits STRING_AGG(col, default delimiter) when aggregateArg is absent', () => {
    const alias = 't'
    const col = 'tag_name'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'tags' })],
      selectedColumns: [makeCol(alias, col, { aggregate: 'STRING_AGG' })],
    })
    const sql = normalise(buildSql(state))
    // Default delimiter is ", "
    expect(sql).toContain(`STRING_AGG(${alias}.${col},`)
    expect(sql).toContain("', '")
  })

  it('emits STRING_AGG with a custom delimiter', () => {
    const alias = 't'
    const col = 'tag_name'
    const delim = '|'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'tags' })],
      selectedColumns: [makeCol(alias, col, { aggregate: 'STRING_AGG', aggregateArg: delim })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(`STRING_AGG(${alias}.${col},`)
    expect(sql).toContain(`'${delim}'`)
  })

  it('emits FILTER (WHERE ...) after an aggregate when filterClause is set', () => {
    const alias = 'o'
    const col = 'amount'
    const filterClause = "status = 'completed'"
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col, { aggregate: 'SUM', filterClause })],
    })
    const sql = normalise(buildSql(state))
    // sql-formatter inserts a space after '(': 'FILTER ( WHERE'
    expect(sql).toContain('FILTER (')
    expect(sql).toContain('WHERE')
    expect(sql).toContain(filterClause)
  })

  it('does not emit FILTER when filterClause is set but there is no aggregate', () => {
    const alias = 'o'
    const col = 'amount'
    const filterClause = "status = 'completed'"
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, col, { filterClause })],
    })
    const sql = normalise(buildSql(state))
    expect(sql).not.toContain('FILTER')
  })
})

// ---------------------------------------------------------------------------
// HAVING clause
// ---------------------------------------------------------------------------

describe('HAVING clause', () => {
  it('emits HAVING with a simple aggregate condition', () => {
    const alias = 'o'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, 'customer_id'), makeCol(alias, 'id', { aggregate: 'COUNT' })],
      groupBy: [{ tableAlias: alias, columnName: 'customer_id' }],
      having: makeGroup('AND', [makeRule(`${alias}.id`, '>', 5)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('HAVING')
    expect(sql).toContain(`${alias}.id > 5`)
  })

  it('omits HAVING when having group has no rules', () => {
    const alias = 'o'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
    })
    const sql = buildSql(state)
    expect(sql).not.toContain('HAVING')
  })

  it('HAVING appears after GROUP BY in the emitted SQL', () => {
    const alias = 'o'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, 'region'), makeCol(alias, 'total', { aggregate: 'SUM' })],
      groupBy: [{ tableAlias: alias, columnName: 'region' }],
      having: makeGroup('AND', [makeRule(`${alias}.total`, '>=', 1000)]),
    })
    const sql = normalise(buildSql(state))
    const groupByIdx = sql.indexOf('GROUP BY')
    const havingIdx = sql.indexOf('HAVING')
    expect(groupByIdx).toBeLessThan(havingIdx)
  })
})

// ---------------------------------------------------------------------------
// UNION ALL / UNION
// ---------------------------------------------------------------------------

describe('UNION queries', () => {
  it('emits UNION ALL between the two SELECT branches', () => {
    const aliasA = 'a'
    const aliasB = 'b'
    const branchState = makeState({
      tables: [makeTable({ alias: aliasB, tableName: 'archived_orders' })],
      selectedColumns: [makeCol(aliasB, 'id'), makeCol(aliasB, 'total')],
    })
    const state = makeState({
      tables: [makeTable({ alias: aliasA, tableName: 'orders' })],
      selectedColumns: [makeCol(aliasA, 'id'), makeCol(aliasA, 'total')],
      unionQuery: { operator: 'UNION ALL', queryState: branchState },
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain(`${aliasA}.id`)
    expect(sql).toContain(`${aliasB}.id`)
  })

  it('emits UNION (deduplicated) when operator is UNION', () => {
    const aliasA = 'c'
    const aliasB = 'd'
    const branchState = makeState({
      tables: [makeTable({ alias: aliasB, tableName: 'legacy_customers' })],
      selectedColumns: [makeCol(aliasB, 'email')],
    })
    const state = makeState({
      tables: [makeTable({ alias: aliasA, tableName: 'customers' })],
      selectedColumns: [makeCol(aliasA, 'email')],
      unionQuery: { operator: 'UNION', queryState: branchState },
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(' UNION ')
    expect(sql).not.toContain('UNION ALL')
  })

  it('emits the rawSql branch verbatim when unionQuery.rawSql is set', () => {
    const alias = 'o'
    const rawBranchSql = 'SELECT 1 AS id, 99.99 AS total'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, 'id'), makeCol(alias, 'total')],
      unionQuery: { operator: 'UNION ALL', queryState: emptyQueryState(), rawSql: rawBranchSql },
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain(rawBranchSql)
  })

  it('places ORDER BY / LIMIT / OFFSET after the UNION branch, not inside the first SELECT', () => {
    const alias = 'o'
    const branchAlias = 'a'
    const branchState = makeState({
      tables: [makeTable({ alias: branchAlias, tableName: 'archived_orders' })],
      selectedColumns: [makeCol(branchAlias, 'id')],
    })
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      selectedColumns: [makeCol(alias, 'id')],
      orderBy: [{ tableAlias: alias, columnName: 'id', direction: 'ASC' }],
      limit: 100,
      offset: 0,
      unionQuery: { operator: 'UNION ALL', queryState: branchState },
    })
    const sql = normalise(buildSql(state))
    const unionIdx = sql.indexOf('UNION ALL')
    const orderIdx = sql.indexOf('ORDER BY')
    const limitIdx = sql.indexOf('LIMIT')
    // ORDER BY and LIMIT must appear after UNION ALL
    expect(orderIdx).toBeGreaterThan(unionIdx)
    expect(limitIdx).toBeGreaterThan(unionIdx)
  })
})

// ---------------------------------------------------------------------------
// JOIN topology edge cases
// ---------------------------------------------------------------------------

describe('JOIN topology', () => {
  it('ON clause is correct when join arrow is drawn right-to-left (reversed direction)', () => {
    // The right table is listed first in tables[], join goes right→left
    const leftAlias = 'o'
    const rightAlias = 'c'
    const leftCol = 'customer_id'
    const rightCol = 'id'
    const tableO = makeTable({ alias: leftAlias, tableName: 'orders' })
    const tableC = makeTable({ alias: rightAlias, tableName: 'customers' })
    // Join is drawn from customers (c) to orders (o) — reversed from conventional
    const join: JoinDef = {
      id: crypto.randomUUID(),
      type: 'LEFT',
      leftTableAlias: rightAlias,  // c (customers)
      leftColumn: rightCol,        // c.id
      rightTableAlias: leftAlias,  // o (orders)
      rightColumn: leftCol,        // o.customer_id
    }
    // Primary table is orders (o); customers (c) needs to be joined in
    const state = makeState({ tables: [tableO, tableC], joins: [join] })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('LEFT JOIN')
    // ON clause uses table aliases (o, c) — not table names
    expect(sql).toMatch(/c\.id = o\.customer_id|o\.customer_id = c\.id/)
  })

  it('custom onExpression overrides the generated ON clause', () => {
    const leftAlias = 'o'
    const rightAlias = 'c'
    const customOn = 'o.customer_id = c.id AND c.active = TRUE'
    const tableO = makeTable({ alias: leftAlias, tableName: 'orders' })
    const tableC = makeTable({ alias: rightAlias, tableName: 'customers' })
    const join: JoinDef = {
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: leftAlias,
      leftColumn: 'customer_id',
      rightTableAlias: rightAlias,
      rightColumn: 'id',
      onExpression: customOn,
    }
    const state = makeState({ tables: [tableO, tableC], joins: [join] })
    const sql = normalise(buildSql(state))
    // Custom ON condition parts must appear
    expect(sql).toContain('o.customer_id = c.id')
    expect(sql).toContain('c.active = TRUE')
    // The AND combinator within the custom ON must also be present
    expect(sql).toContain('AND')
  })

  it('REFERENCE joins are excluded from SQL entirely', () => {
    const leftAlias = 'a'
    const rightAlias = 'b'
    const tableA = makeTable({ alias: leftAlias, tableName: 'table_a' })
    const tableB = makeTable({ alias: rightAlias, tableName: 'table_b' })
    const refJoin: JoinDef = {
      id: crypto.randomUUID(),
      type: 'REFERENCE',
      leftTableAlias: leftAlias,
      leftColumn: 'id',
      rightTableAlias: rightAlias,
      rightColumn: 'a_id',
    }
    // Only one real table to ensure the REFERENCE is the only join
    const state = makeState({ tables: [tableA, tableB], joins: [refJoin] })
    const sql = normalise(buildSql(state))
    expect(sql).not.toContain('JOIN')
  })

  it('resolves a three-table chain A→B→C regardless of join order in array', () => {
    const tA = makeTable({ alias: 'a', tableName: 'table_a' })
    const tB = makeTable({ alias: 'b', tableName: 'table_b' })
    const tC = makeTable({ alias: 'c', tableName: 'table_c' })
    const joinBC: JoinDef = {
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: 'b',
      leftColumn: 'id',
      rightTableAlias: 'c',
      rightColumn: 'b_id',
    }
    const joinAB: JoinDef = {
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: 'a',
      leftColumn: 'id',
      rightTableAlias: 'b',
      rightColumn: 'a_id',
    }
    // Deliberately put B→C join first (out of topological order)
    const state = makeState({ tables: [tA, tB, tC], joins: [joinBC, joinAB] })
    const sql = normalise(buildSql(state))
    // Both joins must appear
    expect(sql).toContain('a.id = b.a_id')
    expect(sql).toContain('b.id = c.b_id')
    // B must be joined before C (B comes into scope via A→B, then C via B→C)
    const bIdx = sql.indexOf('table_b')
    const cIdx = sql.indexOf('table_c')
    expect(bIdx).toBeLessThan(cIdx)
  })

  it('falls back to emitting disconnected joins when no topological order exists', () => {
    // Two isolated tables with a join between them — neither is connected to the primary table
    const tPrimary = makeTable({ alias: 'p', tableName: 'primary_t' })
    const tX = makeTable({ alias: 'x', tableName: 'x_table' })
    const tY = makeTable({ alias: 'y', tableName: 'y_table' })
    const isolatedJoin: JoinDef = {
      id: crypto.randomUUID(),
      type: 'INNER',
      leftTableAlias: 'x',
      leftColumn: 'id',
      rightTableAlias: 'y',  // fallback emits the right table
      rightColumn: 'x_id',
    }
    const state = makeState({ tables: [tPrimary, tX, tY], joins: [isolatedJoin] })
    const sql = normalise(buildSql(state))
    // SQL must not throw and must emit the primary table
    expect(sql).toContain('FROM primary_t')
    // Fallback emits the rightTableAlias's table (y_table)
    expect(sql).toContain('y_table')
  })
})

// ---------------------------------------------------------------------------
// JSONB expansions (CROSS JOIN jsonb_to_record)
// ---------------------------------------------------------------------------

describe('JSONB expansions (jsonb_to_record)', () => {
  it('emits CROSS JOIN jsonb_to_record for a jsonbExpansion with fields', () => {
    const alias = 'ae'
    const col = 'info'
    const expandAlias = 'i'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'audit_events' })],
      jsonbExpansions: [{
        id: crypto.randomUUID(),
        tableAlias: alias,
        columnName: col,
        expandAlias,
        fields: [
          { name: 'machine_name', pgType: 'text' },
          { name: 'rpm', pgType: 'numeric' },
        ],
      }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('CROSS JOIN jsonb_to_record')
    expect(sql).toContain(`${alias}.${col}`)
    expect(sql).toContain(`${expandAlias}`)
    expect(sql).toContain('machine_name text')
    expect(sql).toContain('rpm numeric')
  })

  it('skips a jsonbExpansion with no fields', () => {
    const alias = 'ae'
    const col = 'info'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'audit_events' })],
      jsonbExpansions: [{
        id: crypto.randomUUID(),
        tableAlias: alias,
        columnName: col,
        expandAlias: 'i',
        fields: [],
      }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).not.toContain('jsonb_to_record')
  })
})

// ---------------------------------------------------------------------------
// JSONB array unnesting (LATERAL jsonb_array_elements / jsonb_to_recordset)
// ---------------------------------------------------------------------------

describe('JSONB array unnesting', () => {
  it('emits CROSS JOIN LATERAL jsonb_array_elements for elements mode with single-segment path', () => {
    const alias = 'ae'
    const col = 'payload'
    const arrayPath = 'faults'
    const unnestAlias = 'f'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'audit_events' })],
      jsonbArrayUnnestings: [{
        id: crypto.randomUUID(),
        tableAlias: alias,
        columnName: col,
        arrayPath,
        unnestAlias,
        mode: 'elements',
        recordsetFields: [],
      }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('CROSS JOIN LATERAL jsonb_array_elements')
    expect(sql).toContain(`${alias}.${col} -> '${arrayPath}'`)
    expect(sql).toContain(`AS ${unnestAlias}`)
  })

  it('uses #> operator for multi-segment arrayPath in elements mode', () => {
    const alias = 'ae'
    const col = 'data'
    const arrayPath = 'config.items'
    const unnestAlias = 'it'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'audit_events' })],
      jsonbArrayUnnestings: [{
        id: crypto.randomUUID(),
        tableAlias: alias,
        columnName: col,
        arrayPath,
        unnestAlias,
        mode: 'elements',
        recordsetFields: [],
      }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('jsonb_array_elements')
    expect(sql).toContain(`${alias}.${col} #> '{config,items}'`)
  })

  it('emits CROSS JOIN LATERAL jsonb_to_recordset for recordset mode with fields', () => {
    const alias = 'ae'
    const col = 'payload'
    const arrayPath = 'sensors'
    const unnestAlias = 's'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'audit_events' })],
      jsonbArrayUnnestings: [{
        id: crypto.randomUUID(),
        tableAlias: alias,
        columnName: col,
        arrayPath,
        unnestAlias,
        mode: 'recordset',
        recordsetFields: [
          { name: 'sensor_id', pgType: 'integer' },
          { name: 'reading', pgType: 'float8' },
        ],
      }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('CROSS JOIN LATERAL jsonb_to_recordset')
    expect(sql).toContain('sensor_id integer')
    expect(sql).toContain('reading float8')
  })

  it('skips a recordset unnesting with no fields', () => {
    const alias = 'ae'
    const col = 'payload'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'audit_events' })],
      jsonbArrayUnnestings: [{
        id: crypto.randomUUID(),
        tableAlias: alias,
        columnName: col,
        arrayPath: 'items',
        unnestAlias: 'it',
        mode: 'recordset',
        recordsetFields: [],
      }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).not.toContain('jsonb_to_recordset')
  })
})

// ---------------------------------------------------------------------------
// TimescaleDB time_bucket / time_bucket_gapfill
// ---------------------------------------------------------------------------

describe('TimescaleDB time_bucket', () => {
  it('adds time_bucket(...) AS alias to SELECT and GROUP BY', () => {
    const alias = 'm'
    const timeCol = 'recorded_at'
    const interval = '1 hour'
    const bucketAlias = 'bucket'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      selectedColumns: [makeCol(alias, 'value', { aggregate: 'AVG' })],
      groupBy: [],
      timescaleBucket: {
        columnRef: { tableAlias: alias, columnName: timeCol },
        interval,
        alias: bucketAlias,
        gapfill: false,
      },
    })
    const sql = normalise(buildSql(state))
    // sql-formatter may insert a space between the function name and '('
    expect(sql).toMatch(/time_bucket\s*\('1 hour',\s*m\.recorded_at\)/)
    expect(sql).toContain(`AS ${bucketAlias}`)
    expect(sql).toContain('GROUP BY')
  })

  it('uses time_bucket_gapfill when gapfill is true', () => {
    const alias = 'm'
    const timeCol = 'ts'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      timescaleBucket: {
        columnRef: { tableAlias: alias, columnName: timeCol },
        interval: '5 minutes',
        alias: 'time',
        gapfill: true,
      },
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('time_bucket_gapfill')
  })

  it('emits Grafana $__interval variable unquoted in time_bucket', () => {
    const alias = 'm'
    const timeCol = 'ts'
    const grafanaInterval = '$__interval'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      timescaleBucket: {
        columnRef: { tableAlias: alias, columnName: timeCol },
        interval: grafanaInterval,
        alias: 'time',
        gapfill: false,
      },
    })
    const sql = normalise(buildSql(state))
    // $__interval is a Grafana macro — preserved unquoted; formatter may add space before '('
    expect(sql).toMatch(/time_bucket\s*\(\$__interval,/)
    expect(sql).not.toContain(`'${grafanaInterval}'`)
  })

  it('wraps a column in locf() when gapfill is active and strategy is locf', () => {
    const alias = 'm'
    const timeCol = 'ts'
    const valueCol = 'cpu_pct'
    const col = makeCol(alias, valueCol, { aggregate: 'AVG' })
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      selectedColumns: [col],
      timescaleBucket: {
        columnRef: { tableAlias: alias, columnName: timeCol },
        interval: '1 hour',
        alias: 'time',
        gapfill: true,
      },
      gapfillStrategies: [{ selectedColumnId: col.id, strategy: 'locf' }],
    })
    const sql = normalise(buildSql(state))
    // sql-formatter may insert a space before '('
    expect(sql).toMatch(/locf\s*\(/)
  })

  it('wraps a column in interpolate() when gapfill is active and strategy is interpolate', () => {
    const alias = 'm'
    const timeCol = 'ts'
    const valueCol = 'temp'
    const col = makeCol(alias, valueCol, { aggregate: 'AVG' })
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      selectedColumns: [col],
      timescaleBucket: {
        columnRef: { tableAlias: alias, columnName: timeCol },
        interval: '1 hour',
        alias: 'time',
        gapfill: true,
      },
      gapfillStrategies: [{ selectedColumnId: col.id, strategy: 'interpolate' }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toMatch(/interpolate\s*\(/)
  })

  it('does not wrap columns in gapfill strategies when gapfill is false', () => {
    const alias = 'm'
    const timeCol = 'ts'
    const valueCol = 'cpu_pct'
    const col = makeCol(alias, valueCol, { aggregate: 'AVG' })
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      selectedColumns: [col],
      timescaleBucket: {
        columnRef: { tableAlias: alias, columnName: timeCol },
        interval: '1 hour',
        alias: 'time',
        gapfill: false,
      },
      gapfillStrategies: [{ selectedColumnId: col.id, strategy: 'locf' }],
    })
    const sql = normalise(buildSql(state))
    expect(sql).not.toContain('locf(')
    expect(sql).not.toContain('interpolate(')
  })
})

// ---------------------------------------------------------------------------
// CTEs — extended cases
// ---------------------------------------------------------------------------

describe('CTEs — extended', () => {
  it('uses rawSql verbatim when CTEDef.rawSql is set, ignoring queryState', () => {
    const cteName = 'raw_cte'
    const rawSql = 'SELECT 1 AS id, now() AS created_at'
    const cte: CTEDef = {
      id: crypto.randomUUID(),
      name: cteName,
      recursive: false,
      queryState: emptyQueryState(),  // should be ignored
      rawSql,
      outputColumns: [],
    }
    const state = makeState({
      tables: [makeTable({ alias: 'r', tableName: cteName })],
      ctes: [cte],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(rawSql)
  })

  it('emits anchor UNION ALL recursiveStep for guided recursive CTEs', () => {
    const cteName = 'hierarchy'
    const anchorSql = 'SELECT id, parent_id, name FROM categories WHERE parent_id IS NULL'
    const recursiveStepSql = 'SELECT c.id, c.parent_id, c.name FROM categories c JOIN hierarchy h ON c.parent_id = h.id'
    const cte: CTEDef = {
      id: crypto.randomUUID(),
      name: cteName,
      recursive: true,
      recursiveMode: 'guided',
      anchorSql,
      recursiveStepSql,
      queryState: emptyQueryState(),
      outputColumns: [],
    }
    const state = makeState({
      tables: [makeTable({ alias: 'h', tableName: cteName })],
      ctes: [cte],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('WITH RECURSIVE')
    expect(sql).toContain(anchorSql)
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain(recursiveStepSql)
  })

  it('emits multiple CTEs separated by commas', () => {
    const cte1Name = 'cte_one'
    const cte2Name = 'cte_two'
    const cte1: CTEDef = {
      id: crypto.randomUUID(),
      name: cte1Name,
      recursive: false,
      queryState: makeState({ tables: [makeTable({ alias: 'x', tableName: 'source_a' })] }),
      outputColumns: [],
    }
    const cte2: CTEDef = {
      id: crypto.randomUUID(),
      name: cte2Name,
      recursive: false,
      queryState: makeState({ tables: [makeTable({ alias: 'y', tableName: 'source_b' })] }),
      outputColumns: [],
    }
    const state = makeState({
      tables: [makeTable({ alias: 'z', tableName: cte1Name })],
      ctes: [cte1, cte2],
    })
    const sql = normalise(buildSql(state))
    // Both CTEs must be defined with their AS ( ... ) syntax in the WITH block
    expect(sql).toContain(`${cte1Name} AS (`)
    expect(sql).toContain(`${cte2Name} AS (`)
    // cte2 definition must appear before the outer FROM clause
    const cte2DefIdx = sql.indexOf(`${cte2Name} AS (`)
    const outerFromIdx = sql.lastIndexOf('FROM')
    expect(cte2DefIdx).toBeLessThan(outerFromIdx)
  })

  it('emits no schema prefix for CTE virtual tables (schemaName is empty string)', () => {
    const cteName = 'my_cte'
    const cte: CTEDef = {
      id: crypto.randomUUID(),
      name: cteName,
      recursive: false,
      queryState: makeState({ tables: [makeTable({ alias: 's', tableName: 'source' })] }),
      outputColumns: [],
    }
    // CTE virtual table has schemaName = ''
    const virtualTable: TableInstance = makeTable({ alias: cteName, tableName: cteName, schemaName: '' })
    const state = makeState({
      tables: [virtualTable],
      ctes: [cte],
    })
    const sql = normalise(buildSql(state))
    // FROM clause should reference just the CTE name, never "schema".cteName
    expect(sql).toContain(`FROM ${cteName}`)
    expect(sql).not.toMatch(new RegExp(`\\.${cteName}`))
  })
})

// ---------------------------------------------------------------------------
// Grafana macro preservation through sql-formatter
// ---------------------------------------------------------------------------

describe('Grafana macro preservation', () => {
  it('$__timeFilter macro survives sql-formatter unchanged', () => {
    const alias = 'm'
    const col = 'event_ts'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      where: makeGroup('AND', [makeRule(`${alias}.${col}`, '$__timeFilter', null)]),
    })
    const sql = buildSql(state)  // not normalised — check the actual formatted output
    expect(sql).toContain('$__timeFilter(')
  })

  it('$__interval Grafana variable is preserved when used as a time_bucket interval', () => {
    const alias = 'm'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'metrics' })],
      timescaleBucket: {
        columnRef: { tableAlias: alias, columnName: 'ts' },
        interval: '$__interval',
        alias: 'time',
        gapfill: false,
      },
    })
    const sql = buildSql(state)
    expect(sql).toContain('$__interval')
  })

  it('$variable dashboard variables are preserved unquoted in WHERE clause values', () => {
    const alias = 'o'
    const col = 'region'
    const dashboardVar = '$region'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(`${alias}.${col}`, '=', dashboardVar)]),
    })
    const sql = buildSql(state)
    expect(sql).toContain(dashboardVar)
    expect(sql).not.toContain(`'${dashboardVar}'`)
  })
})

// ---------------------------------------------------------------------------
// Window functions — extended
// ---------------------------------------------------------------------------

describe('Window functions — extended', () => {
  it('emits window function with a frame clause', () => {
    const alias = 's'
    const frameClause = 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW'
    const wf: WindowFunctionDef = {
      id: crypto.randomUUID(),
      fn: 'SUM',
      expression: `${alias}.amount`,
      partitionBy: [],
      orderBy: [{ tableAlias: alias, columnName: 'created_at', direction: 'ASC' }],
      frameClause,
      alias: 'running_sum',
    }
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'sales' })],
      windowFunctions: [wf],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(frameClause)
  })

  it('emits window function with no PARTITION BY when partitionBy is empty', () => {
    const alias = 's'
    const wf: WindowFunctionDef = {
      id: crypto.randomUUID(),
      fn: 'ROW_NUMBER',
      partitionBy: [],
      orderBy: [{ tableAlias: alias, columnName: 'id', direction: 'ASC' }],
      alias: 'rn',
    }
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'sales' })],
      windowFunctions: [wf],
    })
    const sql = normalise(buildSql(state))
    expect(sql).not.toContain('PARTITION BY')
    expect(sql).toContain('ROW_NUMBER()')
  })

  it('emits multiple window functions in a single SELECT', () => {
    const alias = 's'
    const wf1: WindowFunctionDef = {
      id: crypto.randomUUID(),
      fn: 'ROW_NUMBER',
      partitionBy: [{ tableAlias: alias, columnName: 'category' }],
      orderBy: [{ tableAlias: alias, columnName: 'id', direction: 'ASC' }],
      alias: 'rn',
    }
    const wf2: WindowFunctionDef = {
      id: crypto.randomUUID(),
      fn: 'RANK',
      partitionBy: [{ tableAlias: alias, columnName: 'category' }],
      orderBy: [{ tableAlias: alias, columnName: 'score', direction: 'DESC' }],
      alias: 'rnk',
    }
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'sales' })],
      windowFunctions: [wf1, wf2],
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('ROW_NUMBER()')
    expect(sql).toContain('RANK()')
    expect(sql).toContain('AS rn')
    expect(sql).toContain('AS rnk')
  })
})

// ---------------------------------------------------------------------------
// quoteValue edge cases
// ---------------------------------------------------------------------------

describe('quoteValue edge cases', () => {
  it('emits Grafana $var dashboard variables unquoted', () => {
    const alias = 'o'
    const col = 'machine'
    const grafanaVar = '$machine_name'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(`${alias}.${col}`, '=', grafanaVar)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain(grafanaVar)
    expect(sql).not.toContain(`'${grafanaVar}'`)
  })

  it('emits NULL for an empty string value', () => {
    const alias = 'o'
    const col = 'notes'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(`${alias}.${col}`, '=', '')]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('NULL')
  })

  it('emits NULL for an undefined value', () => {
    const alias = 'o'
    const col = 'notes'
    const state = makeState({
      tables: [makeTable({ alias, tableName: 'orders' })],
      where: makeGroup('AND', [makeRule(`${alias}.${col}`, '=', undefined as unknown as null)]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('NULL')
  })

  it('emits a dotted column reference unquoted for correlated subquery conditions', () => {
    const state = makeState({
      tables: [makeTable({ alias: 'o', tableName: 'orders' })],
      where: makeGroup('AND', [makeRule('o.customer_id', '=', 'c.id')]),
    })
    const sql = normalise(buildSql(state))
    expect(sql).toContain('o.customer_id = c.id')
    expect(sql).not.toContain("'c.id'")
  })
})
