'use client'
import { useState, type ReactNode } from 'react'
import { Table2, CheckSquare, Filter, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'qb-onboarding-dismissed'

interface OnboardingStep {
  title: string
  body: ReactNode
  hint: string
  icon: React.ElementType
}

const STEPS: OnboardingStep[] = [
  {
    icon: Table2,
    title: 'Add a table to the canvas',
    body: 'All your data lives in tables. Drag any table card from the left panel onto the canvas to begin building your query.',
    hint: 'Try dragging the "event" or "agg_event" table onto the canvas — they contain the raw and pre-aggregated OEE data.',
  },
  {
    icon: CheckSquare,
    title: 'Check the columns you need',
    body: 'Click the checkboxes next to each column inside the table card. Checked columns appear in the SELECT clause of your SQL.',
    hint: 'Start with just the columns you\'ll use in your analysis — you can change them at any time.',
  },
  {
    icon: Filter,
    title: 'Always add a time filter',
    body: (
      <>
        The <strong>event</strong> table has over 20 billion rows at some factories. A query without
        a time filter will time out. Always add{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          $__timeFilter(&quot;time&quot;)
        </code>{' '}
        to limit results to Grafana&apos;s selected time range.
      </>
    ),
    hint: 'Open the WHERE tab → Add filter → choose the "time" column → select "Grafana: $__timeFilter". This is mandatory for event and agg_event queries.',
  },
  {
    icon: Copy,
    title: 'Copy your SQL to Grafana',
    body: 'When your query looks right in the SQL Preview tab, copy it directly into Grafana\'s query editor. The Grafana tab has helpers for time-series macros like ORDER BY time and $__timeGroup.',
    hint: 'Use the Copy SQL button in the top bar, or open the Grafana tab for panel-type-specific helpers before copying.',
  },
]

interface OnboardingOverlayProps {
  open: boolean
  onClose: () => void
}

export function OnboardingOverlay({ open, onClose }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0)

  if (!open) return null

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1
  const Icon    = current.icon

  function dismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    onClose()
  }

  function handleNext() {
    if (isLast) {
      dismiss()
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Skip tour"
        >
          <X className="h-3.5 w-3.5" />
          Skip
        </button>

        {/* Step counter */}
        <p className="text-xs font-medium text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Icon + title */}
        <div className="mt-4 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="pt-1.5 text-base font-semibold leading-snug">{current.title}</h2>
        </div>

        {/* Body */}
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{current.body}</p>

        {/* Hint box */}
        <div className="mt-4 rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground italic leading-relaxed">
          {current.hint}
        </div>

        {/* Progress dots */}
        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step
                  ? 'w-4 bg-blue-600'
                  : i < step
                    ? 'w-1.5 bg-blue-300'
                    : 'w-1.5 bg-muted-foreground/25',
              )}
            />
          ))}
        </div>

        {/* Footer buttons */}
        <div className="mt-5 flex justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            Back
          </Button>
          <Button size="sm" onClick={handleNext}>
            {isLast ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export { STORAGE_KEY as ONBOARDING_STORAGE_KEY }
