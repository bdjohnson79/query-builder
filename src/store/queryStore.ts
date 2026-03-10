import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { buildSql } from '@/lib/sql-builder'
import {
  emptyQueryState,
  emptyFilterGroup,
  type QueryState,
  type TableInstance,
  type JoinDef,
  type SelectedColumn,
  type OrderByItem,
  type ColumnRef,
  type FilterGroup,
  type WindowFunctionDef,
  type CTEDef,
} from '@/types/query'

interface QueryStore {
  queryState: QueryState
  generatedSql: string

  // Table actions
  addTable: (table: TableInstance) => void
  removeTable: (instanceId: string) => void
  updateTablePosition: (instanceId: string, position: { x: number; y: number }) => void

  // Join actions
  addJoin: (join: JoinDef) => void
  updateJoin: (id: string, updates: Partial<JoinDef>) => void
  removeJoin: (id: string) => void

  // Column selection
  toggleColumn: (col: SelectedColumn) => void
  updateColumn: (id: string, updates: Partial<SelectedColumn>) => void
  reorderColumns: (columns: SelectedColumn[]) => void

  // Clauses
  setDistinct: (val: boolean) => void
  setWhere: (group: FilterGroup) => void
  setGroupBy: (cols: ColumnRef[]) => void
  setHaving: (group: FilterGroup) => void
  setOrderBy: (items: OrderByItem[]) => void
  setLimit: (val: number | null) => void
  setOffset: (val: number | null) => void

  // Window functions
  addWindowFunction: (wf: WindowFunctionDef) => void
  updateWindowFunction: (id: string, updates: Partial<WindowFunctionDef>) => void
  removeWindowFunction: (id: string) => void

  // CTEs
  addCte: (cte: CTEDef) => void
  updateCte: (id: string, updates: Partial<CTEDef>) => void
  removeCte: (id: string) => void

  // State management
  loadQueryState: (state: QueryState) => void
  resetQuery: () => void
}

function rebuildSql(state: QueryState): string {
  return buildSql(state)
}

export const useQueryStore = create<QueryStore>()(
  subscribeWithSelector((set, get) => ({
    queryState: emptyQueryState(),
    generatedSql: '-- Drag a table onto the canvas to start',

    addTable: (table) =>
      set((s) => {
        const next = { ...s.queryState, tables: [...s.queryState.tables, table] }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeTable: (instanceId) =>
      set((s) => {
        const next: QueryState = {
          ...s.queryState,
          tables: s.queryState.tables.filter((t) => t.id !== instanceId),
          joins: s.queryState.joins.filter(
            (j) => j.leftTableAlias !== s.queryState.tables.find(t => t.id === instanceId)?.alias &&
                   j.rightTableAlias !== s.queryState.tables.find(t => t.id === instanceId)?.alias
          ),
          selectedColumns: s.queryState.selectedColumns.filter(
            (c) => c.tableAlias !== s.queryState.tables.find(t => t.id === instanceId)?.alias
          ),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    updateTablePosition: (instanceId, position) =>
      set((s) => {
        const next = {
          ...s.queryState,
          tables: s.queryState.tables.map((t) =>
            t.id === instanceId ? { ...t, position } : t
          ),
        }
        return { queryState: next }
      }),

    addJoin: (join) =>
      set((s) => {
        const next = { ...s.queryState, joins: [...s.queryState.joins, join] }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    updateJoin: (id, updates) =>
      set((s) => {
        const next = {
          ...s.queryState,
          joins: s.queryState.joins.map((j) => (j.id === id ? { ...j, ...updates } : j)),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeJoin: (id) =>
      set((s) => {
        const next = { ...s.queryState, joins: s.queryState.joins.filter((j) => j.id !== id) }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    toggleColumn: (col) =>
      set((s) => {
        const exists = s.queryState.selectedColumns.find(
          (c) => c.tableAlias === col.tableAlias && c.columnName === col.columnName
        )
        const next = {
          ...s.queryState,
          selectedColumns: exists
            ? s.queryState.selectedColumns.filter((c) => c.id !== exists.id)
            : [...s.queryState.selectedColumns, col],
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    updateColumn: (id, updates) =>
      set((s) => {
        const next = {
          ...s.queryState,
          selectedColumns: s.queryState.selectedColumns.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    reorderColumns: (columns) =>
      set((s) => {
        const next = { ...s.queryState, selectedColumns: columns }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setDistinct: (val) =>
      set((s) => {
        const next = { ...s.queryState, distinct: val }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setWhere: (group) =>
      set((s) => {
        const next = { ...s.queryState, where: group }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setGroupBy: (cols) =>
      set((s) => {
        const next = { ...s.queryState, groupBy: cols }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setHaving: (group) =>
      set((s) => {
        const next = { ...s.queryState, having: group }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setOrderBy: (items) =>
      set((s) => {
        const next = { ...s.queryState, orderBy: items }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setLimit: (val) =>
      set((s) => {
        const next = { ...s.queryState, limit: val }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setOffset: (val) =>
      set((s) => {
        const next = { ...s.queryState, offset: val }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    addWindowFunction: (wf) =>
      set((s) => {
        const next = { ...s.queryState, windowFunctions: [...s.queryState.windowFunctions, wf] }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    updateWindowFunction: (id, updates) =>
      set((s) => {
        const next = {
          ...s.queryState,
          windowFunctions: s.queryState.windowFunctions.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeWindowFunction: (id) =>
      set((s) => {
        const next = {
          ...s.queryState,
          windowFunctions: s.queryState.windowFunctions.filter((w) => w.id !== id),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    addCte: (cte) =>
      set((s) => {
        const next = { ...s.queryState, ctes: [...s.queryState.ctes, cte] }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    updateCte: (id, updates) =>
      set((s) => {
        const next = {
          ...s.queryState,
          ctes: s.queryState.ctes.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeCte: (id) =>
      set((s) => {
        const next = { ...s.queryState, ctes: s.queryState.ctes.filter((c) => c.id !== id) }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    loadQueryState: (state) =>
      set({ queryState: state, generatedSql: rebuildSql(state) }),

    resetQuery: () =>
      set({ queryState: emptyQueryState(), generatedSql: '-- Drag a table onto the canvas to start' }),
  }))
)
