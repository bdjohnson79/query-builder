'use client'
import { useQueryStore } from '@/store/queryStore'
import QueryBuilder from 'react-querybuilder'
import 'react-querybuilder/dist/query-builder.css'
import type { FilterGroup } from '@/types/query'
import type { RuleGroupType } from 'react-querybuilder'

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
  const { where, having, tables, setWhere, setHaving } = useQueryStore((s) => ({
    where: s.queryState.where,
    having: s.queryState.having,
    tables: s.queryState.tables,
    setWhere: s.setWhere,
    setHaving: s.setHaving,
  }))

  const fields = tables.flatMap((t) =>
    t.columns.map((c) => ({
      name: `${t.alias}.${c.name}`,
      label: `${t.alias}.${c.name}`,
    }))
  )

  const query = toRQB(mode === 'where' ? where : having)

  const handleChange = (q: RuleGroupType) => {
    const group = fromRQB(q)
    if (mode === 'where') setWhere(group)
    else setHaving(group)
  }

  return (
    <div className="p-2">
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Add tables to the canvas to build filters.
        </p>
      ) : (
        <QueryBuilder fields={fields} query={query} onQueryChange={handleChange} />
      )}
    </div>
  )
}
