'use client'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTeamOvertimeReport } from '@/hooks/useTeamOvertimeReport'
import type { TeamOvertimeRow } from '@/hooks/useTeamOvertimeReport'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtHours(minutes: number): string {
  if (minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function totalMinutesForTeam(rows: TeamOvertimeRow[], teamId: string): number {
  return rows.filter((r) => r.team_id === teamId).reduce((s, r) => s + r.overtime_minutes, 0)
}

function minutesForTeamMonth(rows: TeamOvertimeRow[], teamId: string, monthIdx: number): number {
  const mm = String(monthIdx + 1).padStart(2, '0')
  const row = rows.find((r) => r.team_id === teamId && r.month.slice(5, 7) === mm)
  return row?.overtime_minutes ?? 0
}

interface DivisionGroup {
  divisionId: string
  divisionName: string
  divisionColor: string
  teams: Array<{ team_id: string; team_name: string }>
}

function buildGroups(rows: TeamOvertimeRow[]): DivisionGroup[] {
  const map = new Map<string, DivisionGroup>()
  const teamSeen = new Set<string>()
  for (const r of rows) {
    if (!map.has(r.division_id)) {
      map.set(r.division_id, {
        divisionId: r.division_id,
        divisionName: r.division_name,
        divisionColor: r.division_color,
        teams: [],
      })
    }
    if (!teamSeen.has(r.team_id)) {
      teamSeen.add(r.team_id)
      map.get(r.division_id)!.teams.push({ team_id: r.team_id, team_name: r.team_name })
    }
  }
  return Array.from(map.values())
}

export function OvertimeReportTable() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const { data: rows = [], isLoading } = useTeamOvertimeReport(year)

  const groups = useMemo(() => buildGroups(rows), [rows])

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + r.overtime_minutes, 0),
    [rows],
  )

  const monthlyGrand = useMemo(
    () =>
      MONTHS.map((_, mi) =>
        rows.filter((r) => r.month.slice(5, 7) === String(mi + 1).padStart(2, '0'))
          .reduce((s, r) => s + r.overtime_minutes, 0),
      ),
    [rows],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[4ch] text-center font-semibold text-sm">{year}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= currentYear}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {grandTotal > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Total OT this year: <strong className="text-foreground">{fmtHours(grandTotal)}</strong></span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
              <th className="sticky left-0 z-10 bg-muted/50 text-left px-4 py-2.5 font-medium min-w-[180px]">
                Team
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2.5 font-medium text-center min-w-[60px]">{m}</th>
              ))}
              <th className="px-3 py-2.5 font-medium text-center min-w-[70px] border-l border-border">Total</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={14} className="py-16 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}

            {!isLoading && groups.length === 0 && (
              <tr>
                <td colSpan={14} className="py-16 text-center text-muted-foreground">
                  No overtime recorded for {year}
                </td>
              </tr>
            )}

            {groups.map((div) => {
              const divTotal = div.teams.reduce(
                (s, t) => s + totalMinutesForTeam(rows, t.team_id),
                0,
              )
              return [
                /* Division header row */
                <tr key={`div-${div.divisionId}`} className="bg-orange-50/80">
                  <td
                    colSpan={14}
                    className="sticky left-0 z-10 bg-orange-50/80 px-4 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-orange-300/50" />
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: div.divisionColor }}
                        />
                        <span className="text-[11px] font-bold text-orange-600 tracking-widest uppercase">
                          {div.divisionName}
                        </span>
                        {divTotal > 0 && (
                          <span className="text-[10px] text-orange-500 font-medium">
                            ({fmtHours(divTotal)})
                          </span>
                        )}
                      </div>
                      <div className="flex-1 h-px bg-orange-300/50" />
                    </div>
                  </td>
                </tr>,

                /* Team rows */
                ...div.teams.map((team) => {
                  const teamTotal = totalMinutesForTeam(rows, team.team_id)
                  return (
                    <tr
                      key={team.team_id}
                      className="border-t border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="sticky left-0 z-10 bg-background px-4 py-2 font-medium text-foreground">
                        {team.team_name}
                      </td>
                      {MONTHS.map((_, mi) => {
                        const mins = minutesForTeamMonth(rows, team.team_id, mi)
                        return (
                          <td key={mi} className="px-2 py-2 text-center">
                            {mins > 0 ? (
                              <span className="inline-flex items-center justify-center rounded-md bg-red-50 text-red-700 text-[11px] font-medium px-1.5 py-0.5">
                                {fmtHours(mins)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center border-l border-border">
                        {teamTotal > 0 ? (
                          <span className="font-semibold text-red-700">{fmtHours(teamTotal)}</span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    </tr>
                  )
                }),
              ]
            })}

            {/* Grand total footer */}
            {!isLoading && grandTotal > 0 && (
              <tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
                <td className="sticky left-0 z-10 bg-muted/30 px-4 py-2.5 text-foreground">
                  Grand Total
                </td>
                {monthlyGrand.map((mins, mi) => (
                  <td key={mi} className="px-2 py-2.5 text-center">
                    {mins > 0 ? (
                      <span className="text-foreground">{fmtHours(mins)}</span>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center border-l border-border text-red-700">
                  {fmtHours(grandTotal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
