'use client'
import { useState } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

export function SqlPreview() {
  const generatedSql = useQueryStore((s) => s.generatedSql)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedSql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          SQL Preview
        </span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1">
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="min-h-full p-3 text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-words bg-muted/30">
          {generatedSql}
        </pre>
      </div>
    </div>
  )
}
