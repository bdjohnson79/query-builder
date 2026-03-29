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
  type UnionOperator,
} from '@/types/query'

interface QueryStore {
  queryState: QueryState
  generatedSql: string
  userEditedSql: string | null

  // CTE editing mode (UI state — not persisted)
  activeCteId: string | null
  startEditingCte: (id: string) => void
  stopEditingCte: () => void

  // UNION query part switching (UI state — not persisted)
  activeQueryPart: 'main' | 'union'
  setActiveQueryPart: (part: 'main' | 'union') => void
  addUnionBranch: (operator: UnionOperator) => void
  updateUnionBranchOperator: (operator: UnionOperator) => void
  removeUnionBranch: () => void

  // LATERAL join editing mode (UI state — not persisted)
  activeLateralJoinId: string | null
  startEditingLateralJoin: (id: string) => void
  stopEditingLateralJoin: () => void
  addLateralJoin: (lateralAlias: string) => void

  // Table actions
  addTable: (table: TableInstance) => void
  removeTable: (instanceId: string) => void
  updateTablePosition: (instanceId: string, position: { x: number; y: number }) => void
  nudgeOverlappingTables: (instanceId: string, expandedWidth: number) => void
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

// ---------------------------------------------------------------------------
// Editing mode helpers
// Priority chain for mutations:
//   1. activeCteId set → mutate that CTE's nested queryState
//   2. activeLateralJoinId set → mutate that join's lateralSubquery
//   3. activeQueryPart === 'union' → mutate the unionQuery branch's queryState
//   4. Default → mutate root queryState
// The SQL preview always rebuilds from the full root queryState.
// ---------------------------------------------------------------------------

function getActiveQueryState(s: QueryStore): QueryState {
  if (s.activeCteId) {
    const cte = s.queryState.ctes.find((c) => c.id === s.activeCteId)
    if (cte) return cte.queryState
  }
  if (s.activeLateralJoinId) {
    // Search root joins first, then union branch joins
    const rootJoin = s.queryState.joins.find((j) => j.id === s.activeLateralJoinId)
    if (rootJoin?.lateralSubquery) return rootJoin.lateralSubquery
    const unionJoin = s.queryState.unionQuery?.queryState.joins.find(
      (j) => j.id === s.activeLateralJoinId
    )
    if (unionJoin?.lateralSubquery) return unionJoin.lateralSubquery
  }
  if (s.activeQueryPart === 'union' && s.queryState.unionQuery) {
    return s.queryState.unionQuery.queryState
  }
  return s.queryState
}

function setActiveQueryState(s: QueryStore, next: QueryState): Partial<QueryStore> {
  if (s.activeCteId) {
    const updatedCtes = s.queryState.ctes.map((c) =>
      c.id === s.activeCteId ? { ...c, queryState: next } : c
    )
    const updatedRoot = { ...s.queryState, ctes: updatedCtes }
    return { queryState: updatedRoot, generatedSql: rebuildSql(updatedRoot) }
  }
  if (s.activeLateralJoinId) {
    // Update the lateral join's subquery, whether it's on root or union branch
    const updateJoins = (joins: QueryState['joins']) =>
      joins.map((j) =>
        j.id === s.activeLateralJoinId ? { ...j, lateralSubquery: next } : j
      )
    const rootHasJoin = s.queryState.joins.some((j) => j.id === s.activeLateralJoinId)
    if (rootHasJoin) {
      const updatedRoot = { ...s.queryState, joins: updateJoins(s.queryState.joins) }
      return { queryState: updatedRoot, generatedSql: rebuildSql(updatedRoot) }
    }
    const unionHasJoin = s.queryState.unionQuery?.queryState.joins.some(
      (j) => j.id === s.activeLateralJoinId
    )
    if (unionHasJoin && s.queryState.unionQuery) {
      const updatedUnionQs = {
        ...s.queryState.unionQuery.queryState,
        joins: updateJoins(s.queryState.unionQuery.queryState.joins),
      }
      const updatedRoot = {
        ...s.queryState,
        unionQuery: { ...s.queryState.unionQuery, queryState: updatedUnionQs },
      }
      return { queryState: updatedRoot, generatedSql: rebuildSql(updatedRoot) }
    }
  }
  if (s.activeQueryPart === 'union' && s.queryState.unionQuery) {
    const updatedRoot = {
      ...s.queryState,
      unionQuery: { ...s.queryState.unionQuery, queryState: next },
    }
    return { queryState: updatedRoot, generatedSql: rebuildSql(updatedRoot) }
  }
  return { queryState: next, generatedSql: rebuildSql(next) }
}

export const useQueryStore = create<QueryStore>()(
  persist(
  subscribeWithSelector((set, get) => ({
    queryState: emptyQueryState(),
    generatedSql: '-- Drag a table onto the canvas to start',
    userEditedSql: null,
    activeCteId: null,
    activeQueryPart: 'main',
    activeLateralJoinId: null,

    startEditingCte: (id) => set({ activeCteId: id, userEditedSql: null }),
    stopEditingCte: () => set({ activeCteId: null }),

    setActiveQueryPart: (part) => set({ activeQueryPart: part }),

    addUnionBranch: (operator) =>
      set((s) => {
        if (s.queryState.unionQuery) return s
        const next = { ...s.queryState, unionQuery: { operator, queryState: emptyQueryState() } }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    updateUnionBranchOperator: (operator) =>
      set((s) => {
        if (!s.queryState.unionQuery) return s
        const next = { ...s.queryState, unionQuery: { ...s.queryState.unionQuery, operator } }
        return { queryState: next, generatedSql: rebuildSql(next) }
      }),

    removeUnionBranch: () =>
      set((s) => {
        const next = { ...s.queryState, unionQuery: undefined }
        return { queryState: next, generatedSql: rebuildSql(next), activeQueryPart: 'main' as const }
      }),

    startEditingLateralJoin: (id) => set({ activeLateralJoinId: id, userEditedSql: null }),
    stopEditingLateralJoin: () => set({ activeLateralJoinId: null }),

    addLateralJoin: (lateralAlias) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const join: JoinDef = {
          id: crypto.randomUUID(),
          type: 'LATERAL',
          leftTableAlias: '',
          leftColumn: '',
          rightTableAlias: lateralAlias,
          rightColumn: '',
          lateralAlias,
          lateralSubquery: emptyQueryState(),
        }
        const next = { ...active, joins: [...active.joins, join] }
        return setActiveQueryState(s, next)
      }),

    addTable: (table) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, tables: [...active.tables, table] }
        return setActiveQueryState(s, next)
      }),

    removeTable: (instanceId) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const alias = active.tables.find(t => t.id === instanceId)?.alias
        const expansionAliases = alias
          ? active.jsonbExpansions
              .filter((e) => e.tableAlias === alias)
              .map((e) => e.expandAlias)
          : []
        const next: QueryState = {
          ...active,
          tables: active.tables.filter((t) => t.id !== instanceId),
          joins: active.joins.filter(
            (j) => j.leftTableAlias !== alias && j.rightTableAlias !== alias
          ),
          selectedColumns: active.selectedColumns.filter(
            (c) => c.tableAlias !== alias && !expansionAliases.includes(c.tableAlias)
          ),
          jsonbExpansions: active.jsonbExpansions.filter(
            (e) => e.tableAlias !== alias
          ),
          jsonbArrayUnnestings: (active.jsonbArrayUnnestings ?? []).filter(
            (u) => u.tableAlias !== alias
          ),
          jsonbMappings: active.jsonbMappings.filter(
            (m) => m.tableAlias !== alias
          ),
        }
        return setActiveQueryState(s, next)
      }),

