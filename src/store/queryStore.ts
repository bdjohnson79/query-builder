import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
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
  type FilterRule,
  type WindowFunctionDef,
  type CTEDef,
  type JsonbMapping,
} from '@/types/query'

interface QueryStore {
  queryState: QueryState
  generatedSql: string

  // Table actions
  addTable: (table: TableInstance) => void
  removeTable: (instanceId: string) => void
  updateTablePosition: (instanceId: string, position: { x: number; y: number }) => void
  updateTableAlias: (instanceId: string, newAlias: string) => void

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

  // JSONB mappings
  setJsonbMapping: (tableAlias: string, columnName: string, structureId: number) => void
  clearJsonbMapping: (tableAlias: string, columnName: string) => void

  // State management
  loadQueryState: (state: QueryState) => void
  resetQuery: () => void
}

function rebuildSql(state: QueryState): string {
  return buildSql(state)
}

export const useQueryStore = create<QueryStore>()(
  persist(
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
        const alias = s.queryState.tables.find(t => t.id === instanceId)?.alias
        const next: QueryState = {
          ...s.queryState,
          tables: s.queryState.tables.filter((t) => t.id !== instanceId),
          joins: s.queryState.joins.filter(
            (j) => j.leftTableAlias !== alias && j.rightTableAlias !== alias
          ),
          selectedColumns: s.queryState.selectedColumns.filter(
            (c) => c.tableAlias !== alias
          ),
          jsonbMappings: s.queryState.jsonbMappings.filter(
            (m) => m.tableAlias !== alias
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

    updateTableAlias: (instanceId, newAlias) =>
      set((s) => {
        const table = s.queryState.tables.find((t) => t.id === instanceId)
        if (!table || table.alias === newAlias) return s
        const old = table.alias
        const renameFilter = (group: FilterGroup): FilterGroup => ({
          ...group,
          rules: group.rules.map((r) => {
            if ('rules' in r) return renameFilter(r as FilterGroup)
            const rule = r as FilterRule
            return rule.field.startsWith(`${old}.`)
              ? { ...rule, field: `${newAlias}.${rule.field.slice(old.length + 1)}` }
              : rule
          }),
        })
        const next: QueryState = {
          ...s.queryState,
          tables: s.queryState.tables.map((t) =>
            t.id === instanceId ? { ...t, alias: newAlias } : t
          ),
          joins: s.queryState.joins.map((j) => ({
            ...j,
            leftTableAlias: j.leftTableAlias === old ? newAlias : j.leftTableAlias,
            rightTableAlias: j.rightTableAlias === old ? newAlias : j.rightTableAlias,
          })),
          selectedColumns: s.queryState.selectedColumns.map((c) =>
            c.tableAlias === old ? { ...c, tableAlias: newAlias } : c
          ),
          groupBy: s.queryState.groupBy.map((g) =>
            g.tableAlias === old ? { ...g, tableAlias: newAlias } : g
          ),
          orderBy: s.queryState.orderBy.map((o) =>
            o.tableAlias === old ? { ...o, tableAlias: newAlias } : o
          ),
          windowFunctions: s.queryState.windowFunctions.map((wf) => ({
            ...wf,
            partitionBy: wf.partitionBy.map((p) =>
              p.tableAlias === old ? { ...p, tableAlias: newAlias } : p
            ),
            orderBy: wf.orderBy.map((o) =>
              o.tableAlias === old ? { ...o, tableAlias: newAlias } : o
            ),
          })),
          where: renameFilter(s.queryState.where),
          having: renameFilter(s.queryState.having),
          jsonbMappings: s.queryState.jsonbMappings.map((m) =>
            m.tableAlias === old ? { ...m, tableAlias: newAlias } : m
          ),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
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

    setJsonbMapping: (tableAlias, columnName, structureId) =>
      set((s) => {
        const filtered = s.queryState.jsonbMappings.filter(
          (m) => !(m.tableAlias === tableAlias && m.columnName === columnName)
        )
        const next: QueryState = {
          ...s.queryState,
          jsonbMappings: [...filtered, { tableAlias, columnName, structureId } as JsonbMapping],
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    clearJsonbMapping: (tableAlias, columnName) =>
      set((s) => {
        const next: QueryState = {
          ...s.queryState,
          jsonbMappings: s.queryState.jsonbMappings.filter(
            (m) => !(m.tableAlias === tableAlias && m.columnName === columnName)
          ),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    loadQueryState: (state) =>
      set({ queryState: state, generatedSql: rebuildSql(state) }),

    resetQuery: () =>
      set({ queryState: emptyQueryState(), generatedSql: '-- Drag a table onto the canvas to start' }),
  })),
  {
    name: 'query-builder-state',
    partialize: (state) => ({ queryState: state.queryState }),
    onRehydrateStorage: () => (state) => {
      if (state?.queryState) {
        // Backfill fields added after initial release so old persisted states don't crash
        if (!state.queryState.jsonbMappings) state.queryState.jsonbMappings = []
        state.generatedSql = buildSql(state.queryState)
      }
    },
  }
  )
)
