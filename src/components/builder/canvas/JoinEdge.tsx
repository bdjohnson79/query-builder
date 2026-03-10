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
import { X } from 'lucide-react'
import type { JoinType } from '@/types/query'

const JOIN_TYPES: JoinType[] = ['INNER', 'LEFT', 'RIGHT', 'FULL OUTER', 'CROSS']

const JOIN_COLORS: Record<JoinType, string> = {
  INNER: '#3b82f6',
  LEFT: '#10b981',
  RIGHT: '#f59e0b',
  'FULL OUTER': '#8b5cf6',
  CROSS: '#ef4444',
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

  const joinType = data?.joinType ?? 'INNER'
  const color = JOIN_COLORS[joinType]

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: color, strokeWidth: 2 }}
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
                {joinType}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Join Type</div>
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
                  </button>
                ))}
              </div>
              <div className="mt-2 border-t pt-2">
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
            </PopoverContent>
          </Popover>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
