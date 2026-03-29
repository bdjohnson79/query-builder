'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  FORMULA_TEMPLATES,
  FORMULA_CATEGORIES,
  type FormulaTemplate,
  type FormulaCategory,
} from '@/lib/formula-templates'
import { cn } from '@/lib/utils'

interface FormulaWizardDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (expression: string, alias: string) => void
}

export function FormulaWizardDialog({ open, onClose, onAdd }: FormulaWizardDialogProps) {
  const [activeCategory, setActiveCategory] = useState<FormulaCategory>('quality')
  const [selected, setSelected] = useState<FormulaTemplate | null>(null)
  const [paramValues, setParamValues] = useState<string[]>([])
  const [alias, setAlias] = useState('')

  const filteredTemplates = FORMULA_TEMPLATES.filter((t) => t.category === activeCategory)

  const handleSelect = (tmpl: FormulaTemplate) => {
    setSelected(tmpl)
    setParamValues(tmpl.params.map(() => ''))
    setAlias(tmpl.id)
  }

  const handleBack = () => {
    setSelected(null)
    setParamValues([])
    setAlias('')
  }

  const handleClose = () => {
    setSelected(null)
    setParamValues([])
    setAlias('')
    onClose()
  }

  const preview = selected && paramValues.every((v) => v.trim())
    ? selected.buildExpression(paramValues.map((v) => v.trim()))
    : null

  const handleAdd = () => {
    if (!preview || !alias.trim()) return
    onAdd(preview, alias.trim())
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Formula Wizard</DialogTitle>
        </DialogHeader>

        {!selected ? (
          // Step 1 — pick a formula
          <div className="space-y-3">
            {/* Category tabs */}
            <div className="flex gap-1 border-b pb-2">
              {FORMULA_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    activeCategory === cat.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Formula cards */}
            <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {filteredTemplates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => handleSelect(tmpl)}
                  className="text-left rounded border px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="text-xs font-medium">{tmpl.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {tmpl.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Step 2 — fill parameters
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="rounded border bg-muted/20 px-3 py-2">
              <div className="text-xs font-medium">{selected.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{selected.description}</div>
            </div>

            {/* Parameter inputs */}
            <div className="space-y-2">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Parameters</Label>
              {selected.params.map((param, i) => (
                <div key={param.name} className="space-y-0.5">
                  <Label className="text-xs">{param.name}</Label>
                  <Input
                    value={paramValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...paramValues]
                      next[i] = e.target.value
                      setParamValues(next)
                    }}
                    placeholder={param.hint}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              ))}
            </div>

            {/* Alias */}
            <div className="space-y-0.5">
              <Label className="text-xs">Column alias <span className="text-destructive">*</span></Label>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. yield_pct"
                className="h-7 text-xs"
              />
            </div>

            {/* Expression preview */}
            {preview && (
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Expression preview</Label>
                <pre className="rounded bg-muted/50 border px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {preview}
                </pre>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {selected ? (
            <>
              <Button variant="outline" size="sm" onClick={handleBack}>Back</Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!preview || !alias.trim()}
              >
                Add to SELECT
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
