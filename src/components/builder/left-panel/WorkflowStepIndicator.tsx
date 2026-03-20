'use client'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkflowProgress, type WorkflowProgress } from '@/hooks/useWorkflowProgress'

interface StepDef {
  shortLabel: string
  /** Returns true when this step is considered complete */
  isComplete: (p: WorkflowProgress) => boolean
  /** Optional steps show a dashed ring and "(opt)" label when incomplete */
  optional?: boolean
}

const STEPS: StepDef[] = [
  { shortLabel: 'Tables',  isComplete: (p) => p.hasTables },
  { shortLabel: 'Columns', isComplete: (p) => p.hasColumns },
  { shortLabel: 'Filters', isComplete: (p) => p.hasFilters },
  // GROUP BY is optional until Phase 2 wires isGroupByRequired
  { shortLabel: 'Group',   isComplete: (p) => p.hasGrouping, optional: true },
  { shortLabel: 'Sort',    isComplete: (p) => p.hasSort },
  { shortLabel: 'SQL',     isComplete: (p) => p.hasSql },
]

export function WorkflowStepIndicator() {
  const progress = useWorkflowProgress()

  // Phase 2: when isGroupByRequired becomes true, clear the optional flag dynamically
  const steps = STEPS.map((s) =>
    s.shortLabel === 'Group' && progress.isGroupByRequired
      ? { ...s, optional: false }
      : s
  )

  const firstIncompleteIdx = steps.findIndex((s) => !s.isComplete(progress))

  return (
    <div className="w-full px-2 pt-1 pb-2">
      {/* Circles row */}
      <div className="flex items-center">
        {steps.map((step, i) => {
          const isComplete = step.isComplete(progress)
          const isActive   = firstIncompleteIdx === i

          return (
            <div key={step.shortLabel} className="contents">
              <div
                className={cn(
                  'h-5 w-5 flex-shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors',
                  isComplete && 'bg-blue-600 text-white border-2 border-blue-600',
                  isActive   && 'bg-background border-2 border-blue-500 text-blue-600',
                  !isComplete && !isActive && step.optional &&
                    'bg-background border-2 border-dashed border-muted-foreground/30 text-muted-foreground/40',
                  !isComplete && !isActive && !step.optional &&
                    'bg-background border-2 border-muted-foreground/25 text-muted-foreground/40',
                )}
              >
                {isComplete
                  ? <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  : i + 1
                }
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-px mx-0.5',
                    i < firstIncompleteIdx || firstIncompleteIdx === -1
                      ? 'bg-blue-300'
                      : step.optional
                        ? 'border-t border-dashed border-muted-foreground/20 h-0'
                        : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Labels row — mirrors the circles row structure to keep alignment */}
      <div className="flex mt-0.5">
        {steps.map((step, i) => {
          const isComplete = step.isComplete(progress)
          const isActive   = firstIncompleteIdx === i

          return (
            <div key={step.shortLabel} className="contents">
              <div className="w-5 flex-shrink-0 flex flex-col items-center">
                <span
                  className={cn(
                    'text-[8px] leading-tight text-center',
                    isComplete && 'text-blue-600 font-medium',
                    isActive   && 'text-foreground font-semibold',
                    !isComplete && !isActive && 'text-muted-foreground/50',
                  )}
                >
                  {step.shortLabel}
                </span>
                {step.optional && !isComplete && (
                  <span className="text-[7px] leading-none text-muted-foreground/40">(opt)</span>
                )}
              </div>
              {i < steps.length - 1 && <div className="flex-1" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
