'use client'
import { useState, useEffect } from 'react'
import { DndContext } from '@dnd-kit/core'
import { TableLibrary } from './left-panel/TableLibrary'
import { QueryCanvas } from './canvas/QueryCanvas'
import { RightPanel } from './right-panel/RightPanel'
import { OnboardingOverlay, ONBOARDING_STORAGE_KEY } from './OnboardingOverlay'
import { TemplateLibrary } from './TemplateLibrary'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useQueryStore } from '@/store/queryStore'
import { useJsonStructureStore } from '@/store/jsonStructureStore'
import { api } from '@/lib/api/client'
import { Save, FolderOpen, RotateCcw, Database, Copy, HelpCircle, LayoutTemplate, ArrowLeft } from 'lucide-react'
import type { QueryResponse } from '@/types/api'

export function BuilderLayout() {
  const queryState = useQueryStore((s) => s.queryState)
  const generatedSql = useQueryStore((s) => s.generatedSql)
  const userEditedSql = useQueryStore((s) => s.userEditedSql)
  const loadQueryState = useQueryStore((s) => s.loadQueryState)
  const resetQuery = useQueryStore((s) => s.resetQuery)
  const activeCteId = useQueryStore((s) => s.activeCteId)
  const stopEditingCte = useQueryStore((s) => s.stopEditingCte)
  const activeCte = activeCteId ? queryState.ctes.find((c) => c.id === activeCteId) : null

  const loadStructures = useJsonStructureStore((s) => s.loadStructures)
  useEffect(() => { loadStructures() }, [loadStructures])

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
      setOnboardingOpen(true)
    }
  }, [])

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [savedQueries, setSavedQueries] = useState<QueryResponse[]>([])
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      await api.queries.create({
        name: saveName,
        description: saveDesc || undefined,
        queryState,
        generatedSql,
      })
      setSaveDialogOpen(false)
      setSaveName('')
      setSaveDesc('')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenLoad = async () => {
    const queries = await api.queries.list()
    setSavedQueries(queries)
    setLoadDialogOpen(true)
  }

  const handleLoad = (q: QueryResponse) => {
    loadQueryState(q.queryState as Parameters<typeof loadQueryState>[0])
    setLoadDialogOpen(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(userEditedSql ?? generatedSql)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* NavBar */}
      <nav className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Database className="h-4 w-4 text-blue-600" />
          SQL Query Builder
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/schema" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-accent transition-colors">
            Schema Admin
          </a>
          <Button variant="outline" size="sm" onClick={handleOpenLoad}>
            <FolderOpen className="mr-1 h-3.5 w-3.5" />
            Load
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
            <Save className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            Copy SQL
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTemplatesOpen(true)}>
            <LayoutTemplate className="mr-1 h-3.5 w-3.5" />
            Templates
          </Button>
          <Button variant="ghost" size="sm" onClick={resetQuery}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOnboardingOpen(true)}
            title="Take the tour"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </nav>

      {/* Three-column layout */}
      <DndContext>
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel */}
          <div className="w-72 shrink-0 overflow-hidden border-r bg-background">
            <TableLibrary />
          </div>

          {/* Canvas column */}
          <div className="relative flex flex-col flex-1 overflow-hidden">
            {/* CTE editing banner */}
            {activeCte && (
              <div className="flex shrink-0 items-center gap-3 border-b bg-blue-50 px-3 py-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={stopEditingCte}
                >
                  <ArrowLeft className="h-3 w-3" />
                  Main query
                </Button>
                <span className="text-xs text-blue-700">
                  Editing CTE: <span className="font-semibold">{activeCte.name}</span>
                </span>
                {activeCte.rawSql !== undefined && activeCte.rawSql !== null && (
                  <span className="rounded bg-purple-100 text-purple-700 px-1 py-0.5 text-[10px]">
                    Raw SQL mode — canvas inactive
                  </span>
                )}
              </div>
            )}

            {/* Canvas with optional blue tint overlay for CTE mode */}
            <div className={`relative flex-1 overflow-hidden${activeCte ? ' ring-2 ring-blue-400 ring-inset' : ''}`}>
              <QueryCanvas onStartTour={() => setOnboardingOpen(true)} />
            </div>
          </div>

          {/* Right Panel */}
          <div className="w-96 shrink-0 overflow-hidden min-w-0">
            <RightPanel />
          </div>
        </div>
      </DndContext>

      <OnboardingOverlay
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
      <TemplateLibrary
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Query</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="My Query" />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Input value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} placeholder="What does this query do?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !saveName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Dialog */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Load Query</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {savedQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No saved queries yet.</p>
            ) : (
              savedQueries.map((q) => (
                <button
                  key={q.id}
                  className="w-full rounded-md border p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => handleLoad(q)}
                >
                  <div className="font-medium text-sm">{q.name}</div>
                  {q.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{q.description}</div>
                  )}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoadDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
