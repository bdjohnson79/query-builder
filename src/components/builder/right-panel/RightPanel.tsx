'use client'
import { useState } from 'react'
import { SqlPreview } from './SqlPreview'
import { WhereBuilder } from './WhereBuilder'
import { GroupByPanel } from './GroupByPanel'
import { OrderByPanel } from './OrderByPanel'
import { LimitOffsetPanel } from './LimitOffsetPanel'
import { WindowFunctionPanel } from './WindowFunctionPanel'
import { CtePanel } from './CtePanel'
import { ScrollArea } from '@/components/ui/scroll-area'

type Tab = 'sql' | 'where' | 'having' | 'groupby' | 'orderby' | 'limit' | 'windows' | 'ctes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'sql', label: 'SQL' },
  { id: 'where', label: 'WHERE' },
  { id: 'having', label: 'HAVING' },
  { id: 'groupby', label: 'GROUP BY' },
  { id: 'orderby', label: 'ORDER BY' },
  { id: 'limit', label: 'LIMIT' },
  { id: 'windows', label: 'Windows' },
  { id: 'ctes', label: 'CTEs' },
]

export function RightPanel() {
  const [active, setActive] = useState<Tab>('sql')

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-0.5 border-b bg-muted/30 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              active === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {active === 'sql' && <SqlPreview />}
        {active === 'where' && (
          <ScrollArea className="h-full">
            <WhereBuilder mode="where" />
          </ScrollArea>
        )}
        {active === 'having' && (
          <ScrollArea className="h-full">
            <WhereBuilder mode="having" />
          </ScrollArea>
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
        {active === 'limit' && (
          <ScrollArea className="h-full">
            <LimitOffsetPanel />
          </ScrollArea>
        )}
        {active === 'windows' && (
          <ScrollArea className="h-full">
            <WindowFunctionPanel />
          </ScrollArea>
        )}
        {active === 'ctes' && (
          <ScrollArea className="h-full">
            <CtePanel />
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
