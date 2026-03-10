'use client'
import { useQueryStore } from '@/store/queryStore'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LimitOffsetPanel() {
  const limit = useQueryStore((s) => s.queryState.limit)
  const offset = useQueryStore((s) => s.queryState.offset)
  const setLimit = useQueryStore((s) => s.setLimit)
  const setOffset = useQueryStore((s) => s.setOffset)

  return (
    <div className="grid grid-cols-2 gap-3 p-2">
      <div className="space-y-1">
        <Label className="text-xs">LIMIT</Label>
        <Input
          type="number"
          min={1}
          placeholder="None"
          value={limit ?? ''}
          onChange={(e) => setLimit(e.target.value === '' ? null : Number(e.target.value))}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">OFFSET</Label>
        <Input
          type="number"
          min={0}
          placeholder="None"
          value={offset ?? ''}
          onChange={(e) => setOffset(e.target.value === '' ? null : Number(e.target.value))}
          className="h-8 text-xs"
        />
      </div>
    </div>
  )
}
