'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SqlPreview } from './SqlPreview'
import { WhereBuilder } from './WhereBuilder'
import { GroupByPanel } from './GroupByPanel'
import { OrderByPanel } from './OrderByPanel'
import { LimitOffsetPanel } from './LimitOffsetPanel'
import { WindowFunctionPanel } from './WindowFunctionPanel'
import { CtePanel } from './CtePanel'
import { GrafanaPanel } from './GrafanaPanel'
import { JsonbMappingPanel } from './JsonbMappingPanel'
import { SelectColumnsPanel } from './SelectColumnsPanel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type Tab =
  | 'grafana' | 'sql' | 'columns' | 'where' | 'groupby' | 'orderby'
  | 'having' | 'limit' | 'windows' | 'ctes' | 'jsonb'

interface TabDef {
  id: Tab
  label: string
  tooltip: string
}

const ESSENTIAL_TABS: TabDef[] = [
  { id: 'grafana',  label: 'Grafana',    tooltip: 'Add Grafana time-range macros and copy SQL for your panel.' },
  { id: 'sql',      label: 'SQL',        tooltip: 'See and edit the generated SQL.' },
  { id: 'columns',  label: 'Columns',    tooltip: 'Manage SELECT columns: set aliases, aggregates, and add computed expressions or CASE WHEN.' },
  { id: 'where',    label: 'WHERE',      tooltip: 'Filter rows — e.g. limit results to one line, shift, or time range.' },
  { id: 'groupby',  label: 'GROUP BY',   tooltip: 'Aggregate rows by a column. Required when using SUM, COUNT, or AVG.' },
  { id: 'orderby',  label: 'ORDER BY',   tooltip: 'Sort results. Mandatory for Grafana time-series panels — sort by your time column.' },
]

const ADVANCED_TABS: TabDef[] = [
  { id: 'having',  label: 'HAVING',   tooltip: 'Filter after aggregation. Use after GROUP BY to filter on aggregate values.' },
  { id: 'limit',   label: 'LIMIT',    tooltip: 'Return only the first N rows.' },
  { id: 'windows', label: 'Windows',  tooltip: 'Add window functions like ROW_NUMBER or running totals.' },
  { id: 'ctes',    label: 'CTEs',     tooltip: 'Define reusable named sub-queries (WITH clauses) for complex analyses.' },
  { id: 'jsonb',   label: 'JSONB',    tooltip: 'Map JSONB columns to typed fields for easier value extraction.' },
]

function TabButton({
  tab,
  active,
  onClick,
  size = 'normal',
}: {
  tab: TabDef
  active: boolean
  onClick: () => void
  size?: 'normal' | 'small'
}) {
  return (
    // CSS tooltip via group + sibling visibility
    <div className="group relative">
      <button
        onClick={onClick}
        className={cn(
          'rounded px-2 py-1 font-medium transition-colors',
          size === 'small' ? 'text-[10px]' : 'text-xs',
          active
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {tab.label}
        {/* Orange dot on Grafana tab when not active — draws eye to the output destination */}
        {tab.id === 'grafana' && !active && (
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-400" />
        )}
      </button>

      {/* CSS-only tooltip — appears on hover with no JS */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 group-hover:block">
        <div className="rounded border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
          {tab.tooltip}
          {/* Tooltip caret */}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-border" />
        </div>
      </div>
    </div>
  )
}

export function RightPanel() {
  const [active, setActive] = useState<Tab>('grafana')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const activeTab = [...ESSENTIAL_TABS, ...ADVANCED_TABS].find((t) => t.id === active)
  const activeIsAdvanced = ADVANCED_TABS.some((t) => t.id === active)

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Essential tab bar */}
      <div className="flex flex-wrap gap-0.5 border-b bg-muted/30 p-1">
        {ESSENTIAL_TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={active === tab.id}
            onClick={() => setActive(tab.id)}
          />
        ))}
      </div>

      {/* Advanced section toggle */}
      <button
        onClick={() => setAdvancedOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-1 font-medium">
          {advancedOpen
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />
          }
          Advanced
        </span>
        {/* Show which advanced tab is active while section is collapsed */}
        {activeIsAdvanced && !advancedOpen && activeTab && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            {activeTab.label}
          </span>
        )}
      </button>

      {/* Advanced tab bar — only shown when open */}
      {advancedOpen && (
        <div className="flex flex-wrap gap-0.5 border-b bg-muted/20 px-1 py-0.5">
          {ADVANCED_TABS.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={active === tab.id}
              onClick={() => setActive(tab.id)}
              size="small"
            />
          ))}
        </div>
      )}

      {/* Tab content — all panels remain mounted; only display changes */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {active === 'grafana'  && <GrafanaPanel />}
        {active === 'sql'      && <SqlPreview />}
        {active === 'columns'  && <SelectColumnsPanel />}
        {active === 'where'   && (
          <div className="h-full overflow-y-auto overflow-x-hidden">
            <WhereBuilder mode="where" />
          </div>
        )}
        {active === 'having'  && (
          <div className="h-full overflow-y-auto overflow-x-hidden">
            <WhereBuilder mode="having" />
          </div>
        )}
        {active === 'groupby' && (
          <ScrollArea className="h-full">
            <GroupByPanel />
          </ScrollArea>
        )}
        {active === 'orderby' && (
          <ScrollArea className="h-full">
            <OrderByPanel />
          </ScrollArea>
        )}
        {active === 'limit'   && (
          <ScrollArea className="h-full">
            <LimitOffsetPanel />
          </ScrollArea>
        )}
        {active === 'windows' && (
          <ScrollArea className="h-full">
            <WindowFunctionPanel />
          </ScrollArea>
        )}
        {active === 'ctes'    && (
          <ScrollArea className="h-full">
            <CtePanel />
          </ScrollArea>
        )}
        {active === 'jsonb'   && (
          <ScrollArea className="h-full">
            <JsonbMappingPanel />
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
