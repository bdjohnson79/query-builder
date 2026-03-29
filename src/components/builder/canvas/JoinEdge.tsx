'use client'
import { useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from 'reactflow'
import { useQueryStore } from '@/store/queryStore'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { X, ExternalLink } from 'lucide-react'
import type { JoinType } from '@/types/query'
import { Label } from '@/components/ui/label'

const JOIN_TYPES: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL OUTER', 'CROSS', 'LATERAL']

const JOIN_COLORS: Record<JoinType, string> = {
  INNER: '#3b82f6',
  LEFT: '#10b981',
  RIGHT: '#f59e0b',
  'FULL OUTER': '#8b5cf6',
  CROSS: '#ef4444',
  LATERAL: '#06b6d4',
}

interface JoinEdgeData {
  joinId: string
  joinType: JoinType
}

export function JoinEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<JoinEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const updateJoin = useQueryStore((s) => s.updateJoin)
  const removeJoin = useQueryStore((s) => s.removeJoin)
  const startEditingLateralJoin = useQueryStore((s) => s.startEditingLateralJoin)
  // Look up the live join from all possible contexts
  const liveJoin = useQueryStore((s) =>
    s.queryState.joins.find((j) => j.id === data?.joinId) ??
    s.queryState.unionQuery?.queryState.joins.find((j) => j.id === data?.joinId) ??
    s.queryState.ctes.flatMap((c) => c.queryState.joins).find((j) => j.id === data?.joinId)
  )
  const onExpression = liveJoin?.onExpression ?? ''
  const [customOn, setCustomOn] = useState(onExpression)
  const [lateralAliasInput, setLateralAliasInput] = useState(liveJoin?.lateralAlias ?? '')

  const joinType = data?.joinType ?? 'INNER'
  const isLateral = joinType === 'LATERAL'
  const hasCustomOn = !!liveJoin?.onExpression?.trim()
  const color = isLateral ? JOIN_COLORS.LATERAL : hasCustomOn ? '#6366f1' : JOIN_COLORS[joinType]

  const label = isLateral
    ? `LATERAL${liveJoin?.lateralAlias ? ` (${liveJoin.lateralAlias})` : ''}`
    : hasCustomOn ? 'CUSTOM' : joinType

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: color, strokeWidth: 2, strokeDasharray: isLateral ? '6 3' : undefined }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan absolute"
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold shadow-sm"
                style={{ backgroundColor: color, color: 'white', borderColor: color }}
              >
                {label}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Join Type</div>
                <div className="space-y-1">
                  {JOIN_TYPES.map((jt) => (
                    <button
                      key={jt}
                      className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                      onClick={() => data?.joinId && updateJoin(data.joinId, { type: jt })}
                    >
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: JOIN_COLORS[jt] }}
                      />
                      {jt}
                      {jt === joinType && (
                        <span className="ml-1 text-[10px] text-muted-foreground">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {isLateral ? (
                <>
                  <div className="border-t pt-2 space-y-1">
                    <Label className="text-xs">Lateral alias</Label>
                    <input
                      className="w-full rounded border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="lateral_sub"
                      value={lateralAliasInput}
                      onChange={(e) => setLateralAliasInput(e.target.value)}
                      onBlur={() =>
                        data?.joinId &&
                        updateJoin(data.joinId, {
                          lateralAlias: lateralAliasInput.trim() || undefined,
                          rightTableAlias: lateralAliasInput.trim() || 'lateral_sub',
                        })
                      }
                      spellCheck={false}
                    />
                  </div>

                  <div className="border-t pt-2 space-y-1">
                    <Label className="text-xs">Custom ON clause (optional, default: TRUE)</Label>
                    <textarea
                      className="w-full rounded border bg-background px-2 py-1 text-xs font-mono resize-y min-h-[48px] focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="TRUE"
                      value={customOn}
                      onChange={(e) => setCustomOn(e.target.value)}
                      onBlur={() =>
                        data?.joinId &&
                        updateJoin(data.joinId, {
                          onExpression: customOn.trim() || undefined,
                        })
                      }
                      spellCheck={false}
                    />
                  </div>

                  <div className="border-t pt-2 space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1 text-cyan-700 border-cyan-200 hover:bg-cyan-50"
                      onClick={() => data?.joinId && startEditingLateralJoin(data.joinId)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Edit Subquery
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => data?.joinId && removeJoin(data.joinId)}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Remove Join
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="border-t pt-2 space-y-1">
                    <Label className="text-xs">Custom ON clause (optional)</Label>
                    <textarea
                      className="w-full rounded border bg-background px-2 py-1 text-xs font-mono resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="e.g. de.time <@ sr.tsrange AND sr.value = 2"
                      value={customOn}
                      onChange={(e) => setCustomOn(e.target.value)}
                      onBlur={() =>
                        data?.joinId &&
                        updateJoin(data.joinId, {
                          onExpression: customOn.trim() || undefined,
                        })
                      }
                      spellCheck={false}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      When set, replaces the generated <code className="font-mono">ON a = b</code> clause.
                    </p>
                  </div>

                  <div className="border-t pt-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => data?.joinId && removeJoin(data.joinId)}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Remove Join
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
