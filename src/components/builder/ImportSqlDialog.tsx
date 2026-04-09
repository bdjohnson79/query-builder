'use client'
import { useState, useRef } from 'react'
import { useSchemaStore } from '@/store/schemaStore'
import { useQueryStore } from '@/store/queryStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileCode, AlertTriangle, CheckCircle, ChevronDown, Upload } from 'lucide-react'
import { parseSqlToQueryState } from '@/lib/sql-parser/grafana-sql-importer'
import {
  extractGrafanaPanelTargets,
  type GrafanaPanelTarget,
} from '@/lib/sql-parser/grafana-dashboard-extractor'
import { emptyQueryState } from '@/types/query'
import type { QueryState } from '@/types/query'
import type { GrafanaPanelType } from '@/types/query'

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

// ── Parse result ─────────────────────────────────────────────────────────

interface ParsedPreview {
  queryState: QueryState
  warnings: string[]
  detectedPanelType?: GrafanaPanelType
  detectedTables: string[]
  unknownWarnings: string[]
  sql: string
  /** Present when structural parsing failed — import as raw SQL instead. */
  rawSql?: string
}

// ── Tabs ─────────────────────────────────────────────────────────────────

type TabId = 'paste' | 'dashboard'

// ── Main component ────────────────────────────────────────────────────────

