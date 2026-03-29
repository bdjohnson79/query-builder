// ---------------------------------------------------------------------------
// Formula template registry for the Formula Wizard in SelectColumnsPanel.
// Each template builds a SQL expression from named parameter values.
// ---------------------------------------------------------------------------

export type FormulaCategory = 'quality' | 'efficiency' | 'comparison' | 'statistical'

export interface FormulaParam {
  name: string
  hint: string
}

export interface FormulaTemplate {
  id: string
  label: string
  category: FormulaCategory
  description: string
  params: FormulaParam[]
  buildExpression: (params: string[]) => string
}

export const FORMULA_CATEGORIES: { value: FormulaCategory; label: string }[] = [
  { value: 'quality',      label: 'Quality' },
  { value: 'efficiency',   label: 'Efficiency' },
  { value: 'comparison',   label: 'Comparison' },
  { value: 'statistical',  label: 'Statistical' },
]

export const FORMULA_TEMPLATES: FormulaTemplate[] = [
  // Quality
  {
    id: 'yield_pct',
    label: 'Yield %',
    category: 'quality',
    description: 'Output quantity as a percentage of input quantity',
    params: [
      { name: 'output_qty', hint: 'Output / good quantity column (e.g. t.output_qty)' },
      { name: 'input_qty',  hint: 'Input / total quantity column (e.g. t.input_qty)' },
    ],
    buildExpression: ([out, inp]) =>
      `ROUND(100.0 * ${out} / NULLIF(${inp}, 0), 2)`,
  },
  {
    id: 'defect_rate',
    label: 'Defect Rate %',
    category: 'quality',
    description: 'Rejected units as a percentage of total units inspected',
    params: [
      { name: 'defect_count', hint: 'Count of defective / rejected units' },
      { name: 'total_count',  hint: 'Total units inspected' },
    ],
    buildExpression: ([d, t]) =>
      `ROUND(100.0 * ${d} / NULLIF(${t}, 0), 2)`,
  },
  {
    id: 'waste_rate',
    label: 'Waste Rate %',
    category: 'quality',
    description: 'Waste quantity as a percentage of input quantity',
    params: [
      { name: 'waste_qty', hint: 'Waste / scrap quantity' },
      { name: 'input_qty', hint: 'Total input quantity' },
    ],
    buildExpression: ([w, i]) =>
      `ROUND(100.0 * ${w} / NULLIF(${i}, 0), 2)`,
  },
  {
    id: 'first_pass_yield',
    label: 'First Pass Yield %',
    category: 'quality',
    description: 'Units passing inspection on first attempt, no rework',
    params: [
      { name: 'pass_count',  hint: 'Units passed on first attempt' },
      { name: 'total_count', hint: 'Total units started' },
    ],
    buildExpression: ([p, t]) =>
      `ROUND(100.0 * ${p} / NULLIF(${t}, 0), 2)`,
  },

  // Efficiency
  {
    id: 'oee',
    label: 'OEE',
    category: 'efficiency',
    description: 'Overall Equipment Effectiveness = Availability × Performance × Quality (each as 0–1 ratio)',
    params: [
      { name: 'availability', hint: 'Availability ratio column (0–1)' },
      { name: 'performance',  hint: 'Performance ratio column (0–1)' },
      { name: 'quality',      hint: 'Quality ratio column (0–1)' },
    ],
    buildExpression: ([a, p, q]) =>
      `ROUND(${a} * ${p} * ${q} * 100, 2)`,
  },
  {
    id: 'availability',
    label: 'Availability %',
    category: 'efficiency',
    description: 'Actual run time as a percentage of planned production time',
    params: [
      { name: 'run_time',     hint: 'Actual run / uptime (minutes or seconds)' },
      { name: 'planned_time', hint: 'Planned production time (same unit)' },
    ],
    buildExpression: ([r, p]) =>
      `ROUND(100.0 * ${r} / NULLIF(${p}, 0), 2)`,
  },
  {
    id: 'performance',
    label: 'Performance %',
    category: 'efficiency',
    description: 'Actual output rate as a percentage of ideal rate',
    params: [
      { name: 'actual_output', hint: 'Actual units produced' },
      { name: 'ideal_output',  hint: 'Ideal / target output for the run time' },
    ],
    buildExpression: ([a, i]) =>
      `ROUND(100.0 * ${a} / NULLIF(${i}, 0), 2)`,
  },
  {
    id: 'throughput_rate',
    label: 'Throughput Rate',
    category: 'efficiency',
    description: 'Units produced per unit of time',
    params: [
      { name: 'unit_count', hint: 'Number of units produced' },
      { name: 'time_span',  hint: 'Elapsed time (hours, minutes, etc.)' },
    ],
    buildExpression: ([u, t]) =>
      `ROUND(${u}::numeric / NULLIF(${t}, 0), 4)`,
  },

  // Comparison
  {
    id: 'delta_from_target',
    label: 'Delta from Target',
    category: 'comparison',
    description: 'Absolute difference between actual value and target',
    params: [
      { name: 'actual', hint: 'Actual measured value' },
      { name: 'target', hint: 'Target / spec value (column or literal)' },
    ],
    buildExpression: ([a, t]) => `${a} - ${t}`,
  },
  {
    id: 'pct_of_target',
    label: '% of Target',
    category: 'comparison',
    description: 'Actual value as a percentage of the target value',
    params: [
      { name: 'actual', hint: 'Actual measured value' },
      { name: 'target', hint: 'Target / spec value (column or literal)' },
    ],
    buildExpression: ([a, t]) =>
      `ROUND(100.0 * ${a} / NULLIF(${t}, 0), 2)`,
  },
  {
    id: 'variance_pct',
    label: 'Variance % from Budget',
    category: 'comparison',
    description: 'Percentage over/under budget or plan',
    params: [
      { name: 'actual', hint: 'Actual value' },
      { name: 'budget', hint: 'Budget / plan value' },
    ],
    buildExpression: ([a, b]) =>
      `ROUND(100.0 * (${a} - ${b}) / NULLIF(${b}, 0), 2)`,
  },

  // Statistical
  {
    id: 'running_pct',
    label: 'Running % of Total',
    category: 'statistical',
    description: 'Cumulative value as a percentage of the grand total (for Pareto charts)',
    params: [
      { name: 'running_sum', hint: 'Running sum window expression (e.g. a window column alias)' },
      { name: 'grand_total', hint: 'Grand total — use SUM(col) OVER () as a window column' },
    ],
    buildExpression: ([v, t]) =>
      `ROUND(100.0 * ${v} / NULLIF(${t}, 0), 2)`,
  },
  {
    id: 'z_score',
    label: 'Z-Score (standardised)',
    category: 'statistical',
    description: 'How many standard deviations a value is from the mean — requires pre-computed AVG and STDDEV columns',
    params: [
      { name: 'value',  hint: 'The individual observation column' },
      { name: 'mean',   hint: 'Population mean (AVG window column or subquery)' },
      { name: 'stddev', hint: 'Standard deviation (STDDEV window column or subquery)' },
    ],
    buildExpression: ([v, m, s]) =>
      `ROUND((${v} - ${m}) / NULLIF(${s}, 0), 4)`,
  },
  {
    id: 'control_limit_ucl',
    label: 'UCL (3σ Upper Control Limit)',
    category: 'statistical',
    description: 'Upper control limit for SPC charts: mean + 3 × stddev',
    params: [
      { name: 'mean',   hint: 'Process mean column' },
      { name: 'stddev', hint: 'Process standard deviation column' },
    ],
    buildExpression: ([m, s]) => `${m} + 3 * ${s}`,
  },
  {
    id: 'control_limit_lcl',
    label: 'LCL (3σ Lower Control Limit)',
    category: 'statistical',
    description: 'Lower control limit for SPC charts: mean − 3 × stddev',
    params: [
      { name: 'mean',   hint: 'Process mean column' },
      { name: 'stddev', hint: 'Process standard deviation column' },
    ],
    buildExpression: ([m, s]) => `${m} - 3 * ${s}`,
  },
]
