// Extracts PostgreSQL panel queries from a Grafana dashboard export JSON.

export interface GrafanaPanelTarget {
  panelId: number
  panelTitle: string
  panelType: string   // raw Grafana panel type string, e.g. 'timeseries', 'stat', 'table'
  targetIndex: number
  rawSql: string
}

interface RawPanel {
  id?: number
  title?: string
  type?: string
  targets?: RawTarget[]
  panels?: RawPanel[]  // nested inside row panels
}

interface RawTarget {
  rawSql?: string
  rawQuery?: boolean
}

/** Map Grafana panel type strings to the app's GrafanaPanelType. */
export function mapGrafanaPanelType(
  grafanaType: string
): 'time-series' | 'stat' | 'bar-chart' | 'table' | 'heatmap' | undefined {
  const t = grafanaType.toLowerCase()
  if (t === 'timeseries' || t === 'graph' || t === 'graph-old') return 'time-series'
  if (t === 'stat' || t === 'singlestat') return 'stat'
  if (t === 'barchart' || t === 'bar-chart') return 'bar-chart'
  if (t === 'table' || t === 'table-old') return 'table'
  if (t === 'heatmap') return 'heatmap'
  return undefined
}

/**
 * Parse a raw Grafana dashboard JSON string and extract all PostgreSQL panel queries.
 * Returns an array of panel targets with their raw SQL.
 * Throws a descriptive Error if JSON is invalid or no SQL targets are found.
 */
export function extractGrafanaPanelTargets(dashboardJson: string): GrafanaPanelTarget[] {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(dashboardJson)
  } catch {
    throw new Error('Invalid JSON: could not parse the uploaded file.')
  }

  if (!parsed.panels || !Array.isArray(parsed.panels)) {
    throw new Error(
      'Not a valid Grafana dashboard export: missing "panels" array. ' +
      'Export your dashboard via Dashboard → Share → Export → Save to file.'
    )
  }

  // Flatten panels — row panels contain nested panels arrays
  const allPanels: RawPanel[] = []
  for (const panel of parsed.panels as RawPanel[]) {
    if (panel.type === 'row' && Array.isArray(panel.panels)) {
      allPanels.push(...panel.panels)
    } else {
      allPanels.push(panel)
    }
  }

  const results: GrafanaPanelTarget[] = []
  for (const panel of allPanels) {
    if (!Array.isArray(panel.targets)) continue
    panel.targets.forEach((target, idx) => {
      const sql = target.rawSql?.trim()
      if (sql) {
        results.push({
          panelId: panel.id ?? 0,
          panelTitle: panel.title ?? `Panel ${panel.id ?? idx}`,
          panelType: panel.type ?? 'unknown',
          targetIndex: idx,
          rawSql: sql,
        })
      }
    })
  }

  if (results.length === 0) {
    throw new Error(
      'No PostgreSQL panels with raw SQL found in this dashboard. ' +
      'Make sure your panels use "Edit SQL" / "Raw SQL" mode rather than the Grafana query builder.'
    )
  }

  return results
}
