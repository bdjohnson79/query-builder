// Built-in query templates seeded at startup.
// Each template is a minimal QueryState that demonstrates the SQL pattern.
// Tables/columns use placeholder names — users load the template then wire up their own schema.
//
// These are intentionally kept as raw QueryState JSON rather than constructed with builders,
// to avoid server-side import of client stores.

import type { QueryState } from '@/types/query'
import { emptyFilterGroup, emptyQueryState } from '@/types/query'

export interface BuiltInTemplate {
  name: string
  description: string
  tags: string[]
  queryState: QueryState
}

// ---------------------------------------------------------------------------
// Helper: empty state base
// ---------------------------------------------------------------------------

function base(): QueryState {
  return emptyQueryState()
}

// ---------------------------------------------------------------------------
// 1. Throughput Time-Series
// ---------------------------------------------------------------------------

const throughputTimeSeries: BuiltInTemplate = {
  name: 'Throughput Time-Series',
  description:
    'Units produced per time bucket, grouped by line. Wire up your production table and timestamp column. Uses $__timeFilter for Grafana time range.',
  tags: ['efficiency', 'time-series', 'grafana'],
  queryState: {
    ...base(),
    tables: [
      {
        id: 'tpl-prod-1',
        tableId: 0,
        tableName: 'production_events',
        schemaName: '',
        alias: 'pe',
        position: { x: 100, y: 100 },
        columns: [
          { id: 1, name: 'event_time', pgType: 'timestamptz', isNullable: false, isPrimaryKey: false },
          { id: 2, name: 'line_id',    pgType: 'integer',     isNullable: false, isPrimaryKey: false },
          { id: 3, name: 'unit_count', pgType: 'integer',     isNullable: false, isPrimaryKey: false },
        ],
      },
    ],
    timescaleBucket: {
      columnRef: { tableAlias: 'pe', columnName: 'event_time' },
      interval: '$__interval',
      alias: 'time',
      gapfill: false,
    },
    selectedColumns: [
      { id: 'c1', tableAlias: 'pe', columnName: 'line_id', alias: 'line_id' },
      { id: 'c2', tableAlias: 'pe', columnName: 'unit_count', aggregate: 'SUM', alias: 'total_units' },
    ],
    groupBy: [{ tableAlias: 'pe', columnName: 'line_id' }],
    where: {
      id: 'w1',
      combinator: 'AND',
      rules: [
        { id: 'r1', field: 'pe.event_time', operator: '$__timeFilter', value: '' },
      ],
    },
    orderBy: [{ tableAlias: '__grafana__', columnName: 'time', direction: 'ASC' }],
    grafanaPanelType: 'time-series',
  },
}

// ---------------------------------------------------------------------------
// 2. Yield / Waste Rate by Product
// ---------------------------------------------------------------------------