export function ImportSqlDialog({ open, onClose }: Props) {
  const tables     = useSchemaStore((s) => s.tables)
  const columns    = useSchemaStore((s) => s.columns)
  const schemas    = useSchemaStore((s) => s.schemas)

  const loadQueryState    = useQueryStore((s) => s.loadQueryState)
  const setPanelType      = useQueryStore((s) => s.setPanelType)
  const setTimeColumn     = useQueryStore((s) => s.setTimeColumn)
  const setUserEditedSql  = useQueryStore((s) => s.setUserEditedSql)

  // ── Tab state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('paste')

  // ── Paste SQL tab state ─────────────────────────────────────────────────
  const [sqlText, setSqlText] = useState('')

  // ── Dashboard JSON tab state ────────────────────────────────────────────
  const dashboardInputRef = useRef<HTMLInputElement>(null)
  const [panelTargets, setPanelTargets] = useState<GrafanaPanelTarget[]>([])
  const [selectedTargetIdx, setSelectedTargetIdx] = useState<number>(0)
  const [dashboardError, setDashboardError] = useState<string>('')

  // ── Parse result ────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [parseError, setParseError] = useState<string>('')
  const [importing, setImporting] = useState(false)

  // ── Helpers ─────────────────────────────────────────────────────────────

  function parseSql(sql: string) {
    setParseError('')
    setPreview(null)
    if (!sql.trim()) return

    const result = parseSqlToQueryState(sql, tables, columns, schemas)

    const detectedTables = result.queryState.tables.map((t) => t.tableName)
    const unknownWarnings = result.warnings.filter((w) => w.includes('not found in Schema Admin'))

    setPreview({
      queryState: result.queryState,
      warnings: result.warnings,
      detectedPanelType: result.detectedPanelType,
      detectedTables,
      unknownWarnings,
      sql,
      rawSql: result.rawSql,
    })
  }

  function handleParsePasteSql() {
    parseSql(sqlText)
  }

  function handleDashboardFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setDashboardError('')
    setPanelTargets([])
    setPreview(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const targets = extractGrafanaPanelTargets(ev.target?.result as string)
        setPanelTargets(targets)
        setSelectedTargetIdx(0)
      } catch (err) {
        setDashboardError(err instanceof Error ? err.message : String(err))
      }
    }
    reader.readAsText(file)
  }

  function handleParseDashboardSql() {
    const target = panelTargets[selectedTargetIdx]
    if (!target) return
    parseSql(target.rawSql)
  }

  function handleImport() {
    if (!preview) return
    setImporting(true)
    try {
      loadQueryState(preview.queryState)
      if (preview.queryState.grafanaPanelType) {
        setPanelType(preview.queryState.grafanaPanelType)
      }
      if (preview.queryState.timeColumn) {
        setTimeColumn(preview.queryState.timeColumn)
      }
      onClose()
      resetState()
    } finally {
      setImporting(false)
    }
  }

  function handleImportRawSql() {
    if (!preview?.rawSql) return
    setImporting(true)
    try {
      loadQueryState(emptyQueryState())
      setUserEditedSql(preview.rawSql)
      onClose()
      resetState()
    } finally {
      setImporting(false)
    }
  }

  function resetState() {
    setSqlText('')
    setPanelTargets([])
    setSelectedTargetIdx(0)
    setDashboardError('')
    setPreview(null)
    setParseError('')
  }

  function handleClose() {
    onClose()
    resetState()
  }

  const selectedTarget = panelTargets[selectedTargetIdx]
  const canImport = preview !== null && preview.queryState.tables.length > 0
  const canImportRaw = preview !== null && !!preview.rawSql && !canImport

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Import SQL from Grafana
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Import a SELECT query into the visual query builder. Reconstruction is best-effort — complex expressions and CTEs are preserved as raw SQL.
          </p>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-0 border-b shrink-0">
          {(['paste', 'dashboard'] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPreview(null); setParseError('') }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'paste' ? 'Paste SQL' : 'Dashboard JSON'}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pt-1">

          {/* ── Paste SQL tab ──────────────────────────────────────────── */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <textarea
                value={sqlText}
                onChange={(e) => { setSqlText(e.target.value); setPreview(null) }}
                rows={10}
                placeholder="Paste your SELECT query here…"
                spellCheck={false}
                className="w-full rounded-md border bg-muted/30 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
              />
              <Button
                size="sm"
                onClick={handleParsePasteSql}
                disabled={!sqlText.trim()}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                Parse SQL
              </Button>
            </div>
          )}

          {/* ── Dashboard JSON tab ─────────────────────────────────────── */}
          {activeTab === 'dashboard' && (
            <div className="space-y-3">
              {/* File upload */}
              <div
                className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border/60 bg-muted/20 p-6 gap-2 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => dashboardInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Click to upload a Grafana dashboard JSON export
                </p>
                <p className="text-xs text-muted-foreground/70 text-center">
                  Dashboard → Share → Export → Save to file
                </p>
              </div>
              <input
                ref={dashboardInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleDashboardFile}
              />

              {dashboardError && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {dashboardError}
                </div>
              )}

              {panelTargets.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Select panel
                  </label>
                  <div className="relative">
                    <select
                      value={selectedTargetIdx}
                      onChange={(e) => { setSelectedTargetIdx(Number(e.target.value)); setPreview(null) }}
                      className="w-full h-9 rounded-md border bg-background px-3 pr-8 text-sm appearance-none cursor-pointer"
                    >
                      {panelTargets.map((t, i) => (
                        <option key={i} value={i}>
                          {t.panelTitle} — {t.panelType}
                          {panelTargets.filter((x) => x.panelTitle === t.panelTitle).length > 1
                            ? ` (query ${t.targetIndex + 1})`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>

                  {selectedTarget && (
                    <div className="rounded-md border bg-muted/30 overflow-hidden">
                      <div className="px-3 py-1.5 border-b bg-muted/50 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">SQL Preview</span>
                        <span className="text-xs text-muted-foreground/60">{selectedTarget.panelType}</span>
                      </div>
                      <pre className="p-3 text-xs font-mono overflow-x-auto max-h-[180px] overflow-y-auto whitespace-pre-wrap">
                        {selectedTarget.rawSql}
                      </pre>
                    </div>
                  )}

                  <Button
                    size="sm"
                    onClick={handleParseDashboardSql}
                    disabled={!selectedTarget}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    Parse SQL
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Parse error ────────────────────────────────────────────── */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {/* ── Parse result preview ───────────────────────────────────── */}
          {preview && <ParseResultPreview preview={preview} />}
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {canImportRaw && (
            <Button
              variant="outline"
              onClick={handleImportRawSql}
              disabled={importing}
              className="border-amber-400 text-amber-700 hover:bg-amber-50"
            >
              {importing ? 'Importing…' : 'Import as Raw SQL'}
            </Button>
          )}
          <Button
            onClick={handleImport}
            disabled={!canImport || importing}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {importing ? 'Importing…' : 'Import into Builder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── ParseResultPreview component ──────────────────────────────────────────

function ParseResultPreview({ preview }: { preview: ParsedPreview }) {
  const { queryState, warnings, detectedTables } = preview
  const hasNoTables = queryState.tables.length === 0 && queryState.ctes.length === 0
  const unknownTableWarnings = warnings.filter((w) => w.includes('not found in Schema Admin'))
  const otherWarnings = warnings.filter((w) => !w.includes('not found in Schema Admin'))

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/20">
      {/* Detected tables */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Detected tables
        </p>
        {hasNoTables ? (
          <div className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            No tables resolved — import not possible. Are these tables registered in Schema Admin?
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {queryState.tables.map((t) => (
              <span
                key={t.id}
                className="rounded-full bg-teal-100 text-teal-700 px-2 py-0.5 text-xs font-medium"
              >
                {t.tableName}
                {t.alias !== t.tableName && ` (${t.alias})`}
              </span>
            ))}
            {queryState.ctes.map((cte) => (
              <span
                key={cte.id}
                className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium"
              >
                CTE: {cte.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Unknown table warnings */}
      {unknownTableWarnings.length > 0 && (
        <div className="space-y-1">
          {unknownTableWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {w}
            </div>
          ))}
          <p className="text-xs text-amber-600 italic">
            Register missing tables in Schema Admin, then try importing again.
          </p>
        </div>
      )}

      {/* Other warnings */}
      {otherWarnings.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notices</p>
          <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1">
            {otherWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="mt-0.5 text-amber-500 shrink-0">⚠</span>
                {w}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {!hasNoTables && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground border-t pt-2">
          <CheckCircle className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />
          <span>
            Ready to import: {queryState.tables.length} table{queryState.tables.length !== 1 ? 's' : ''},
            {' '}{queryState.selectedColumns.length} column{queryState.selectedColumns.length !== 1 ? 's' : ''},
            {queryState.joins.length > 0 ? ` ${queryState.joins.length} join${queryState.joins.length !== 1 ? 's' : ''},` : ''}
            {queryState.where.rules.length > 0 ? ` WHERE clause,` : ''}
            {queryState.groupBy.length > 0 ? ` GROUP BY,` : ''}
            {queryState.orderBy.length > 0 ? ` ORDER BY` : ''}
            {preview.detectedPanelType ? ` — Grafana panel type: ${preview.detectedPanelType}` : ''}
            . This will replace your current canvas.
          </span>
        </div>
      )}
    </div>
  )
}
