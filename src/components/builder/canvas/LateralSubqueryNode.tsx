'use client'
import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { ExternalLink } from 'lucide-react'
import { useQueryStore } from '@/store/queryStore'

export interface LateralNodeData {
  joinId: string
  lateralAlias: string
  outputColumns: { name: string; pgType: string }[]
}

export const LateralSubqueryNode = memo(function LateralSubqueryNode({
  data,
}: NodeProps<LateralNodeData>) {
  const startEditingLateralJoin = useQueryStore((s) => s.startEditingLateralJoin)

  return (
    <div className="rounded-md border-2 border-cyan-400 bg-background shadow-md min-w-[180px] max-w-[260px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 rounded-t-md bg-cyan-500 px-2 py-1.5">
        <span className="text-xs font-semibold text-white truncate">
          LATERAL: {data.lateralAlias}
        </span>
        <button
          className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-white/90 hover:bg-cyan-400 transition-colors shrink-0"
          onClick={() => startEditingLateralJoin(data.joinId)}
          title="Edit subquery"
        >
          <ExternalLink className="h-3 w-3" />
          Edit
        </button>
      </div>

      {/* Output columns */}
      <div className="divide-y">
        {data.outputColumns.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground italic">
            No columns — edit subquery to add a SELECT
          </div>
        ) : (
          data.outputColumns.map((col) => (
            <div key={col.name} className="relative flex items-center gap-2 px-3 py-1">
              <Handle
                type="source"
                position={Position.Right}
                id={`${data.lateralAlias}__${col.name}__source`}
                className="!h-2 !w-2 !border !border-cyan-400 !bg-background"
                style={{ right: -5 }}
              />
              <Handle
                type="target"
                position={Position.Left}
                id={`${data.lateralAlias}__${col.name}__target`}
                className="!h-2 !w-2 !border !border-cyan-400 !bg-background"
                style={{ left: -5 }}
              />
              <span className="text-xs font-medium truncate">{col.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground truncate shrink-0">
                {col.pgType}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
})
