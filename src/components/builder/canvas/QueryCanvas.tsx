'use client'
import { useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import { useQueryStore } from '@/store/queryStore'
import { getLateralOuterScopeTables } from '@/store/queryStore'
import { TableNode } from './TableNode'
import { JoinEdge } from './JoinEdge'
import { LateralSubqueryNode, type LateralNodeData } from './LateralSubqueryNode'
import type { TableInstance, JoinDef, CTEDef, QueryState } from '@/types/query'
import type { AppTable, AppColumn, AppSchema } from '@/types/schema'
import { cn } from '@/lib/utils'
import { CanvasEmptyState } from './CanvasEmptyState'

const LATERAL_NODE_PREFIX = 'lateral__'

const nodeTypes = { tableNode: TableNode, lateral: LateralSubqueryNode }
const edgeTypes = { joinEdge: JoinEdge }

function tableToNode(instance: TableInstance): Node {
  return {
    id: instance.id,
    type: 'tableNode',
    position: instance.position,
    data: { instance },
  }
}

function lateralToNode(join: JoinDef, index: number): Node {
  const cols = join.lateralSubquery?.selectedColumns.map((sc) => ({
    name: sc.alias ?? sc.columnName,
    pgType: 'text',
  })) ?? []

  const data: LateralNodeData = {
    joinId: join.id,
    lateralAlias: join.lateralAlias ?? 'lateral_sub',
    outputColumns: cols,
  }

  return {
    id: `${LATERAL_NODE_PREFIX}${join.id}`,
    type: 'lateral',
    position: join.canvasPosition ?? { x: 600 + index * 220, y: 100 },
    data,
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

function outerTableToGhostNode(instance: TableInstance, index: number): Node {
  return {
    id: `outer__${instance.id}`,
    type: 'tableNode',
    position: { x: -180, y: index * 180 },
    data: { instance, isOuterScope: true },
    draggable: false,
    selectable: false,
    connectable: false,
  }
}

function buildNodes(qs: QueryState, outerTables: TableInstance[] = []): Node[] {
  const tableNodes = qs.tables.map(tableToNode)
  const lateralNodes = qs.joins
    .filter((j) => j.type === 'LATERAL')
    .map((j, i) => lateralToNode(j, i))
  const ghostNodes = outerTables.map((t, i) => outerTableToGhostNode(t, i))
  return [...tableNodes, ...lateralNodes, ...ghostNodes]
}

function buildEdges(qs: QueryState): Edge[] {
  return qs.joins
    .filter((j) => j.type !== 'LATERAL')
    .map((j) => joinToEdge(j, qs.tables))
}

// Resolve the active queryState for the canvas based on editing modes.
// Priority matches getActiveQueryState in queryStore.ts — keep in sync.
function resolveCanvasQueryState(
  rootQueryState: QueryState,
  activeCteId: string | null,
  activeLateralJoinId: string | null,
  activeQueryPart: 'main' | 'union',
): QueryState {
  // Lateral subquery takes highest priority — searched in all contexts
  if (activeLateralJoinId) {
    const rootJoin = rootQueryState.joins.find((j) => j.id === activeLateralJoinId)
    if (rootJoin?.lateralSubquery) return rootJoin.lateralSubquery
    const rootUnionJoin = rootQueryState.unionQuery?.queryState.joins.find(
      (j) => j.id === activeLateralJoinId
    )
    if (rootUnionJoin?.lateralSubquery) return rootUnionJoin.lateralSubquery
    for (const cte of rootQueryState.ctes) {
      const cteJoin = cte.queryState.joins.find((j) => j.id === activeLateralJoinId)
      if (cteJoin?.lateralSubquery) return cteJoin.lateralSubquery
      const cteUnionJoin = cte.queryState.unionQuery?.queryState.joins.find(
        (j) => j.id === activeLateralJoinId
      )
      if (cteUnionJoin?.lateralSubquery) return cteUnionJoin.lateralSubquery
    }
  }
  if (activeCteId) {
    const cte = rootQueryState.ctes.find((c) => c.id === activeCteId)
    if (cte) {
      if (activeQueryPart === 'union' && cte.queryState.unionQuery) {
        return cte.queryState.unionQuery.queryState
      }
      return cte.queryState
    }
  }
  if (activeQueryPart === 'union' && rootQueryState.unionQuery) {
    return rootQueryState.unionQuery.queryState
  }
  return rootQueryState
}

// Handles the dnd-kit drop event from *inside* ReactFlow so we can use
// screenToFlowPosition to convert cursor coords → flow coords.
function DropHandler() {
  const { screenToFlowPosition } = useReactFlow()
  const rootQueryState = useQueryStore((s) => s.queryState)
  const activeCteId = useQueryStore((s) => s.activeCteId)
  const activeLateralJoinId = useQueryStore((s) => s.activeLateralJoinId)
  const activeQueryPart = useQueryStore((s) => s.activeQueryPart)
  const addTable = useQueryStore((s) => s.addTable)

  const queryState = resolveCanvasQueryState(
    rootQueryState, activeCteId, activeLateralJoinId, activeQueryPart
  )

  useDndMonitor({
    onDragEnd(event) {
      const { active, over } = event
      if (over?.id !== 'canvas') return

      // Convert the cursor position at drop time to ReactFlow canvas coordinates.
      const activator = event.activatorEvent as PointerEvent | MouseEvent
      const cursorX = activator.clientX + event.delta.x
      const cursorY = activator.clientY + event.delta.y
      const position = screenToFlowPosition({ x: cursorX, y: cursorY })

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
          position,
          columns: columns.map((c) => ({
            id: c.id,
            name: c.name,
            pgType: c.pgType,
            isNullable: c.isNullable,
            isPrimaryKey: c.isPrimaryKey,
            description: c.description,
          })),
        }
        addTable(instance)
      } else if (dropType === 'cte') {
        const { cte } = active.data.current as { cte: CTEDef }
        const existing = new Set(queryState.tables.map((t) => t.alias))
        let alias = cte.name
        let counter = 2
        while (existing.has(alias)) alias = `${cte.name}_${counter++}`
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
              pgType: 'text',
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
          position,
          columns: cteColumns,
        }
        addTable(instance)
      }
    },
  })

  return null
}

