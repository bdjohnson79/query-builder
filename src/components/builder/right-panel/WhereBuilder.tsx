'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { getActiveQueryState, getLateralOuterScopeTables } from '@/store/queryStore'
import { useJsonStructureStore } from '@/store/jsonStructureStore'
import QueryBuilder, { defaultOperators } from 'react-querybuilder'
import type { ValueEditorProps } from 'react-querybuilder'
import 'react-querybuilder/dist/query-builder.css'
import type { FilterGroup } from '@/types/query'
import type { RuleGroupType } from 'react-querybuilder'
import { flattenToPathOptions } from '@/lib/json-structure/infer'
import { Check, Copy } from 'lucide-react'

const GRAFANA_OPERATORS = [
  { name: '$__timeFilter',        label: '$__timeFilter(col)' },
  { name: '$__unixEpochFilter',   label: '$__unixEpochFilter(col)' },
  { name: '$__unixEpochNanoFilter', label: '$__unixEpochNanoFilter(col)' },
  { name: 'timeLookback',         label: 'time lookback BETWEEN (col, interval)' },
]

const ALL_OPERATORS = [
  ...defaultOperators,
  { name: 'separator', label: '──────────' },
  ...GRAFANA_OPERATORS,
]

const GRAFANA_OP_NAMES = new Set(GRAFANA_OPERATORS.map((o) => o.name))

// ---------------------------------------------------------------------------
// Common Grafana variables helper
// ---------------------------------------------------------------------------

const COMMON_VARS = ['$area', '$machine']

function VarCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-mono hover:bg-muted/50 transition-colors"
    >
      {copied
        ? <><Check className="h-2.5 w-2.5 text-green-500" /> copied</>
        : <><Copy className="h-2.5 w-2.5 text-muted-foreground" /> {text}</>}
    </button>
  )
}

function BetweenValueEditor({ value, handleOnChange }: ValueEditorProps) {
  const parts = String(value ?? '').split(',')
  const val1 = parts[0] ?? ''
  const val2 = parts[1] ?? ''
  return (
    <div className="flex items-center gap-1 w-full">
      <input
        className="flex-1 min-w-0"
        value={val1}
        onChange={(e) => handleOnChange(`${e.target.value},${val2}`)}
        placeholder="from"
      />
      <span className="shrink-0 text-[10px] text-slate-400 px-0.5">and</span>
      <input
        className="flex-1 min-w-0"
        value={val2}
        onChange={(e) => handleOnChange(`${val1},${e.target.value}`)}
        placeholder="to"
      />
    </div>
  )
}

function TimeLookbackValueEditor({ value, handleOnChange }: ValueEditorProps) {
  return (
    <div className="flex flex-col gap-0.5 w-full">
      <input
        className="w-full"
        value={String(value ?? '')}
        onChange={(e) => handleOnChange(e.target.value)}
        placeholder="e.g. 30d or 1 hour"
      />
      <span className="text-[9px] text-muted-foreground leading-tight">
        Generates: col BETWEEN $__timeFrom()::timestamp - INTERVAL &apos;…&apos; AND $__timeFrom()::timestamp
      </span>
    </div>
  )
}

function ValueEditor(props: ValueEditorProps) {
  if (props.operator === 'between' || props.operator === 'notBetween') {
    return <BetweenValueEditor {...props} />
  }
  if (props.operator === 'timeLookback') {
    return <TimeLookbackValueEditor {...props} />
  }
  // Grafana macro operators need no value input — the column is the argument
  if (GRAFANA_OP_NAMES.has(props.operator)) {
    return <span className="text-[10px] text-muted-foreground italic px-1">no value needed</span>
  }
  // Default: single input with Grafana variable badge
  const isGrafanaVar = /^\$[a-zA-Z_]/.test(String(props.value ?? ''))
  return (
    <>
      <input
        className="w-full"
        value={String(props.value ?? '')}
        onChange={(e) => props.handleOnChange(e.target.value)}
      />
      {isGrafanaVar && (
        <span className="text-[9px] font-medium text-blue-500 leading-none">Grafana variable — emitted unquoted</span>
      )}
    </>
  )
}

function toRQB(group: FilterGroup): RuleGroupType {
  return {
    id: group.id,
    combinator: group.combinator.toLowerCase(),
    rules: group.rules.map((r) => {
      if ('rules' in r) return toRQB(r as FilterGroup)
      return { id: r.id, field: r.field, operator: r.operator, value: r.value }
    }),
  } as RuleGroupType
}

function fromRQB(group: RuleGroupType): FilterGroup {
  return {
    id: group.id ?? crypto.randomUUID(),
    combinator: (group.combinator?.toUpperCase() ?? 'AND') as 'AND' | 'OR',
    rules: (group.rules ?? []).map((r) => {
      if ('rules' in r) return fromRQB(r as RuleGroupType)
      const rule = r as { id?: string; field: string; operator: string; value: unknown }
      return {
        id: rule.id ?? crypto.randomUUID(),
        field: rule.field,
        operator: rule.operator,
        value: rule.value as string,
      }
    }),
  }
}

interface Props {
  mode: 'where' | 'having'
}

export function WhereBuilder({ mode }: Props) {
  const where        = useQueryStore((s) => getActiveQueryState(s).where)
  const having       = useQueryStore((s) => getActiveQueryState(s).having)
  const tables       = useQueryStore((s) => getActiveQueryState(s).tables)
  const jsonbMappings = useQueryStore((s) => getActiveQueryState(s).jsonbMappings)
  const outerTables  = useQueryStore((s) => getLateralOuterScopeTables(s))
  const setWhere = useQueryStore((s) => s.setWhere)
  const setHaving = useQueryStore((s) => s.setHaving)
  const structures = useJsonStructureStore((s) => s.structures)

  const regularFields = tables.flatMap((t) =>
    t.columns.map((c) => ({
      name: `${t.alias}.${c.name}`,
      label: `${t.alias}.${c.name}`,
    }))
  )

  const jsonbFields = jsonbMappings.flatMap((m) => {
    const structure = structures.find((s) => s.id === m.structureId)
    if (!structure) return []
    return flattenToPathOptions(structure.definition.fields, m.tableAlias, m.columnName).map((opt) => ({
      name: `${m.tableAlias}::jsonb::${m.columnName}::${opt.path}`,
      label: `${m.tableAlias}.${m.columnName} → ${opt.label}`,
    }))
  })

  const outerFields = outerTables.flatMap((t) =>
    t.columns.map((c) => ({
      name: `${t.alias}.${c.name}`,
      label: `[outer] ${t.alias}.${c.name}`,
    }))
  )

  const fields = [...regularFields, ...jsonbFields, ...outerFields]

  const query = toRQB(mode === 'where' ? where : having)

  const handleChange = (q: RuleGroupType) => {
    const group = fromRQB(q)
    if (mode === 'where') setWhere(group)
    else setHaving(group)
  }

  return (
    <div className="p-2 w-full space-y-2">
      {fields.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-border/40 bg-muted/20 px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground font-medium shrink-0">Variables:</span>
          {COMMON_VARS.map((v) => (
            <VarCopyButton key={v} text={v} />
          ))}
          <span className="text-[10px] text-muted-foreground leading-tight">
            — type or paste into a value field; Grafana substitutes at render time
          </span>
        </div>
      )}
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Add tables to the canvas to build filters.
        </p>
      ) : (
        <QueryBuilder
          fields={fields}
          query={query}
          onQueryChange={handleChange}
          operators={ALL_OPERATORS}
          controlElements={{ valueEditor: ValueEditor }}
        />
      )}
    </div>
  )
}
