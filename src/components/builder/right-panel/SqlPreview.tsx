'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Copy, Check, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { validateUnion } from '@/lib/sql-builder/union-validator'

export function SqlPreview() {
  const generatedSql   = useQueryStore((s) => s.generatedSql)
  const userEditedSql  = useQueryStore((s) => s.userEditedSql)
  const setUserEditedSql = useQueryStore((s) => s.setUserEditedSql)
  const queryState = useQueryStore((s) => s.queryState)
  const [copied, setCopied]       = useState(false)

  const unionValidation = queryState.unionQuery
    ? validateUnion(queryState, queryState.unionQuery)
    : null

  const isManual  = userEditedSql !== null
  const displaySql = isManual ? userEditedSql : generatedSql

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserEditedSql(e.target.value)
  }

  const handleRevert = () => {
    setUserEditedSql(null)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displaySql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0 gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
          SQL Preview
        </span>

        {/* Manually-edited badge + revert */}
        {isManual && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 shrink-0">
              Edited
            </span>
            <button
              onClick={handleRevert}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Discard manual edits and restore generated SQL"
            >
              <RotateCcw className="h-3 w-3" />
              Revert
            </button>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1 shrink-0">
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {/* Editable SQL textarea */}
      <div className="flex-1 overflow-hidden relative">
        <textarea
          className="absolute inset-0 w-full h-full resize-none p-3 text-xs font-mono leading-relaxed text-foreground bg-muted/30 focus:outline-none focus:bg-background transition-colors"
          value={displaySql}
          onChange={handleChange}
          spellCheck={false}
        />
      </div>

      {/* UNION validation status */}
      {unionValidation && (
        <div className="border-t px-3 py-1.5 shrink-0">
          {unionValidation.valid ? (
            <p className="flex items-center gap-1 text-[10px] text-green-700">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              UNION columns match
            </p>
          ) : (
            <div className="space-y-0.5">
              {unionValidation.warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1 text-[10px] text-amber-700">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
                  {w.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer hint when not edited */}
      {!isManual && !unionValidation && (
        <div className="border-t px-3 py-1.5 shrink-0">
          <p className="text-[10px] text-muted-foreground">
            You can edit the SQL directly — changes are preserved until you click Revert or Reset.
          </p>
        </div>
      )}
    </div>
  )
}
