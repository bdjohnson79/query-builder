'use client'
import { useSchemaStore } from '@/store/schemaStore'
import { useQueryStore } from '@/store/queryStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QUERY_TEMPLATES, resolveTemplate } from '@/lib/templates/query-templates'
import { LayoutTemplate, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, string> = {
  'time-series': 'Time Series',
  'aggregation': 'Aggregation',
  'grafana-variable': 'Grafana Variables',
}

function missingTables(tableNames: string[], allTables: { name: string }[]): string[] {
  return tableNames.filter((name) => !allTables.some((t) => t.name === name))
}

export function TemplateLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const schemas        = useSchemaStore((s) => s.schemas)
  const tables         = useSchemaStore((s) => s.tables)
  const columns        = useSchemaStore((s) => s.columns)
  const loadQueryState = useQueryStore((s) => s.loadQueryState)
  const setUserEditedSql = useQueryStore((s) => s.setUserEditedSql)

  const handleLoad = (templateId: string) => {
    const result = resolveTemplate(templateId, { schemas, tables, columns })
    if (!result) return
    loadQueryState(result.queryState)
    if (result.userEditedSql) {
      setUserEditedSql(result.userEditedSql)
    }
    onClose()
  }

  const categories = ['time-series', 'aggregation', 'grafana-variable'] as const

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Query Templates
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {categories.map((cat) => {
            const templates = QUERY_TEMPLATES.filter((t) => t.category === cat)
            if (templates.length === 0) return null
            return (
              <div key={cat}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[cat]}
                </h3>
                <div className="grid gap-2">
                  {templates.map((tpl) => {
                    const missing = missingTables(tpl.tableNames, tables)
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => handleLoad(tpl.id)}
                        className="w-full rounded-lg border bg-background p-3 text-left hover:bg-muted/40 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-sm">{tpl.name}</span>
                          {missing.length > 0 && (
                            <span
                              className="flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200"
                              title={`Tables not in schema: ${missing.join(', ')}`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Missing tables
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                          {tpl.description}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {tpl.tableNames.map((name) => (
                            <span
                              key={name}
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-mono',
                                missing.includes(name)
                                  ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