interface QueryCanvasProps {
  onStartTour: () => void
}

export function QueryCanvas({ onStartTour }: QueryCanvasProps) {
  const rootQueryState = useQueryStore((s) => s.queryState)
  const activeCteId = useQueryStore((s) => s.activeCteId)
  const activeLateralJoinId = useQueryStore((s) => s.activeLateralJoinId)
  const activeQueryPart = useQueryStore((s) => s.activeQueryPart)
  const outerScopeTables = useQueryStore((s) => getLateralOuterScopeTables(s))
  const updateTablePosition = useQueryStore((s) => s.updateTablePosition)
  const updateJoin = useQueryStore((s) => s.updateJoin)
  const addJoin = useQueryStore((s) => s.addJoin)

  const queryState = resolveCanvasQueryState(
    rootQueryState, activeCteId, activeLateralJoinId, activeQueryPart
  )

  const initialNodes = useMemo(() => buildNodes(queryState, outerScopeTables), []) // eslint-disable-line react-hooks/exhaustive-deps
  const initialEdges = useMemo(() => buildEdges(queryState), []) // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useMemo(() => {
    setNodes(buildNodes(queryState, outerScopeTables))
    setEdges(buildEdges(queryState))
  }, [queryState.tables, queryState.joins, outerScopeTables, setNodes, setEdges]) // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return
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
      if (node.id.startsWith(LATERAL_NODE_PREFIX)) {
        // Persist position for lateral node via the join record
        const joinId = node.id.slice(LATERAL_NODE_PREFIX.length)
        updateJoin(joinId, { canvasPosition: node.position })
      } else {
        updateTablePosition(node.id, node.position)
      }
    },
    [updateTablePosition, updateJoin]
  )

  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })

  // Memoise to keep stable references across HMR / Fast Refresh — React Flow
  // warns when nodeTypes/edgeTypes change identity between renders.
  const nodeTypesMemo = useMemo(() => nodeTypes, [])
  const edgeTypesMemo = useMemo(() => edgeTypes, [])

  return (
    <div ref={setNodeRef} className={cn('h-full w-full', isOver && 'bg-blue-50/30')}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypesMemo}
        edgeTypes={edgeTypesMemo}
        fitView
        deleteKeyCode="Delete"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        {/* DropHandler lives inside ReactFlow so it can call useReactFlow() */}
        <DropHandler />
      </ReactFlow>
      {queryState.tables.length === 0 && queryState.joins.filter(j => j.type === 'LATERAL').length === 0 && (
        <CanvasEmptyState onStartTour={onStartTour} />
      )}
    </div>
  )
}