const yieldWasteRate: BuiltInTemplate = {
  name: 'Yield / Waste Rate by Product',
  description:
    'Output yield % and waste % grouped by product. Uses NULLIF to avoid divide-by-zero. Replace column names to match your production table.',
  tags: ['quality', 'yield'],
  queryState: {
    ...base(),
    tables: [
      {
        id: 'tpl-prod-2',
        tableId: 0,
        tableName: 'production_runs',
        schemaName: '',
        alias: 'pr',
        position: { x: 100, y: 100 },
        columns: [
          { id: 1, name: 'product_code', pgType: 'text',    isNullable: false, isPrimaryKey: false },
          { id: 2, name: 'input_qty',    pgType: 'numeric', isNullable: false, isPrimaryKey: false },
          { id: 3, name: 'output_qty',   pgType: 'numeric', isNullable: false, isPrimaryKey: false },
          { id: 4, name: 'waste_qty',    pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
    ],
    selectedColumns: [
      { id: 'c1', tableAlias: 'pr', columnName: 'product_code', alias: 'product' },
      { id: 'c2', tableAlias: 'pr', columnName: 'input_qty',    aggregate: 'SUM', alias: 'total_input' },
      { id: 'c3', tableAlias: 'pr', columnName: 'output_qty',   aggregate: 'SUM', alias: 'total_output' },
      { id: 'c4', tableAlias: 'pr', columnName: 'waste_qty',    aggregate: 'SUM', alias: 'total_waste' },
      {
        id: 'c5',
        tableAlias: '__expr__',
        columnName: 'yield_pct',
        alias: 'yield_pct',
        expression: 'ROUND(100.0 * SUM(pr.output_qty) / NULLIF(SUM(pr.input_qty), 0), 2)',
      },
      {
        id: 'c6',
        tableAlias: '__expr__',
        columnName: 'waste_pct',
        alias: 'waste_pct',
        expression: 'ROUND(100.0 * SUM(pr.waste_qty) / NULLIF(SUM(pr.input_qty), 0), 2)',
      },
    ],
    groupBy: [{ tableAlias: 'pr', columnName: 'product_code' }],
    orderBy: [{ tableAlias: '__expr__', columnName: 'yield_pct', direction: 'ASC' }],
  },
}

// ---------------------------------------------------------------------------
// 3. Downtime Pareto (with running %)
// ---------------------------------------------------------------------------

const downtimePareto: BuiltInTemplate = {
  name: 'Downtime Pareto (with running %)',
  description:
    'Total downtime by reason, sorted descending, with a running cumulative % column for Pareto charts. Replace with your downtime table.',
  tags: ['efficiency', 'pareto', 'downtime'],
  queryState: {
    ...base(),
    ctes: [
      {
        id: 'cte-ranked',
        name: 'ranked',
        recursive: false,
        outputColumns: [
          { name: 'reason',        pgType: 'text' },
          { name: 'total_minutes', pgType: 'numeric' },
          { name: 'grand_total',   pgType: 'numeric' },
        ],
        queryState: {
          ...base(),
          tables: [
            {
              id: 'tpl-dt-1',
              tableId: 0,
              tableName: 'downtime_events',
              schemaName: '',
              alias: 'de',
              position: { x: 100, y: 100 },
              columns: [
                { id: 1, name: 'reason',          pgType: 'text',    isNullable: false, isPrimaryKey: false },
                { id: 2, name: 'duration_minutes', pgType: 'numeric', isNullable: false, isPrimaryKey: false },
              ],
            },
          ],
          selectedColumns: [
            { id: 'c1', tableAlias: 'de', columnName: 'reason',           alias: 'reason' },
            { id: 'c2', tableAlias: 'de', columnName: 'duration_minutes',  aggregate: 'SUM', alias: 'total_minutes' },
            {
              id: 'c3',
              tableAlias: '__expr__',
              columnName: 'grand_total',
              alias: 'grand_total',
              expression: 'SUM(SUM(de.duration_minutes)) OVER ()',
            },
          ],
          groupBy: [{ tableAlias: 'de', columnName: 'reason' }],
          orderBy: [{ tableAlias: '__expr__', columnName: 'total_minutes', direction: 'DESC' }],
        },
      },
    ],
    tables: [
      {
        id: 'tpl-ranked-vt',
        tableId: 0,
        tableName: 'ranked',
        schemaName: '',
        alias: 'ranked',
        cteId: 'cte-ranked',
        position: { x: 100, y: 100 },
        columns: [
          { id: 1, name: 'reason',        pgType: 'text',    isNullable: false, isPrimaryKey: false },
          { id: 2, name: 'total_minutes', pgType: 'numeric', isNullable: false, isPrimaryKey: false },
          { id: 3, name: 'grand_total',   pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
    ],
    selectedColumns: [
      { id: 'c1', tableAlias: 'ranked', columnName: 'reason',        alias: 'reason' },
      { id: 'c2', tableAlias: 'ranked', columnName: 'total_minutes', alias: 'total_minutes' },
      {
        id: 'c3',
        tableAlias: '__expr__',
        columnName: 'running_pct',
        alias: 'running_pct',
        expression: 'ROUND(100.0 * SUM(ranked.total_minutes) OVER (ORDER BY ranked.total_minutes DESC) / NULLIF(ranked.grand_total, 0), 2)',
      },
    ],
    orderBy: [{ tableAlias: 'ranked', columnName: 'total_minutes', direction: 'DESC' }],
  },
}

// ---------------------------------------------------------------------------
// 4. SPC Control Limits (AVG ± 3σ)
// ---------------------------------------------------------------------------

const spcControlLimits: BuiltInTemplate = {
  name: 'SPC Control Limits (AVG ± 3σ)',
  description:
    'Process mean, standard deviation, UCL (mean + 3σ), and LCL (mean − 3σ) grouped by product/line. Replace with your process measurement table.',
  tags: ['quality', 'spc', 'statistical'],
  queryState: {
    ...base(),
    tables: [
      {
        id: 'tpl-spc-1',
        tableId: 0,
        tableName: 'process_measurements',
        schemaName: '',
        alias: 'pm',
        position: { x: 100, y: 100 },
        columns: [
          { id: 1, name: 'product_code',  pgType: 'text',    isNullable: false, isPrimaryKey: false },
          { id: 2, name: 'measured_value', pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
    ],
    selectedColumns: [
      { id: 'c1', tableAlias: 'pm', columnName: 'product_code',   alias: 'product' },
      { id: 'c2', tableAlias: 'pm', columnName: 'measured_value', aggregate: 'AVG',     alias: 'mean' },
      { id: 'c3', tableAlias: 'pm', columnName: 'measured_value', aggregate: 'STDDEV',  alias: 'stddev' },
      {
        id: 'c4',
        tableAlias: '__expr__',
        columnName: 'ucl',
        alias: 'ucl',
        expression: 'AVG(pm.measured_value) + 3 * STDDEV(pm.measured_value)',
      },
      {
        id: 'c5',
        tableAlias: '__expr__',
        columnName: 'lcl',
        alias: 'lcl',
        expression: 'AVG(pm.measured_value) - 3 * STDDEV(pm.measured_value)',
      },
      { id: 'c6', tableAlias: 'pm', columnName: 'measured_value', aggregate: 'COUNT', alias: 'sample_size' },
    ],
    groupBy: [{ tableAlias: 'pm', columnName: 'product_code' }],
    orderBy: [{ tableAlias: 'pm', columnName: 'product_code', direction: 'ASC' }],
  },
}

// ---------------------------------------------------------------------------
// 5. Changeover Time (LAG window)
// ---------------------------------------------------------------------------

const changeoverTime: BuiltInTemplate = {
  name: 'Changeover Time (LAG window)',
  description:
    'Time between consecutive production orders on the same line, using the LAG window function. Replace with your production order table.',
  tags: ['efficiency', 'changeover'],
  queryState: {
    ...base(),
    tables: [
      {
        id: 'tpl-co-1',
        tableId: 0,
        tableName: 'production_orders',
        schemaName: '',
        alias: 'po',
        position: { x: 100, y: 100 },
        columns: [
          { id: 1, name: 'line_id',    pgType: 'integer',     isNullable: false, isPrimaryKey: false },
          { id: 2, name: 'order_id',   pgType: 'integer',     isNullable: false, isPrimaryKey: true },
          { id: 3, name: 'start_time', pgType: 'timestamptz', isNullable: false, isPrimaryKey: false },
          { id: 4, name: 'end_time',   pgType: 'timestamptz', isNullable: false, isPrimaryKey: false },
          { id: 5, name: 'product_code', pgType: 'text',      isNullable: false, isPrimaryKey: false },
        ],
      },
    ],
    selectedColumns: [
      { id: 'c1', tableAlias: 'po', columnName: 'line_id',      alias: 'line_id' },
      { id: 'c2', tableAlias: 'po', columnName: 'order_id',     alias: 'order_id' },
      { id: 'c3', tableAlias: 'po', columnName: 'product_code', alias: 'product' },
      { id: 'c4', tableAlias: 'po', columnName: 'start_time',   alias: 'start_time' },
    ],
    windowFunctions: [
      {
        id: 'wf1',
        fn: 'LAG',
        expression: 'po.end_time',
        partitionBy: [{ tableAlias: 'po', columnName: 'line_id' }],
        orderBy: [{ tableAlias: 'po', columnName: 'start_time', direction: 'ASC' }],
        alias: 'prev_end_time',
      },
      {
        id: 'wf2',
        fn: 'LAG',
        expression: 'po.product_code',
        partitionBy: [{ tableAlias: 'po', columnName: 'line_id' }],
        orderBy: [{ tableAlias: 'po', columnName: 'start_time', direction: 'ASC' }],
        alias: 'prev_product',
      },
    ],
    orderBy: [
      { tableAlias: 'po', columnName: 'line_id',    direction: 'ASC' },
      { tableAlias: 'po', columnName: 'start_time', direction: 'ASC' },
    ],
  },
}

// ---------------------------------------------------------------------------
// 6. Before/After CAPA Comparison
// ---------------------------------------------------------------------------

const capaComparison: BuiltInTemplate = {
  name: 'Before/After CAPA Comparison',
  description:
    'Compare a KPI (e.g. defect rate) for 30 days before and after a corrective action date. Replace the date literals and table/column names.',
  tags: ['quality', 'capa', 'comparison'],
  queryState: {
    ...base(),
    ctes: [
      {
        id: 'cte-before',
        name: 'before_capa',
        recursive: false,
        outputColumns: [
          { name: 'product_code',  pgType: 'text' },
          { name: 'defect_rate',   pgType: 'numeric' },
        ],
        rawSql: `SELECT
  product_code,
  ROUND(100.0 * SUM(defect_count) / NULLIF(SUM(total_count), 0), 2) AS defect_rate
FROM quality_inspections
WHERE inspected_at BETWEEN '2024-10-01' - INTERVAL '30 days' AND '2024-10-01'
GROUP BY product_code`,
        queryState: emptyQueryState(),
      },
      {
        id: 'cte-after',
        name: 'after_capa',
        recursive: false,
        outputColumns: [
          { name: 'product_code',  pgType: 'text' },
          { name: 'defect_rate',   pgType: 'numeric' },
        ],
        rawSql: `SELECT
  product_code,
  ROUND(100.0 * SUM(defect_count) / NULLIF(SUM(total_count), 0), 2) AS defect_rate
FROM quality_inspections
WHERE inspected_at BETWEEN '2024-10-01' AND '2024-10-01' + INTERVAL '30 days'
GROUP BY product_code`,
        queryState: emptyQueryState(),
      },
    ],
    tables: [
      {
        id: 'tpl-before-vt',
        tableId: 0,
        tableName: 'before_capa',
        schemaName: '',
        alias: 'b',
        cteId: 'cte-before',
        position: { x: 100, y: 100 },
        columns: [
          { id: 1, name: 'product_code', pgType: 'text',    isNullable: false, isPrimaryKey: false },
          { id: 2, name: 'defect_rate',  pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
      {
        id: 'tpl-after-vt',
        tableId: 0,
        tableName: 'after_capa',
        schemaName: '',
        alias: 'a',
        cteId: 'cte-after',
        position: { x: 400, y: 100 },
        columns: [
          { id: 3, name: 'product_code', pgType: 'text',    isNullable: false, isPrimaryKey: false },
          { id: 4, name: 'defect_rate',  pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
    ],
    joins: [
      {
        id: 'j1',
        type: 'INNER',
        leftTableAlias: 'b',
        leftColumn: 'product_code',
        rightTableAlias: 'a',
        rightColumn: 'product_code',
      },
    ],
    selectedColumns: [
      { id: 'c1', tableAlias: 'b', columnName: 'product_code',  alias: 'product' },
      { id: 'c2', tableAlias: 'b', columnName: 'defect_rate',   alias: 'before_defect_rate' },
      { id: 'c3', tableAlias: 'a', columnName: 'defect_rate',   alias: 'after_defect_rate' },
      {
        id: 'c4',
        tableAlias: '__expr__',
        columnName: 'improvement',
        alias: 'improvement',
        expression: 'b.defect_rate - a.defect_rate',
      },
    ],
    orderBy: [{ tableAlias: '__expr__', columnName: 'improvement', direction: 'DESC' }],
  },
}

// ---------------------------------------------------------------------------
// 7. OEE (Availability × Performance × Quality)
// ---------------------------------------------------------------------------

const oeeTemplate: BuiltInTemplate = {
  name: 'OEE (Availability × Performance × Quality)',
  description:
    'Overall Equipment Effectiveness computed via three CTEs, one per component. Each CTE uses raw SQL — edit the date range and table names to match your schema.',
  tags: ['efficiency', 'oee'],
  queryState: {
    ...base(),
    ctes: [
      {
        id: 'cte-avail',
        name: 'availability',
        recursive: false,
        outputColumns: [
          { name: 'line_id',       pgType: 'integer' },
          { name: 'availability',  pgType: 'numeric' },
        ],
        rawSql: `SELECT
  line_id,
  ROUND(SUM(run_minutes)::numeric / NULLIF(SUM(planned_minutes), 0), 4) AS availability
FROM line_schedule
WHERE shift_date = CURRENT_DATE
GROUP BY line_id`,
        queryState: emptyQueryState(),
      },
      {
        id: 'cte-perf',
        name: 'performance',
        recursive: false,
        outputColumns: [
          { name: 'line_id',      pgType: 'integer' },
          { name: 'performance',  pgType: 'numeric' },
        ],
        rawSql: `SELECT
  line_id,
  ROUND(SUM(actual_units)::numeric / NULLIF(SUM(ideal_units), 0), 4) AS performance
FROM production_counts
WHERE shift_date = CURRENT_DATE
GROUP BY line_id`,
        queryState: emptyQueryState(),
      },
      {
        id: 'cte-qual',
        name: 'quality',
        recursive: false,
        outputColumns: [
          { name: 'line_id',   pgType: 'integer' },
          { name: 'quality',   pgType: 'numeric' },
        ],
        rawSql: `SELECT
  line_id,
  ROUND(SUM(good_units)::numeric / NULLIF(SUM(total_units), 0), 4) AS quality
FROM quality_counts
WHERE shift_date = CURRENT_DATE
GROUP BY line_id`,
        queryState: emptyQueryState(),
      },
    ],
    tables: [
      {
        id: 'tpl-avail-vt',
        tableId: 0,
        tableName: 'availability',
        schemaName: '',
        alias: 'av',
        cteId: 'cte-avail',
        position: { x: 100, y: 100 },
        columns: [
          { id: 1, name: 'line_id',      pgType: 'integer', isNullable: false, isPrimaryKey: false },
          { id: 2, name: 'availability', pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
      {
        id: 'tpl-perf-vt',
        tableId: 0,
        tableName: 'performance',
        schemaName: '',
        alias: 'pf',
        cteId: 'cte-perf',
        position: { x: 400, y: 100 },
        columns: [
          { id: 3, name: 'line_id',     pgType: 'integer', isNullable: false, isPrimaryKey: false },
          { id: 4, name: 'performance', pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
      {
        id: 'tpl-qual-vt',
        tableId: 0,
        tableName: 'quality',
        schemaName: '',
        alias: 'ql',
        cteId: 'cte-qual',
        position: { x: 700, y: 100 },
        columns: [
          { id: 5, name: 'line_id', pgType: 'integer', isNullable: false, isPrimaryKey: false },
          { id: 6, name: 'quality', pgType: 'numeric', isNullable: false, isPrimaryKey: false },
        ],
      },
    ],
    joins: [
      {
        id: 'j1',
        type: 'INNER',
        leftTableAlias: 'av',
        leftColumn: 'line_id',
        rightTableAlias: 'pf',
        rightColumn: 'line_id',
      },
      {
        id: 'j2',
        type: 'INNER',
        leftTableAlias: 'pf',
        leftColumn: 'line_id',
        rightTableAlias: 'ql',
        rightColumn: 'line_id',
      },
    ],
    selectedColumns: [
      { id: 'c1', tableAlias: 'av', columnName: 'line_id',      alias: 'line_id' },
      { id: 'c2', tableAlias: 'av', columnName: 'availability', alias: 'availability' },
      { id: 'c3', tableAlias: 'pf', columnName: 'performance',  alias: 'performance' },
      { id: 'c4', tableAlias: 'ql', columnName: 'quality',      alias: 'quality' },
      {
        id: 'c5',
        tableAlias: '__expr__',
        columnName: 'oee',
        alias: 'oee',
        expression: 'ROUND(av.availability * pf.performance * ql.quality * 100, 2)',
      },
    ],
    orderBy: [{ tableAlias: '__expr__', columnName: 'oee', direction: 'DESC' }],
  },
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  throughputTimeSeries,
  yieldWasteRate,
  downtimePareto,
  spcControlLimits,
  changeoverTime,
  capaComparison,
  oeeTemplate,
]
