'use client'
import { useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import { useQueryStore } from '@/store/queryStore'
import { TableNode } from './TableNode'
import { JoinEdge } from './JoinEdge'
import type { TableInstance, JoinDef } from '@/types/query'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'
import { cn } from '@/lib/utils'

const nodeTypes = { tableNode: TableNode }
const edgeTypes = { joinEdge: JoinEdge }

function tableToNode(instance: TableInstance): Node {
  return {
    id: instance.id,
    type: 'tableNode',
    position: instance.position,
    data: { instance },
  }
}

function joinToEdge(join: JoinDef): Edge {
  return {
    id: join.id,
    source: `${join.leftTableAlias}-node`,
    sourceHandle: `${join.leftTableAlias}__${join.leftColumn}__source`,
    target: `${join.rightTableAlias}-node`,
    targetHandle: `${join.rightTableAlias}__${join.rightColumn}__target`,
    type: 'joinEdge',
    data: { joinId: join.id, joinType: join.type },
  }
}

export function QueryCanvas() {
  const { queryState, addTable, updateTablePosition, addJoin } = useQueryStore((s) => ({
    queryState: s.queryState,
    addTable: s.addTable,
    updateTablePosition: s.updateTablePosition,
    addJoin: s.addJoin,
  }))

  const initialNodes = useMemo(
    () => queryState.tables.map(tableToNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const initialEdges = useMemo(
    () => queryState.joins.map(joinToEdge),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync store → nodes/edges
  useMemo(() => {
    setNodes(queryState.tables.map(tableToNode))
    setEdges(queryState.joins.map(joinToEdge))
  }, [queryState.tables, queryState.joins, setNodes, setEdges])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return

      // Parse handles: "alias__column__source" / "alias__column__target"
      const [leftAlias, leftCol] = connection.sourceHandle.split('__')
      const [rightAlias, rightCol] = connection.targetHandle.split('__')

      const join: JoinDef = {
        id: crypto.randomUUID(),
        type: 'INNER',
        leftTableAlias: leftAlias,
        leftColumn: leftCol,
        rightTableAlias: rightAlias,
        rightColumn: rightCol,
      }
      addJoin(join)
    },
    [addJoin]
  )

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      updateTablePosition(node.id, node.position)
    },
    [updateTablePosition]
  )

  // DnD-kit drop zone for tables dragged from the left panel
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })

  useDndMonitor({
    onDragEnd(event) {
      const { active, over } = event
      if (over?.id !== 'canvas') return
      if (active.data.current?.type !== 'table') return

      const { table, schema, columns } = active.data.current as {
        table: AppTable
        schema: AppSchema
        columns: AppColumn[]
      }

      // Check not already on canvas
      if (queryState.tables.find((t) => t.tableId === table.id)) return

      const alias = `${table.name}_${queryState.tables.length + 1}`
      const instance: TableInstance = {
        id: crypto.randomUUID(),
        tableId: table.id,
        tableName: table.name,
        schemaName: schema.name,
        alias,
        position: { x: 100 + queryState.tables.length * 280, y: 100 },
        columns: columns.map((c) => ({
          id: c.id,
          name: c.name,
          pgType: c.pgType,
          isNullable: c.isNullable,
          isPrimaryKey: c.isPrimaryKey,
        })),
      }
      addTable(instance)
    },
  })

  return (
    <div ref={setNodeRef} className={cn('h-full w-full', isOver && 'bg-blue-50/30')}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode="Delete"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      </ReactFlow>
      {queryState.tables.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 px-8 py-12 text-center">
            <p className="text-lg font-medium text-muted-foreground">Drag tables here</p>
            <p className="text-sm text-muted-foreground/70">
              From the left panel to start building your query
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
