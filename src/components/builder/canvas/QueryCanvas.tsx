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
import type { TableInstance, JoinDef, CTEDef } from '@/types/query'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'
import { cn } from '@/lib/utils'
import { CanvasEmptyState } from './CanvasEmptyState'

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

function joinToEdge(join: JoinDef, tables: TableInstance[]): Edge {
  const leftTable = tables.find((t) => t.alias === join.leftTableAlias)
  const rightTable = tables.find((t) => t.alias === join.rightTableAlias)
  return {
    id: join.id,
    source: leftTable?.id ?? join.leftTableAlias,
    sourceHandle: `${join.leftTableAlias}__${join.leftColumn}__source`,
    target: rightTable?.id ?? join.rightTableAlias,
    targetHandle: `${join.rightTableAlias}__${join.rightColumn}__target`,
    type: 'joinEdge',
    data: { joinId: join.id, joinType: join.type },
  }
}

interface QueryCanvasProps {
  onStartTour: () => void
}

export function QueryCanvas({ onStartTour }: QueryCanvasProps) {
  const rootQueryState = useQueryStore((s) => s.queryState)
  const activeCteId = useQueryStore((s) => s.activeCteId)
  // When editing a CTE, operate on that CTE's queryState; else root
  const queryState = activeCteId
    ? (rootQueryState.ctes.find((c) => c.id === activeCteId)?.queryState ?? rootQueryState)
    : rootQueryState
  const addTable = useQueryStore((s) => s.addTable)
  const updateTablePosition = useQueryStore((s) => s.updateTablePosition)
  const addJoin = useQueryStore((s) => s.addJoin)

  const initialNodes = useMemo(
    () => queryState.tables.map(tableToNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const initialEdges = useMemo(
    () => queryState.joins.map((j) => joinToEdge(j, queryState.tables)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync store → nodes/edges
  useMemo(() => {
    setNodes(queryState.tables.map(tableToNode))
    setEdges(queryState.joins.map((j) => joinToEdge(j, queryState.tables)))
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

      const dropType = active.data.current?.type

      if (dropType === 'table') {
        const { table, schema, columns } = active.data.current as {
          table: AppTable
          schema: AppSchema
          columns: AppColumn[]
        }
        const existing = new Set(queryState.tables.map((t) => t.alias))
        let alias = table.name
        let counter = 2
        while (existing.has(alias)) alias = `${table.name}_${counter++}`
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
      } else if (dropType === 'cte') {
        const { cte } = active.data.current as { cte: CTEDef }
        const existing = new Set(queryState.tables.map((t) => t.alias))
        let alias = cte.name
        let counter = 2
        while (existing.has(alias)) alias = `${cte.name}_${counter++}`
        // Derive columns: for raw SQL CTEs use outputColumns; for visual CTEs derive from selectedColumns
        const cteColumns = cte.rawSql !== undefined && cte.rawSql !== null
          ? (cte.outputColumns ?? []).map((col, idx) => ({
              id: idx,
              name: col.name,
              pgType: col.pgType,
              isNullable: true,
              isPrimaryKey: false,
            }))
          : cte.queryState.selectedColumns.map((sc, idx) => ({
              id: idx,
              name: sc.alias ?? sc.columnName,
              pgType: 'text', // type unknown for visual CTEs without schema introspection
              isNullable: true,
              isPrimaryKey: false,
            }))
        const instance: TableInstance = {
          id: crypto.randomUUID(),
          tableId: 0,
          tableName: cte.name,
          schemaName: '',
          alias,
          cteId: cte.id,
          position: { x: 100 + queryState.tables.length * 280, y: 100 },
          columns: cteColumns,
        }
        addTable(instance)
      }
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
        <CanvasEmptyState onStartTour={onStartTour} />
      )}
    </div>
  )
}
