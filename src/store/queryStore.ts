import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import { buildSql } from '@/lib/sql-builder'
import {
  emptyQueryState,
  emptyFilterGroup,
  type QueryState,
  type TableInstance,
  type JoinDef,
  type JsonbExpansion,
  type JsonbArrayUnnesting,
  type SelectedColumn,
  type OrderByItem,
  type ColumnRef,
  type FilterGroup,
  type FilterRule,
  type WindowFunctionDef,
  type CTEDef,
  type JsonbMapping,
  type GrafanaPanelType,
  type TimescaleBucket,
  type GapfillStrategy,
} from '@/types/query'

interface QueryStore {
  queryState: QueryState
  generatedSql: string
  userEditedSql: string | null

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
  addColumn: (col: SelectedColumn) => void

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

  // JSONB mappings (structure assignments)
  setJsonbMapping: (tableAlias: string, columnName: string, structureId: number) => void
  clearJsonbMapping: (tableAlias: string, columnName: string) => void

  // JSONB expand-as-record expansions
  applyJsonbExpansion: (exp: JsonbExpansion, selectedFieldNames: string[]) => void
  removeJsonbExpansion: (id: string) => void

  // JSONB array unnestings
  addJsonbArrayUnnesting: (unnesting: JsonbArrayUnnesting) => void
  updateJsonbArrayUnnesting: (id: string, updates: Partial<JsonbArrayUnnesting>) => void
  removeJsonbArrayUnnesting: (id: string) => void

  // Grafana intent
  setPanelType: (type: GrafanaPanelType | undefined) => void
  setIsGrafanaVariable: (enabled: boolean) => void
  setTimeColumn: (col: { tableAlias: string; columnName: string } | undefined) => void

  // TimescaleDB
  setTimescaleBucket: (bucket: TimescaleBucket | undefined) => void
  setGapfillStrategy: (columnId: string, strategy: 'locf' | 'interpolate' | null) => void

  // Manual SQL editing
  setUserEditedSql: (sql: string | null) => void

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
    userEditedSql: null,