    updateTablePosition: (instanceId, position) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = {
          ...active,
          tables: active.tables.map((t) =>
            t.id === instanceId ? { ...t, position } : t
          ),
        }
        // Position updates don't affect SQL — only update queryState, skip rebuildSql
        if (s.activeCteId) {
          const updatedCtes = s.queryState.ctes.map((c) =>
            c.id === s.activeCteId ? { ...c, queryState: next } : c
          )
          return { queryState: { ...s.queryState, ctes: updatedCtes } }
        }
        if (s.activeLateralJoinId) {
          const updateJoins = (joins: QueryState['joins']) =>
            joins.map((j) => j.id === s.activeLateralJoinId ? { ...j, lateralSubquery: next } : j)
          if (s.queryState.joins.some((j) => j.id === s.activeLateralJoinId)) {
            return { queryState: { ...s.queryState, joins: updateJoins(s.queryState.joins) } }
          }
          if (s.queryState.unionQuery?.queryState.joins.some((j) => j.id === s.activeLateralJoinId)) {
            const updatedUnionQs = { ...s.queryState.unionQuery.queryState, joins: updateJoins(s.queryState.unionQuery.queryState.joins) }
            return { queryState: { ...s.queryState, unionQuery: { ...s.queryState.unionQuery, queryState: updatedUnionQs } } }
          }
        }
        if (s.activeQueryPart === 'union' && s.queryState.unionQuery) {
          return { queryState: { ...s.queryState, unionQuery: { ...s.queryState.unionQuery, queryState: next } } }
        }
        return { queryState: next }
      }),

    nudgeOverlappingTables: (instanceId, expandedWidth) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const thisNode = active.tables.find((t) => t.id === instanceId)
        if (!thisNode) return s

        const PADDING = 24
        const rightEdge = thisNode.position.x + expandedWidth + PADDING

        const anyOverlap = active.tables.some(
          (t) => t.id !== instanceId && t.position.x > thisNode.position.x && t.position.x < rightEdge
        )
        if (!anyOverlap) return s

        const tables = active.tables.map((t) => {
          if (t.id === instanceId) return t
          if (t.position.x > thisNode.position.x && t.position.x < rightEdge) {
            return { ...t, position: { ...t.position, x: rightEdge } }
          }
          return t
        })

        // Position-only update — same pattern as updateTablePosition, skip rebuildSql
        const next = { ...active, tables }
        if (s.activeCteId) {
          const updatedCtes = s.queryState.ctes.map((c) =>
            c.id === s.activeCteId ? { ...c, queryState: next } : c
          )
          return { queryState: { ...s.queryState, ctes: updatedCtes } }
        }
        if (s.activeLateralJoinId) {
          const updateJoins = (joins: QueryState['joins']) =>
            joins.map((j) => j.id === s.activeLateralJoinId ? { ...j, lateralSubquery: next } : j)
          if (s.queryState.joins.some((j) => j.id === s.activeLateralJoinId)) {
            return { queryState: { ...s.queryState, joins: updateJoins(s.queryState.joins) } }
          }
          if (s.queryState.unionQuery?.queryState.joins.some((j) => j.id === s.activeLateralJoinId)) {
            const updatedUnionQs = { ...s.queryState.unionQuery.queryState, joins: updateJoins(s.queryState.unionQuery.queryState.joins) }
            return { queryState: { ...s.queryState, unionQuery: { ...s.queryState.unionQuery, queryState: updatedUnionQs } } }
          }
        }
        if (s.activeQueryPart === 'union' && s.queryState.unionQuery) {
          return { queryState: { ...s.queryState, unionQuery: { ...s.queryState.unionQuery, queryState: next } } }
        }
        return { queryState: next }
      }),

    updateTableAlias: (instanceId, newAlias) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const table = active.tables.find((t) => t.id === instanceId)
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
          ...active,
          tables: active.tables.map((t) =>
            t.id === instanceId ? { ...t, alias: newAlias } : t
          ),
          joins: active.joins.map((j) => ({
            ...j,
            leftTableAlias: j.leftTableAlias === old ? newAlias : j.leftTableAlias,
            rightTableAlias: j.rightTableAlias === old ? newAlias : j.rightTableAlias,
          })),
          selectedColumns: active.selectedColumns.map((c) =>
            c.tableAlias === old ? { ...c, tableAlias: newAlias } : c
          ),
          groupBy: active.groupBy.map((g) =>
            g.tableAlias === old ? { ...g, tableAlias: newAlias } : g
          ),
          orderBy: active.orderBy.map((o) =>
            o.tableAlias === old ? { ...o, tableAlias: newAlias } : o
          ),
          windowFunctions: active.windowFunctions.map((wf) => ({
            ...wf,
            partitionBy: wf.partitionBy.map((p) =>
              p.tableAlias === old ? { ...p, tableAlias: newAlias } : p
            ),
            orderBy: wf.orderBy.map((o) =>
              o.tableAlias === old ? { ...o, tableAlias: newAlias } : o
            ),
          })),
          where: renameFilter(active.where),
          having: renameFilter(active.having),
          jsonbMappings: active.jsonbMappings.map((m) =>
            m.tableAlias === old ? { ...m, tableAlias: newAlias } : m
          ),
          jsonbExpansions: active.jsonbExpansions.map((e) =>
            e.tableAlias === old ? { ...e, tableAlias: newAlias } : e
          ),
          jsonbArrayUnnestings: (active.jsonbArrayUnnestings ?? []).map((u) =>
            u.tableAlias === old ? { ...u, tableAlias: newAlias } : u
          ),
        }
        return setActiveQueryState(s, next)
      }),

    addJoin: (join) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, joins: [...active.joins, join] }
        return setActiveQueryState(s, next)
      }),

    updateJoin: (id, updates) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = {
          ...active,
          joins: active.joins.map((j) => (j.id === id ? { ...j, ...updates } : j)),
        }
        return setActiveQueryState(s, next)
      }),

    removeJoin: (id) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, joins: active.joins.filter((j) => j.id !== id) }
        return setActiveQueryState(s, next)
      }),

    toggleColumn: (col) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const exists = active.selectedColumns.find((c) => {
          if (c.tableAlias !== col.tableAlias || c.columnName !== col.columnName) return false
          // JSONB path columns carry an expression — match on it so multiple paths
          // from the same column can be selected independently
          if (col.expression !== undefined) return c.expression === col.expression
          return c.expression === undefined
        })
        const next = {
          ...active,
          selectedColumns: exists
            ? active.selectedColumns.filter((c) => c.id !== exists.id)
            : [...active.selectedColumns, col],
        }
        return setActiveQueryState(s, next)
      }),

    updateColumn: (id, updates) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = {
          ...active,
          selectedColumns: active.selectedColumns.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }
        return setActiveQueryState(s, next)
      }),

    reorderColumns: (columns) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, selectedColumns: columns }
        return setActiveQueryState(s, next)
      }),

    addColumn: (col) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = {
          ...active,
          selectedColumns: [...active.selectedColumns, col],
        }
        return setActiveQueryState(s, next)
      }),

    setDistinct: (val) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, distinct: val }
        return setActiveQueryState(s, next)
      }),

    setWhere: (group) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, where: group }
        return setActiveQueryState(s, next)
      }),

    setGroupBy: (cols) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, groupBy: cols }
        return setActiveQueryState(s, next)
      }),

    setHaving: (group) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, having: group }
        return setActiveQueryState(s, next)
      }),

    setOrderBy: (items) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, orderBy: items }
        return setActiveQueryState(s, next)
      }),

    setLimit: (val) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, limit: val }
        return setActiveQueryState(s, next)
      }),

    setOffset: (val) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, offset: val }
        return setActiveQueryState(s, next)
      }),

    addWindowFunction: (wf) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, windowFunctions: [...active.windowFunctions, wf] }
        return setActiveQueryState(s, next)
      }),

    updateWindowFunction: (id, updates) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = {
          ...active,
          windowFunctions: active.windowFunctions.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        }
        return setActiveQueryState(s, next)
      }),

    removeWindowFunction: (id) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = {
          ...active,
          windowFunctions: active.windowFunctions.filter((w) => w.id !== id),
        }
        return setActiveQueryState(s, next)
      }),

    // CTEs always modify the ROOT queryState (not the active CTE's nested state)
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
        return { queryState: next, generatedSql: rebuildSql(next), activeCteId: s.activeCteId === id ? null : s.activeCteId }
      }),

    setJsonbMapping: (tableAlias, columnName, structureId) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const filtered = active.jsonbMappings.filter(
          (m) => !(m.tableAlias === tableAlias && m.columnName === columnName)
        )
        const next: QueryState = {
          ...active,
          jsonbMappings: [...filtered, { tableAlias, columnName, structureId } as JsonbMapping],
        }
        return setActiveQueryState(s, next)
      }),

    clearJsonbMapping: (tableAlias, columnName) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next: QueryState = {
          ...active,
          jsonbMappings: active.jsonbMappings.filter(
            (m) => !(m.tableAlias === tableAlias && m.columnName === columnName)
          ),
        }
        return setActiveQueryState(s, next)
      }),

    applyJsonbExpansion: (exp, selectedFieldNames) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const existing = active.jsonbExpansions.find(
          (e) => e.tableAlias === exp.tableAlias && e.columnName === exp.columnName
        )
        const oldExpandAlias = existing?.expandAlias

        const expansions = active.jsonbExpansions.filter(
          (e) => !(e.tableAlias === exp.tableAlias && e.columnName === exp.columnName)
        )

        let selectedColumns = active.selectedColumns
        if (oldExpandAlias) {
          selectedColumns = selectedColumns.filter((c) => c.tableAlias !== oldExpandAlias)
        }
        if (exp.expandAlias !== oldExpandAlias) {
          selectedColumns = selectedColumns.filter((c) => c.tableAlias !== exp.expandAlias)
        }

        const newCols: SelectedColumn[] = selectedFieldNames
          .filter((name) => exp.fields.some((f) => f.name === name))
          .map((name) => ({
            id: crypto.randomUUID(),
            tableAlias: exp.expandAlias,
            columnName: name,
          }))
        selectedColumns = [...selectedColumns, ...newCols]

        const next: QueryState = {
          ...active,
          jsonbExpansions: [...expansions, exp],
          selectedColumns,
        }
        return setActiveQueryState(s, next)
      }),

    removeJsonbExpansion: (id) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const exp = active.jsonbExpansions.find((e) => e.id === id)
        const next: QueryState = {
          ...active,
          jsonbExpansions: active.jsonbExpansions.filter((e) => e.id !== id),
          selectedColumns: exp
            ? active.selectedColumns.filter((c) => c.tableAlias !== exp.expandAlias)
            : active.selectedColumns,
        }
        return setActiveQueryState(s, next)
      }),

    addJsonbArrayUnnesting: (unnesting) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next: QueryState = {
          ...active,
          jsonbArrayUnnestings: [...(active.jsonbArrayUnnestings ?? []), unnesting],
        }
        return setActiveQueryState(s, next)
      }),

    updateJsonbArrayUnnesting: (id, updates) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next: QueryState = {
          ...active,
          jsonbArrayUnnestings: (active.jsonbArrayUnnestings ?? []).map((u) =>
            u.id === id ? { ...u, ...updates } : u
          ),
        }
        return setActiveQueryState(s, next)
      }),

    removeJsonbArrayUnnesting: (id) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next: QueryState = {
          ...active,
          jsonbArrayUnnestings: (active.jsonbArrayUnnestings ?? []).filter(
            (u) => u.id !== id
          ),
        }
        return setActiveQueryState(s, next)
      }),

    setPanelType: (type) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, grafanaPanelType: type }
        return setActiveQueryState(s, next)
      }),

    setIsGrafanaVariable: (enabled) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, isGrafanaVariable: enabled }
        return setActiveQueryState(s, next)
      }),

    setTimeColumn: (col) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, timeColumn: col }
        return setActiveQueryState(s, next)
      }),

    setTimescaleBucket: (bucket) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const next = { ...active, timescaleBucket: bucket }
        return setActiveQueryState(s, next)
      }),

    setGapfillStrategy: (columnId, strategy) =>
      set((s) => {
        const active = getActiveQueryState(s)
        const existing = active.gapfillStrategies ?? []
        const filtered = existing.filter((g) => g.selectedColumnId !== columnId)
        const next: QueryState = {
          ...active,
          gapfillStrategies: strategy
            ? [...filtered, { selectedColumnId: columnId, strategy }]
            : filtered,
        }
        return setActiveQueryState(s, next)
      }),

    setUserEditedSql: (sql) =>
      set({ userEditedSql: sql }),

    loadQueryState: (state) =>
      set({ queryState: state, generatedSql: rebuildSql(state), userEditedSql: null, activeCteId: null, activeQueryPart: 'main', activeLateralJoinId: null }),

    resetQuery: () =>
      set({
        queryState: emptyQueryState(),
        generatedSql: '-- Drag a table onto the canvas to start',
        userEditedSql: null,
        activeCteId: null,
        activeQueryPart: 'main',
        activeLateralJoinId: null,
      }),
  })),
  {
    name: 'query-builder-state',
    partialize: (state) => ({
      queryState: state.queryState,
      userEditedSql: state.userEditedSql,
      // activeCteId is UI state — not persisted
    }),
    onRehydrateStorage: () => (state) => {
      if (state?.queryState) {
        // Backfill fields added after initial release so old persisted states don't crash
        if (!state.queryState.jsonbMappings) state.queryState.jsonbMappings = []
        if (!state.queryState.jsonbExpansions) state.queryState.jsonbExpansions = []
        if (!state.queryState.jsonbArrayUnnestings) state.queryState.jsonbArrayUnnestings = []
        if (state.queryState.isGrafanaVariable === undefined) state.queryState.isGrafanaVariable = false
        if (!state.queryState.gapfillStrategies) state.queryState.gapfillStrategies = []
        // Migrate old unionAllRawSql → drop it (replaced by structured unionQuery)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((state.queryState as any).unionAllRawSql !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (state.queryState as any).unionAllRawSql
        }
        // Backfill CTEDef.outputColumns for old persisted states
        if (state.queryState.ctes) {
          state.queryState.ctes = state.queryState.ctes.map((c) =>
            c.outputColumns ? c : { ...c, outputColumns: [] }
          )
        }
        // timeColumn backfill: null → undefined
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