    addTable: (table) =>
      set((s) => {
        const next = { ...s.queryState, tables: [...s.queryState.tables, table] }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeTable: (instanceId) =>
      set((s) => {
        const alias = s.queryState.tables.find(t => t.id === instanceId)?.alias
        // Find expansion aliases that belong to this table so we can clean up their selectedColumns
        const expansionAliases = alias
          ? s.queryState.jsonbExpansions
              .filter((e) => e.tableAlias === alias)
              .map((e) => e.expandAlias)
          : []
        const next: QueryState = {
          ...s.queryState,
          tables: s.queryState.tables.filter((t) => t.id !== instanceId),
          joins: s.queryState.joins.filter(
            (j) => j.leftTableAlias !== alias && j.rightTableAlias !== alias
          ),
          selectedColumns: s.queryState.selectedColumns.filter(
            (c) => c.tableAlias !== alias && !expansionAliases.includes(c.tableAlias)
          ),
          jsonbExpansions: s.queryState.jsonbExpansions.filter(
            (e) => e.tableAlias !== alias
          ),
          jsonbArrayUnnestings: (s.queryState.jsonbArrayUnnestings ?? []).filter(
            (u) => u.tableAlias !== alias
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
          jsonbExpansions: s.queryState.jsonbExpansions.map((e) =>
            e.tableAlias === old ? { ...e, tableAlias: newAlias } : e
          ),
          jsonbArrayUnnestings: (s.queryState.jsonbArrayUnnestings ?? []).map((u) =>
            u.tableAlias === old ? { ...u, tableAlias: newAlias } : u
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

    addColumn: (col) =>
      set((s) => {
        const next = {
          ...s.queryState,
          selectedColumns: [...s.queryState.selectedColumns, col],
        }
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

    applyJsonbExpansion: (exp, selectedFieldNames) =>
      set((s) => {
        // Find existing expansion for this table.column to get old expandAlias
        const existing = s.queryState.jsonbExpansions.find(
          (e) => e.tableAlias === exp.tableAlias && e.columnName === exp.columnName
        )
        const oldExpandAlias = existing?.expandAlias

        // Remove old expansion entry
        const expansions = s.queryState.jsonbExpansions.filter(
          (e) => !(e.tableAlias === exp.tableAlias && e.columnName === exp.columnName)
        )

        // Remove SelectedColumns that came from the old expansion alias
        let selectedColumns = s.queryState.selectedColumns
        if (oldExpandAlias) {
          selectedColumns = selectedColumns.filter((c) => c.tableAlias !== oldExpandAlias)
        }
        // Also clean up new expandAlias if it differs (alias rename case)
        if (exp.expandAlias !== oldExpandAlias) {
          selectedColumns = selectedColumns.filter((c) => c.tableAlias !== exp.expandAlias)
        }

        // Add SelectedColumns for each checked field
        const newCols: SelectedColumn[] = selectedFieldNames
          .filter((name) => exp.fields.some((f) => f.name === name))
          .map((name) => ({
            id: crypto.randomUUID(),
            tableAlias: exp.expandAlias,
            columnName: name,
          }))
        selectedColumns = [...selectedColumns, ...newCols]

        const next: QueryState = {
          ...s.queryState,
          jsonbExpansions: [...expansions, exp],
          selectedColumns,
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeJsonbExpansion: (id) =>
      set((s) => {
        const exp = s.queryState.jsonbExpansions.find((e) => e.id === id)
        const next: QueryState = {
          ...s.queryState,
          jsonbExpansions: s.queryState.jsonbExpansions.filter((e) => e.id !== id),
          // Remove selected columns that came from this expansion
          selectedColumns: exp
            ? s.queryState.selectedColumns.filter((c) => c.tableAlias !== exp.expandAlias)
            : s.queryState.selectedColumns,
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    addJsonbArrayUnnesting: (unnesting) =>
      set((s) => {
        const next: QueryState = {
          ...s.queryState,
          jsonbArrayUnnestings: [...(s.queryState.jsonbArrayUnnestings ?? []), unnesting],
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    updateJsonbArrayUnnesting: (id, updates) =>
      set((s) => {
        const next: QueryState = {
          ...s.queryState,
          jsonbArrayUnnestings: (s.queryState.jsonbArrayUnnestings ?? []).map((u) =>
            u.id === id ? { ...u, ...updates } : u
          ),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeJsonbArrayUnnesting: (id) =>
      set((s) => {
        const next: QueryState = {
          ...s.queryState,
          jsonbArrayUnnestings: (s.queryState.jsonbArrayUnnestings ?? []).filter(
            (u) => u.id !== id
          ),
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setPanelType: (type) =>
      set((s) => {
        const next = { ...s.queryState, grafanaPanelType: type }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setIsGrafanaVariable: (enabled) =>
      set((s) => {
        const next = { ...s.queryState, isGrafanaVariable: enabled }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setTimeColumn: (col) =>
      set((s) => {
        const next = { ...s.queryState, timeColumn: col }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setTimescaleBucket: (bucket) =>
      set((s) => {
        const next = { ...s.queryState, timescaleBucket: bucket }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setGapfillStrategy: (columnId, strategy) =>
      set((s) => {
        const existing = s.queryState.gapfillStrategies ?? []
        const filtered = existing.filter((g) => g.selectedColumnId !== columnId)
        const next: QueryState = {
          ...s.queryState,
          gapfillStrategies: strategy
            ? [...filtered, { selectedColumnId: columnId, strategy }]
            : filtered,
        }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    setUserEditedSql: (sql) =>
      set({ userEditedSql: sql }),

    loadQueryState: (state) =>
      set({ queryState: state, generatedSql: rebuildSql(state), userEditedSql: null }),

    resetQuery: () =>
      set({
        queryState: emptyQueryState(),
        generatedSql: '-- Drag a table onto the canvas to start',
        userEditedSql: null,
      }),
  })),
  {
    name: 'query-builder-state',
    partialize: (state) => ({
      queryState: state.queryState,
      userEditedSql: state.userEditedSql,
    }),
    onRehydrateStorage: () => (state) => {
      if (state?.queryState) {
        // Backfill fields added after initial release so old persisted states don't crash
        if (!state.queryState.jsonbMappings) state.queryState.jsonbMappings = []
        if (!state.queryState.jsonbExpansions) state.queryState.jsonbExpansions = []
        if (!state.queryState.jsonbArrayUnnestings) state.queryState.jsonbArrayUnnestings = []
        if (state.queryState.isGrafanaVariable === undefined) state.queryState.isGrafanaVariable = false
        if (!state.queryState.gapfillStrategies) state.queryState.gapfillStrategies = []
        // timeColumn backfill: null → undefined (JSON serializes undefined as absent, null may appear)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((state.queryState as any).timeColumn === null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (state.queryState as any).timeColumn
        }
        state.generatedSql = buildSql(state.queryState)
      }
    },
  }
  )
)
