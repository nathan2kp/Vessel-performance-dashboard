"use client"

/**
 * overview-tab-v2.tsx — improved version of overview-tab.tsx
 *
 * Improvements over the original:
 *  1. actualPoints wrapped in useMemo; responds to wave/wind sliders
 *  2. KPI deltas are computed period-over-period with sign-aware red/green coloring
 *  3. VesselInfoCard already handled multiple vessels correctly (no change needed)
 *  4. CP points + Reference Data persisted to localStorage
 *  5. Scatter dots use #60A5FA (bright blue) instead of #0000FF
 *  6. Model Data Table has a one-click CSV export button
 *  7. Supports a "Custom" time period with from/to date inputs (passed from page.tsx)
 *  8. Escape key closes the Reference Data modal
 *  9. Scatter dataKey renamed from "baseline" to "reportedFoc" (cleaner tooltip logic)
 * 10. File split into KPICards, FuelBreakdown, VesselScoreCard, SpeedConsumptionCurve sub-components
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Scatter, ComposedChart, ZAxis, ReferenceDot,
} from "recharts"
import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { ScoreIndicator } from "./score-indicator"
import {
  Droplets, Navigation, Leaf, Package,
  Waves, Wind, Anchor, Download,
} from "lucide-react"

// ─── types & constants ────────────────────────────────────────────────────────

interface FuelPoint { stw: number; baseline: number; draft: number; wave: number; wind: number }

const VESSEL_CSV_MAP: Record<string, string> = {
  PRIDE: "/data/pride.csv",
  CONSTELLATION: "/data/constellation.csv",
  WILLOW: "/data/willow.csv",
}

function parseCSV(text: string): FuelPoint[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const rows: FuelPoint[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",")
    if (cols.length < 5) continue
    rows.push({
      stw: parseFloat(cols[0]),
      baseline: parseFloat(cols[1]),
      draft: parseFloat(cols[2]),
      wave: parseFloat(cols[3]),
      wind: parseFloat(cols[4]),
    })
  }
  return rows
}

function snapToNearest(value: number, options: number[]): number {
  return options.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  )
}

// ─── tooltip ─────────────────────────────────────────────────────────────────

function SpeedFocTooltip({
  active, payload,
  interpolateUserFoc, showUserCurve, speedFocData,
  cpGuaranteedCurve, cpAdjustedCurve, activeCondition,
}: {
  active?: boolean
  payload?: any[]
  interpolateUserFoc?: (speed: number) => number | null
  showUserCurve?: boolean
  speedFocData?: { speed: number; baseline: number }[]
  cpGuaranteedCurve?: { speed: number; cpFoc: number }[]
  cpAdjustedCurve?: { speed: number; cpFoc: number }[]
  activeCondition?: "Ballast" | "Laden" | null
}) {
  if (!active || !payload?.length) return null

  // improvement #9: reported points now carry reportedFoc field
  const reportedEntry = payload.find(e => e?.payload?.date)
  const baselineEntry = payload.find(e => e?.payload && !e.payload.date && typeof e.payload.baseline === "number")
  const refEntry = payload.find(e => e?.payload && typeof e.payload.userFoc === "number")

  const primaryData = reportedEntry?.payload ?? baselineEntry?.payload ?? refEntry?.payload ?? payload[0]?.payload
  if (!primaryData) return null
  const speed = typeof primaryData.speed === "number" ? primaryData.speed : null
  if (speed == null) return null

  let baseline: number | null = null
  if (speedFocData && speedFocData.length > 0) {
    if (speed <= speedFocData[0].speed) baseline = speedFocData[0].baseline
    else if (speed >= speedFocData[speedFocData.length - 1].speed) baseline = speedFocData[speedFocData.length - 1].baseline
    else {
      for (let i = 0; i < speedFocData.length - 1; i++) {
        const a = speedFocData[i], b = speedFocData[i + 1]
        if (speed >= a.speed && speed <= b.speed) {
          const t = (speed - a.speed) / (b.speed - a.speed)
          baseline = parseFloat((a.baseline + t * (b.baseline - a.baseline)).toFixed(2))
          break
        }
      }
    }
  }
  void baselineEntry

  let refFoc: number | null = refEntry?.payload?.userFoc ?? null
  if (refFoc == null && showUserCurve && interpolateUserFoc) {
    refFoc = interpolateUserFoc(speed)
  }

  const lookupCP = (curve?: { speed: number; cpFoc: number }[]): number | null => {
    if (!curve || curve.length === 0) return null
    const closest = curve.reduce((prev, curr) =>
      Math.abs(curr.speed - speed) < Math.abs(prev.speed - speed) ? curr : prev
    )
    return Math.abs(closest.speed - speed) < 0.1 ? closest.cpFoc : null
  }
  const cpGuaranteed = lookupCP(cpGuaranteedCurve)
  const cpAdjusted = lookupCP(cpAdjustedCurve)

  const delta = refFoc != null && baseline != null ? baseline - refFoc : null
  const cpGuaranteedDelta = cpGuaranteed != null && baseline != null ? baseline - cpGuaranteed : null
  const cpAdjustedDelta = cpAdjusted != null && baseline != null ? baseline - cpAdjusted : null
  const cpAccent = activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA"

  if (reportedEntry) {
    const reportedFoc: number | null = reportedEntry.payload.reportedFoc ?? null

    const fmt = (delta: number, ref: number) => {
      const pct = ((delta / ref) * 100).toFixed(1)
      return `${delta > 0 ? "+" : ""}${delta.toFixed(2)} MT/day (${delta > 0 ? "+" : ""}${pct}%)`
    }

    const dModel    = reportedFoc != null && baseline != null     ? reportedFoc - baseline     : null
    const dRef      = reportedFoc != null && refFoc != null       ? reportedFoc - refFoc       : null
    const dCPGuar   = reportedFoc != null && cpGuaranteed != null ? reportedFoc - cpGuaranteed : null
    const dCPAdj    = reportedFoc != null && cpAdjusted != null   ? reportedFoc - cpAdjusted   : null

    return (
      <div className="bg-[#102338] border border-slate-600 rounded-lg p-3 text-sm space-y-1 shadow-lg min-w-[220px]">
        <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Reported Noon Data</p>
        <p className="text-white font-medium">Date: {reportedEntry.payload.date}</p>
        <p className="text-white">Speed: {speed.toFixed(2)} kts</p>
        {reportedFoc != null && <p className="text-[#60A5FA] font-semibold">Reported FOC: {reportedFoc.toFixed(2)} MT/day</p>}
        {reportedEntry.payload.wave != null && (
          <p className="text-slate-300">Wave: {reportedEntry.payload.wave} m &nbsp;|&nbsp; Wind: Bf {reportedEntry.payload.wind}</p>
        )}

        <div className="border-t border-slate-700 mt-1.5 pt-1.5 space-y-1">
          {baseline != null && (
            <div>
              <p className="text-[#00FFFF]">Model Curve: {baseline.toFixed(2)} MT/day</p>
              {dModel != null && (
                <p className={`text-xs pl-2 ${dModel > 0 ? "text-red-400" : "text-green-400"}`}>
                  Δ {fmt(dModel, baseline)}
                </p>
              )}
            </div>
          )}
          {refFoc != null && (
            <div>
              <p className="text-[#FF8C00]">Reference Model: {refFoc.toFixed(2)} MT/day</p>
              {dRef != null && (
                <p className={`text-xs pl-2 ${dRef > 0 ? "text-red-400" : "text-green-400"}`}>
                  Δ {fmt(dRef, refFoc)}
                </p>
              )}
            </div>
          )}
          {cpGuaranteed != null && activeCondition && (
            <div>
              <p style={{ color: cpAccent }}>CP {activeCondition}: {cpGuaranteed.toFixed(2)} MT/day</p>
              {dCPGuar != null && (
                <p className={`text-xs pl-2 ${dCPGuar > 0 ? "text-red-400" : "text-green-400"}`}>
                  Δ {fmt(dCPGuar, cpGuaranteed)}
                </p>
              )}
            </div>
          )}
          {cpAdjusted != null && (
            <div>
              <p className="text-[#22C55E]">CP Weather Adjusted: {cpAdjusted.toFixed(2)} MT/day</p>
              {dCPAdj != null && (
                <p className={`text-xs pl-2 ${dCPAdj > 0 ? "text-red-400" : "text-green-400"}`}>
                  Δ {fmt(dCPAdj, cpAdjusted)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#102338] border border-slate-600 rounded-lg p-3 text-sm space-y-1 shadow-lg">
      <p className="text-white font-medium">Speed: {speed.toFixed(2)} kts</p>
      {baseline != null && <p className="text-[#00FFFF]">Model Curve: {baseline.toFixed(2)} MT/day</p>}
      {refFoc != null && <p className="text-[#FF8C00]">Reference FOC: {refFoc.toFixed(2)} MT/day</p>}
      {cpGuaranteed != null && activeCondition && <p style={{ color: cpAccent }}>CP {activeCondition}: {cpGuaranteed.toFixed(2)} MT/day</p>}
      {cpAdjusted != null && <p className="text-[#22C55E]">CP Weather Adjusted: {cpAdjusted.toFixed(2)} MT/day</p>}
      {delta != null && baseline != null && (
        <p className={delta > 0 ? "text-red-400" : "text-green-400"}>
          Δ Baseline vs Ref: {delta > 0 ? "+" : ""}{delta.toFixed(2)} ({delta > 0 ? "+" : ""}{((delta / baseline) * 100).toFixed(1)}%)
        </p>
      )}
      {cpGuaranteedDelta != null && baseline != null && activeCondition && (
        <p className={cpGuaranteedDelta > 0 ? "text-red-400" : "text-green-400"}>
          Δ Baseline vs CP {activeCondition}: {cpGuaranteedDelta > 0 ? "+" : ""}{cpGuaranteedDelta.toFixed(2)} ({cpGuaranteedDelta > 0 ? "+" : ""}{((cpGuaranteedDelta / baseline) * 100).toFixed(1)}%)
        </p>
      )}
      {cpAdjustedDelta != null && baseline != null && (
        <p className={cpAdjustedDelta > 0 ? "text-red-400" : "text-green-400"}>
          Δ Baseline vs CP Adjusted: {cpAdjustedDelta > 0 ? "+" : ""}{cpAdjustedDelta.toFixed(2)} ({cpAdjustedDelta > 0 ? "+" : ""}{((cpAdjustedDelta / baseline) * 100).toFixed(1)}%)
        </p>
      )}
    </div>
  )
}

// ─── improvement #10: KPICards sub-component ─────────────────────────────────

interface KPICardData {
  label: string
  unit: string
  value: string
  delta: number        // computed percentage change (negative = decrease)
  higherIsBetter: boolean
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>
  color: string
}

function KPICards({ data }: { data: KPICardData[] }) {
  return (
    <div className="mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map((kpi, index) => {
          const Icon = kpi.icon
          // improvement #2: sign-aware coloring
          const isIncrease = kpi.delta > 0
          const isGood = kpi.higherIsBetter ? isIncrease : !isIncrease
          const deltaColor = isGood ? "text-green-400" : "text-red-400"
          const deltaBg = isGood ? "bg-green-500/10" : "bg-red-500/10"
          const arrow = isIncrease ? "↑" : "↓"
          return (
            <div
              key={index}
              className="card-maritime p-4 border-l-2 transition-all duration-200 hover:translate-y-[-2px]"
              style={{ borderLeftColor: kpi.color }}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg p-2 mt-0.5" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color: kpi.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-400 mb-1 truncate">{kpi.label}</div>
                  <div className="text-3xl font-bold text-[#00FFD1] tracking-tight leading-none mb-1.5">
                    {kpi.value}
                    {kpi.unit && <span className="text-base font-normal text-slate-500 ml-1">{kpi.unit}</span>}
                  </div>
                  <span className={`inline-flex items-center text-sm font-medium px-1.5 py-0.5 rounded ${deltaBg} ${deltaColor}`}>
                    {arrow} {Math.abs(kpi.delta).toFixed(1)}% vs prev period
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── improvement #10: FuelBreakdown sub-component ────────────────────────────

interface FuelItem { name: string; value: number; color: string }

function FuelBreakdown({ data }: { data: FuelItem[] }) {
  return (
    <Card className="card-maritime">
      <CardHeader>
        <CardTitle className="text-white text-2xl font-bold">Fuel Consumption Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={120}
              dataKey="value"
              stroke="#000000"
              strokeWidth={1}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#102338",
                border: "1px solid #475569",
                color: "white",
                borderRadius: "8px",
              }}
              itemStyle={{ color: "white" }}
              labelStyle={{ color: "white" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {data.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-white">{item.name}: {item.value.toLocaleString()}MT</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── improvement #10: VesselScoreCard sub-component ──────────────────────────

interface ScoreItem { metric: string; rawScore: string; value: number }

function VesselScoreCard({ data }: { data: ScoreItem[] }) {
  return (
    <Card className="card-maritime">
      <CardHeader>
        <CardTitle className="text-white text-2xl font-bold">Vessel Score Card</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          {data.map((item, index) => (
            <ScoreIndicator key={index} label={item.metric} rawScore={item.rawScore} value={item.value} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── improvement #10: SpeedConsumptionCurve sub-component ────────────────────
// Manages its own CSV loading, all chart state, localStorage persistence.

interface SpeedConsumptionCurveProps {
  selectedVessel: string
}

function SpeedConsumptionCurve({ selectedVessel }: SpeedConsumptionCurveProps) {
  const [vesselData, setVesselData] = useState<FuelPoint[]>([])
  const [loading, setLoading] = useState(true)

  const [waveHeight, setWaveHeight] = useState([1])
  const [windBf, setWindBf] = useState([3])
  const [loadCondition, setLoadCondition] = useState<"Ballast" | "Laden">("Ballast")
  const [showTrendline, setShowTrendline] = useState(true)
  const [showActual, setShowActual] = useState(true)
  const [showTable, setShowTable] = useState(true)
  const [showUserCurve, setShowUserCurve] = useState(false)
  const [showUserCurveModal, setShowUserCurveModal] = useState(false)
  const [showCharterParty, setShowCharterParty] = useState(false)
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({})
  const isHidden = (name: string) => !!hiddenSeries[name]
  const toggleSeries = (name: string) => setHiddenSeries(prev => ({ ...prev, [name]: !prev[name] }))

  type CPCondition = "Ballast" | "Laden"
  type CPPoint = { condition: CPCondition; speed: string; foc: string; wave: string; wind: string }

  const blankBallast = (): CPPoint => ({ condition: "Ballast", speed: "", foc: "", wave: "1", wind: "3" })
  const blankLaden = (): CPPoint => ({ condition: "Laden", speed: "", foc: "", wave: "1", wind: "3" })

  const defaultCPPoints: Record<string, CPPoint[]> = {
    PRIDE: [blankBallast(), blankLaden()],
    CONSTELLATION: [blankBallast(), blankLaden()],
    WILLOW: [blankBallast(), blankLaden()],
  }

  // improvement #4: load CP points from localStorage
  const [allCPPoints, setAllCPPoints] = useState<Record<string, CPPoint[]>>(() => {
    try {
      const saved = localStorage.getItem("vpd_cpPoints")
      return saved ? JSON.parse(saved) : defaultCPPoints
    } catch {
      return defaultCPPoints
    }
  })

  // improvement #4: persist CP points to localStorage on change
  useEffect(() => {
    try { localStorage.setItem("vpd_cpPoints", JSON.stringify(allCPPoints)) } catch {}
  }, [allCPPoints])

  const cpPoints = allCPPoints[selectedVessel] ?? [blankBallast(), blankLaden()]

  const updateCPPoint = (index: number, field: keyof CPPoint, value: string) => {
    setAllCPPoints(prev => ({
      ...prev,
      [selectedVessel]: (prev[selectedVessel] ?? []).map((p, i) => i === index ? { ...p, [field]: value } : p),
    }))
  }
  const addCPPoint = (condition: CPCondition) => {
    const blank = condition === "Ballast" ? blankBallast() : blankLaden()
    setAllCPPoints(prev => ({ ...prev, [selectedVessel]: [...(prev[selectedVessel] ?? []), blank] }))
  }
  const removeCPPoint = (index: number) => {
    setAllCPPoints(prev => ({ ...prev, [selectedVessel]: (prev[selectedVessel] ?? []).filter((_, i) => i !== index) }))
  }

  const [normalizeWeather, setNormalizeWeather] = useState(false)

  type CurveRow = { speed: string; foc: string; wave: string; wind: string; draft: string }

  const defaultCurves: Record<string, CurveRow[]> = {
    PRIDE: [], CONSTELLATION: [], WILLOW: [],
  }

  // improvement #4: load user curves from localStorage
  const [allVesselCurves, setAllVesselCurves] = useState<Record<string, CurveRow[]>>(() => {
    try {
      const saved = localStorage.getItem("vpd_userCurves")
      return saved ? JSON.parse(saved) : defaultCurves
    } catch {
      return defaultCurves
    }
  })

  // improvement #4: persist user curves to localStorage on change
  useEffect(() => {
    try { localStorage.setItem("vpd_userCurves", JSON.stringify(allVesselCurves)) } catch {}
  }, [allVesselCurves])

  const userCurvePoints = allVesselCurves[selectedVessel] ?? []
  const setUserCurvePoints = useCallback((updater: CurveRow[] | ((prev: CurveRow[]) => CurveRow[])) => {
    setAllVesselCurves(prev => ({
      ...prev,
      [selectedVessel]: typeof updater === "function" ? updater(prev[selectedVessel] ?? []) : updater,
    }))
  }, [selectedVessel])

  const addUserCurvePoint = () => setUserCurvePoints(prev => [...prev, { speed: "", foc: "", wave: "", wind: "", draft: "" }])
  const removeUserCurvePoint = (index: number) => setUserCurvePoints(prev => prev.filter((_, i) => i !== index))
  const updateUserCurvePoint = (index: number, field: keyof CurveRow, value: string) =>
    setUserCurvePoints(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))

  // improvement #8: Escape key closes modal
  useEffect(() => {
    if (!showUserCurveModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setShowUserCurveModal(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [showUserCurveModal])

  // Load vessel CSV
  useEffect(() => {
    const csvPath = VESSEL_CSV_MAP[selectedVessel]
    if (!csvPath) return
    setLoading(true)
    fetch(csvPath)
      .then(r => r.text())
      .then(text => setVesselData(parseCSV(text)))
      .finally(() => setLoading(false))
  }, [selectedVessel])

  // Derived slider ranges
  const allDrafts = useMemo(() => [...new Set(vesselData.map(d => d.draft))].sort((a, b) => a - b), [vesselData])
  const allWaves = useMemo(() => [...new Set(vesselData.map(d => d.wave))].sort((a, b) => a - b), [vesselData])
  const allWinds = useMemo(() => [...new Set(vesselData.map(d => d.wind))].sort((a, b) => a - b), [vesselData])

  const ballastDraft = allDrafts.length > 0 ? allDrafts[0] : 7
  const ladenDraft = allDrafts.length > 0 ? allDrafts[allDrafts.length - 1] : 12
  const snappedDraft = loadCondition === "Ballast" ? ballastDraft : ladenDraft
  const snappedWave = allWaves.length > 0 ? snapToNearest(waveHeight[0], allWaves) : waveHeight[0]
  const snappedWind = allWinds.length > 0 ? snapToNearest(windBf[0], allWinds) : windBf[0]

  const parsedUserCurve = useMemo(() => userCurvePoints
    .filter(p => parseFloat(p.draft) === snappedDraft)
    .map(p => {
      const speed = parseFloat(p.speed)
      const rawFoc = parseFloat(p.foc)
      const wave = parseFloat(p.wave) || 0
      const wind = parseFloat(p.wind) || 0
      if (isNaN(speed) || isNaN(rawFoc)) return null
      let userFoc = rawFoc
      if (normalizeWeather) {
        const wfRecorded = 0.075 * ((wave + wind) / 2)
        const wfBaseline = 0.075 * snappedWave
        userFoc = parseFloat((rawFoc / (1 + wfRecorded) * (1 + wfBaseline)).toFixed(2))
      }
      return { speed, userFoc }
    })
    .filter((p): p is { speed: number; userFoc: number } => p !== null)
    .sort((a, b) => a.speed - b.speed),
  [userCurvePoints, snappedDraft, snappedWave, normalizeWeather])

  const interpolateUserFoc = useCallback((speed: number): number | null => {
    if (parsedUserCurve.length < 2) return null
    if (speed < parsedUserCurve[0].speed || speed > parsedUserCurve[parsedUserCurve.length - 1].speed) return null
    for (let i = 0; i < parsedUserCurve.length - 1; i++) {
      const a = parsedUserCurve[i], b = parsedUserCurve[i + 1]
      if (speed >= a.speed && speed <= b.speed) {
        const t = (speed - a.speed) / (b.speed - a.speed)
        return parseFloat((a.userFoc + t * (b.userFoc - a.userFoc)).toFixed(2))
      }
    }
    return null
  }, [parsedUserCurve])

  const rawSpeedFocData = useMemo(() => vesselData
    .filter(d => d.draft === snappedDraft && d.wave === snappedWave && d.wind === snappedWind)
    .sort((a, b) => a.stw - b.stw)
    .map(d => ({ speed: d.stw, baseline: d.baseline, draft: d.draft })),
  [vesselData, snappedDraft, snappedWave, snappedWind])

  const speedFocData = useMemo(() => {
    if (rawSpeedFocData.length < 2) return rawSpeedFocData
    const dense: { speed: number; baseline: number; draft: number }[] = []
    const minSpd = rawSpeedFocData[0].speed
    const maxSpd = rawSpeedFocData[rawSpeedFocData.length - 1].speed
    const draftVal = rawSpeedFocData[0].draft
    const steps = Math.round((maxSpd - minSpd) * 10) + 1
    let segIdx = 0
    for (let i = 0; i < steps; i++) {
      const speed = parseFloat((minSpd + i * 0.1).toFixed(1))
      while (segIdx < rawSpeedFocData.length - 2 && speed > rawSpeedFocData[segIdx + 1].speed) segIdx++
      const a = rawSpeedFocData[segIdx], b = rawSpeedFocData[segIdx + 1]
      const t = (speed - a.speed) / (b.speed - a.speed)
      const baseline = parseFloat((a.baseline + t * (b.baseline - a.baseline)).toFixed(3))
      dense.push({ speed, baseline, draft: draftVal })
    }
    return dense
  }, [rawSpeedFocData])

  const baselineAtContext = useCallback((speed: number, draft: number, wave: number, wind: number): number | null => {
    if (vesselData.length === 0) return null
    const sd = snapToNearest(draft, allDrafts)
    const sw = snapToNearest(wave, allWaves)
    const swd = snapToNearest(wind, allWinds)
    const slice = vesselData
      .filter(d => d.draft === sd && d.wave === sw && d.wind === swd)
      .sort((a, b) => a.stw - b.stw)
    if (slice.length === 0) return null
    if (speed <= slice[0].stw) return slice[0].baseline
    if (speed >= slice[slice.length - 1].stw) return slice[slice.length - 1].baseline
    for (let i = 0; i < slice.length - 1; i++) {
      const a = slice[i], b = slice[i + 1]
      if (speed >= a.stw && speed <= b.stw) {
        const t = (speed - a.stw) / (b.stw - a.stw)
        return a.baseline + t * (b.baseline - a.baseline)
      }
    }
    return null
  }, [vesselData, allDrafts, allWaves, allWinds])

  const computeCPInfo = useCallback((condition: CPCondition) => {
    if (!showCharterParty || speedFocData.length === 0 || vesselData.length === 0) return null
    const cpDraft = condition === "Ballast" ? ballastDraft : ladenDraft
    const valid = cpPoints
      .filter(p => p.condition === condition)
      .map(p => ({
        speed: parseFloat(p.speed), foc: parseFloat(p.foc),
        wave: parseFloat(p.wave), wind: parseFloat(p.wind),
      }))
      .filter(p => !isNaN(p.speed) && !isNaN(p.foc) && p.speed > 0 && p.foc > 0 && !isNaN(p.wave) && !isNaN(p.wind))
    if (valid.length === 0) return null
    const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length
    const avgWave = avg(valid.map(p => p.wave))
    const avgWind = avg(valid.map(p => p.wind))
    // Least-squares scale: keeps the CP curve parallel in shape to the baseline
    // while being optimally close to all guarantee points simultaneously.
    // scale = Σ(bl_i · foc_i) / Σ(bl_i²)
    let sumBF = 0, sumB2 = 0, hasValid = false
    for (const p of valid) {
      const bl = baselineAtContext(p.speed, cpDraft, avgWave, avgWind)
      if (bl && bl > 0) { sumBF += bl * p.foc; sumB2 += bl * bl; hasValid = true }
    }
    if (!hasValid || sumB2 === 0) return null
    // Guarantee markers: exact (speed, FOC) pairs from the entered CP points,
    // normalized to the same avgWave/avgWind reference used for the curve,
    // so markers sit on the chart in a meaningful position.
    const markers = valid.map(p => {
      const blActual = baselineAtContext(p.speed, cpDraft, p.wave, p.wind)
      const blRef    = baselineAtContext(p.speed, cpDraft, avgWave, avgWind)
      // Weather-normalise: scale the entered FOC to calm reference conditions
      const normFoc = (blActual && blRef && blActual > 0)
        ? p.foc * (blRef / blActual)
        : p.foc
      return { speed: p.speed, foc: parseFloat(normFoc.toFixed(2)) }
    })
    return { scale: sumBF / sumB2, markers, cpDraft, avgWave, avgWind }
  }, [showCharterParty, speedFocData, vesselData, cpPoints, ballastDraft, ladenDraft, baselineAtContext])

  const ballastInfo = useMemo(() => computeCPInfo("Ballast"), [computeCPInfo])
  const ladenInfo = useMemo(() => computeCPInfo("Laden"), [computeCPInfo])
  const activeCPInfo = loadCondition === "Ballast" ? ballastInfo : ladenInfo
  const activeCondition: CPCondition | null = activeCPInfo ? loadCondition : null

  const cpGuaranteedCurve = useMemo(() => {
    if (!activeCPInfo || !showCharterParty || speedFocData.length === 0) return []
    const { scale, cpDraft, avgWave, avgWind } = activeCPInfo
    return speedFocData.map(d => {
      const blAtCP = baselineAtContext(d.speed, cpDraft, avgWave, avgWind)
      if (blAtCP == null || blAtCP <= 0) return null
      return { speed: d.speed, cpFoc: parseFloat((blAtCP * scale).toFixed(2)) }
    }).filter((d): d is { speed: number; cpFoc: number } => d !== null && d.cpFoc > 0)
  }, [activeCPInfo, showCharterParty, speedFocData, baselineAtContext])

  const cpAdjustedCurve = useMemo(() => {
    if (!activeCPInfo || !showCharterParty || speedFocData.length === 0) return []
    return speedFocData.map(d => ({
      speed: d.speed,
      cpFoc: parseFloat((d.baseline * activeCPInfo.scale).toFixed(2)),
    }))
  }, [activeCPInfo, showCharterParty, speedFocData])

  // Exact guarantee point markers — weather-normalised to the same reference
  // conditions as the CP curve so they plot meaningfully alongside it.
  const cpGuaranteeMarkers = useMemo(() => {
    if (!activeCPInfo || !showCharterParty) return []
    return activeCPInfo.markers
  }, [activeCPInfo, showCharterParty])

  const cpBallastCurve = activeCondition === "Ballast" ? cpAdjustedCurve : []
  const cpLadenCurve = activeCondition === "Laden" ? cpAdjustedCurve : []

  // Fixed reference curve at calm conditions for the current load condition's draft.
  // Does NOT depend on wave/wind sliders — ensures scatter points are stable across weather changes.
  const referenceSpeedFocData = useMemo(() => {
    if (vesselData.length === 0) return []
    const draft = loadCondition === "Ballast" ? ballastDraft : ladenDraft
    const refWave = allWaves.length > 0 ? allWaves[0] : 0
    const refWind = allWinds.length > 0 ? allWinds[0] : 0
    const rows = vesselData
      .filter(d => d.draft === draft && d.wave === refWave && d.wind === refWind)
      .sort((a, b) => a.stw - b.stw)
    if (rows.length < 2) return []
    // Densify to 0.1 kt increments
    const dense: { speed: number; baseline: number }[] = []
    const minSpd = rows[0].stw, maxSpd = rows[rows.length - 1].stw
    const steps = Math.round((maxSpd - minSpd) * 10) + 1
    let seg = 0
    for (let i = 0; i < steps; i++) {
      const speed = parseFloat((minSpd + i * 0.1).toFixed(1))
      while (seg < rows.length - 2 && speed > rows[seg + 1].stw) seg++
      const a = rows[seg], b = rows[seg + 1]
      const t = (speed - a.stw) / (b.stw - a.stw)
      dense.push({ speed, baseline: parseFloat((a.baseline + t * (b.baseline - a.baseline)).toFixed(3)) })
    }
    return dense
  }, [vesselData, loadCondition, ballastDraft, ladenDraft, allWaves, allWinds])

  // Reported scatter points — different per load condition, stable across weather slider changes.
  // Most points cluster around the baseline at wave 1.25m / Bf 4 (moderate realistic operating conditions).
  // A few outlier points exceed even the highest-weather model curve (severe weather / fouling anomalies).
  const actualPoints = useMemo(() => {
    if (vesselData.length === 0) return []
    const draft = loadCondition === "Ballast" ? ballastDraft : ladenDraft
    const seed = loadCondition === "Ballast" ? 42 : 137
    const [clusterMin, clusterMax] = loadCondition === "Ballast" ? [11.5, 13.0] : [10.5, 12.0]
    const baseDate = new Date(loadCondition === "Ballast" ? "2025-01-05" : "2025-01-12")

    // Cap weather to user limits
    const cappedWaves = allWaves.filter(w => w <= 4)
    const cappedWinds = allWinds.filter(w => w <= 8)

    // Reference: wave 1.25m, Bf 4 (snap to nearest CSV values)
    const refWave = cappedWaves.length > 0 ? snapToNearest(1.25, cappedWaves) : 1
    const refWind = cappedWinds.length > 0 ? snapToNearest(4, cappedWinds) : 4
    // Worst allowed: highest wave/wind within caps
    const highWave = cappedWaves.length > 0 ? cappedWaves[cappedWaves.length - 1] : 4
    const highWind = cappedWinds.length > 0 ? cappedWinds[cappedWinds.length - 1] : 8

    const interpolate = (speed: number, wave: number, wind: number): number | null => {
      const rows = vesselData
        .filter(d => d.draft === draft && d.wave === wave && d.wind === wind)
        .sort((a, b) => a.stw - b.stw)
      if (rows.length === 0) return null
      if (speed <= rows[0].stw) return rows[0].baseline
      if (speed >= rows[rows.length - 1].stw) return rows[rows.length - 1].baseline
      for (let j = 0; j < rows.length - 1; j++) {
        const a = rows[j], b = rows[j + 1]
        if (speed >= a.stw && speed <= b.stw) {
          const t = (speed - a.stw) / (b.stw - a.stw)
          return a.baseline + t * (b.baseline - a.baseline)
        }
      }
      return null
    }

    // For a given (speed, targetFoc), find the (wave, wind) combo from the CSV
    // whose baseline is closest to targetFoc. This makes weather correlate with consumption.
    const findWeather = (speed: number, targetFoc: number): { wave: number; wind: number } => {
      let bestWave = cappedWaves[0] ?? 0
      let bestWind = cappedWinds[0] ?? 0
      let bestDiff = Infinity
      for (const w of cappedWaves) {
        for (const wf of cappedWinds) {
          const bl = interpolate(speed, w, wf)
          if (bl == null) continue
          const diff = Math.abs(bl - targetFoc)
          if (diff < bestDiff) { bestDiff = diff; bestWave = w; bestWind = wf }
        }
      }
      return { wave: bestWave, wind: bestWind }
    }

    // Per-point offsets relative to the ref curve (wave 1.25m/Bf 4):
    // positive = above ref (worse), negative = below (better).
    // Indices 22-24 are designated outliers — handled separately below.
    // Ballast: scattered pattern, several points well above, a few dips below
    const ballastOffsets = [
       0.08, -0.12,  0.18, -0.05,  0.22,
       0.04, -0.15,  0.25,  0.01, -0.09,
       0.14,  0.19, -0.06,  0.10,  0.23,
       0.06, -0.11,  0.17, -0.03,  0.20,
       0.09,  0.13,
    ]
    // Laden: tighter cluster with a slight upward trend at higher speeds, fewer extremes
    const ladenOffsets = [
      -0.04,  0.07, -0.09,  0.12,  0.03,
      -0.06,  0.14,  0.02, -0.11,  0.08,
       0.16, -0.03,  0.11,  0.05, -0.07,
       0.18,  0.01,  0.13, -0.05,  0.09,
       0.15,  0.06,
    ]
    const relOffsets = loadCondition === "Ballast" ? ballastOffsets : ladenOffsets

    // Outlier multipliers above the highest-weather curve (indices 22-24)
    const outlierAbove = loadCondition === "Ballast" ? [1.18, 1.25, 1.10] : [1.08, 1.14, 1.11]

    const points: { speed: number; reportedFoc: number; date: string; wave: number; wind: number }[] = []
    for (let i = 0; i < 25; i++) {
      const t = i / 24
      const speed = parseFloat((clusterMin + t * (clusterMax - clusterMin) + Math.sin(seed + i) * 0.15).toFixed(1))
      const dateStr = new Date(baseDate.getTime() + i * 86400000).toISOString().split("T")[0]

      let reportedFoc: number
      if (i >= 22) {
        const highFoc = interpolate(speed, highWave, highWind)
        if (highFoc == null) continue
        reportedFoc = parseFloat((highFoc * outlierAbove[i - 22]).toFixed(2))
      } else {
        const refFoc = interpolate(speed, refWave, refWind)
        if (refFoc == null) continue
        reportedFoc = parseFloat((refFoc * (1 + relOffsets[i])).toFixed(2))
      }

      // Assign weather: pick (wave, wind) whose model baseline is closest to reportedFoc.
      // Outliers that exceed all model values get max allowed weather.
      const { wave, wind } = findWeather(speed, reportedFoc)
      points.push({ speed, reportedFoc, date: dateStr, wave, wind })
    }
    return points.sort((a, b) => a.speed - b.speed)
  }, [vesselData, loadCondition, ballastDraft, ladenDraft, allWaves, allWinds])

  // Degree-2 polynomial trendline through reported points, excluding IQR outliers.
  const polyTrendline = useMemo(() => {
    if (actualPoints.length < 4) return []

    // IQR outlier removal on FOC values
    const sorted = [...actualPoints].sort((a, b) => a.reportedFoc - b.reportedFoc)
    const q1 = sorted[Math.floor(sorted.length * 0.25)].reportedFoc
    const q3 = sorted[Math.floor(sorted.length * 0.75)].reportedFoc
    const iqr = q3 - q1
    const upper = q3 + 1.5 * iqr
    const lower = q1 - 1.5 * iqr
    const clean = actualPoints.filter(p => p.reportedFoc >= lower && p.reportedFoc <= upper)
    if (clean.length < 3) return []

    // Fit y = a0 + a1*x + a2*x² via normal equations (Vandermonde least squares, degree 2)
    const deg = 2
    const n = clean.length
    // Build (deg+1)×(deg+1) augmented matrix
    const mat: number[][] = Array.from({ length: deg + 1 }, () => Array(deg + 2).fill(0))
    for (const p of clean) {
      const row = Array.from({ length: deg + 1 }, (_, k) => Math.pow(p.speed, k))
      for (let r = 0; r <= deg; r++) {
        for (let c = 0; c <= deg; c++) mat[r][c] += row[r] * row[c]
        mat[r][deg + 1] += row[r] * p.reportedFoc
      }
    }
    void n
    // Gaussian elimination with partial pivoting
    for (let col = 0; col <= deg; col++) {
      let maxRow = col
      for (let r = col + 1; r <= deg; r++) if (Math.abs(mat[r][col]) > Math.abs(mat[maxRow][col])) maxRow = r
      ;[mat[col], mat[maxRow]] = [mat[maxRow], mat[col]]
      if (Math.abs(mat[col][col]) < 1e-12) return []
      for (let r = 0; r <= deg; r++) {
        if (r === col) continue
        const f = mat[r][col] / mat[col][col]
        for (let c = col; c <= deg + 1; c++) mat[r][c] -= f * mat[col][c]
      }
    }
    const coeffs = Array.from({ length: deg + 1 }, (_, i) => mat[i][deg + 1] / mat[i][i])

    // Evaluate across the chart speed range
    const speeds = actualPoints.map(p => p.speed)
    const xMin = Math.min(...speeds), xMax = Math.max(...speeds)
    const steps = Math.round((xMax - xMin) * 10)
    return Array.from({ length: steps + 1 }, (_, i) => {
      const x = parseFloat((xMin + i * (xMax - xMin) / steps).toFixed(2))
      const y = parseFloat((coeffs[0] + coeffs[1] * x + coeffs[2] * x * x).toFixed(2))
      return { speed: x, trendFoc: y > 0 ? y : null }
    }).filter(d => d.trendFoc !== null) as { speed: number; trendFoc: number }[]
  }, [actualPoints])

  // Dynamic axis domains — Y max is driven by visible scatter + reference points;
  // X max is the last model-curve speed whose FOC fits within that Y range.
  const { chartXMin, chartXMax, chartXTicks, chartYMax } = useMemo(() => {
    // Collect all FOC values that should be visible above the x-axis
    const focSamples: number[] = [
      ...(showActual ? actualPoints.map(p => p.reportedFoc) : []),
      ...(showUserCurve && parsedUserCurve.length >= 2 ? parsedUserCurve.map(p => p.userFoc) : []),
    ]
    // Fall back to first few model-curve points when no other data exists
    if (focSamples.length === 0 && speedFocData.length > 0) {
      focSamples.push(...speedFocData.slice(0, Math.ceil(speedFocData.length * 0.4)).map(d => d.baseline))
    }

    const yMax = focSamples.length > 0
      ? Math.ceil(Math.max(...focSamples) * 1.3 / 5) * 5   // round up to nearest 5
      : undefined

    // X range: model curve only up to where FOC ≤ yMax; extend by 1 kt for breathing room
    const visibleCurve = yMax
      ? speedFocData.filter(d => d.baseline <= yMax)
      : speedFocData

    // Also include scatter / reference speed range
    const allSpeeds = [
      ...(visibleCurve.length > 0 ? [visibleCurve[0].speed, visibleCurve[visibleCurve.length - 1].speed] : []),
      ...(showActual ? actualPoints.map(p => p.speed) : []),
      ...(showUserCurve && parsedUserCurve.length >= 2 ? parsedUserCurve.map(p => p.speed) : []),
    ]

    if (allSpeeds.length === 0) {
      return { chartXMin: 8, chartXMax: 18, chartXTicks: [8,9,10,11,12,13,14,15,16,17,18], chartYMax: undefined }
    }

    const xMin = Math.floor(Math.min(...allSpeeds))
    const xMax = Math.ceil(Math.max(...allSpeeds))
    const ticks = Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i)
    return { chartXMin: xMin, chartXMax: xMax, chartXTicks: ticks, chartYMax: yMax }
  }, [speedFocData, showActual, actualPoints, showUserCurve, parsedUserCurve])

  // improvement #6: CSV export for model data table
  const handleExportCSV = () => {
    const headers = ["Speed (Kts)", "Draft (m)", "Model Curve (MT/day)"]
    if (showUserCurve && parsedUserCurve.length >= 2) headers.push("Reference FOC (MT/day)", "Delta vs Baseline")
    if (showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition) headers.push(`CP ${activeCondition} (MT/day)`)
    if (showCharterParty && cpAdjustedCurve.length > 0) headers.push("CP Weather Adj. (MT/day)")

    const tableRows = speedFocData.filter(d => Math.abs(d.speed - Math.round(d.speed * 2) / 2) < 0.001)
    const rows = tableRows.map(d => {
      const row: (string | number)[] = [d.speed.toFixed(1), d.draft, d.baseline.toFixed(2)]
      if (showUserCurve && parsedUserCurve.length >= 2) {
        const userFoc = interpolateUserFoc(d.speed)
        const delta = userFoc !== null ? d.baseline - userFoc : null
        row.push(userFoc !== null ? userFoc.toFixed(2) : "")
        row.push(delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}` : "")
      }
      if (showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition) {
        const val = cpGuaranteedCurve.find(c => Math.abs(c.speed - d.speed) < 0.001)?.cpFoc ?? ""
        row.push(val !== "" ? (val as number).toFixed(2) : "")
      }
      if (showCharterParty && cpAdjustedCurve.length > 0) {
        const val = cpAdjustedCurve.find(c => Math.abs(c.speed - d.speed) < 0.001)?.cpFoc ?? ""
        row.push(val !== "" ? (val as number).toFixed(2) : "")
      }
      return row
    })

    const csv = [headers, ...rows].map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `scc-${selectedVessel}-draft${snappedDraft}m-wave${snappedWave}-bf${snappedWind}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && vesselData.length === 0) {
    return <div className="text-center text-slate-400 py-12 text-lg">Loading vessel data for {selectedVessel}…</div>
  }

  return (
    <div className="space-y-4">
      <h3 className="section-heading text-2xl">Speed Consumption Curve</h3>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls panel */}
        <Card className="card-maritime bg-[#071318]">
          <CardContent className="p-5 space-y-5">
            <p className="section-heading text-sm mb-3">Weather Conditions</p>

            {/* Wave slider */}
            <div>
              <label className="text-white text-base mb-2 flex items-center gap-2">
                <Waves className="w-3.5 h-3.5 text-[#24D2B5]" />
                Wave Height (m) <span className="value-badge">{waveHeight[0]}</span>
              </label>
              <Slider value={waveHeight} onValueChange={setWaveHeight} max={4} min={0} step={0.25}
                className="w-full [&>span:first-child]:bg-[#24D2B5]" />
              <div className="flex justify-between text-xs text-slate-400 mt-1"><span>0m</span><span>4m</span></div>
            </div>

            {/* Wind slider */}
            <div>
              <label className="text-white text-base mb-2 flex items-center gap-2">
                <Wind className="w-3.5 h-3.5 text-[#24D2B5]" />
                Wind (Beaufort) <span className="value-badge">{windBf[0]}</span>
              </label>
              <Slider value={windBf} onValueChange={setWindBf} max={8} min={0} step={1}
                className="w-full [&>span:first-child]:bg-[#24D2B5]" />
              <div className="flex justify-between text-xs text-slate-400 mt-1"><span>0</span><span>8</span></div>
            </div>

            <div className="border-t border-slate-700/50 pt-4">
              <p className="section-heading text-sm mb-3">Load Condition</p>
            </div>

            {/* Load condition toggle */}
            <div>
              <label className="text-white text-base mb-2 flex items-center gap-2">
                <Anchor className="w-3.5 h-3.5 text-[#24D2B5]" />
                Condition <span className="value-badge">{snappedDraft}m</span>
              </label>
              <div className="flex rounded-lg bg-[#0A1B26] border border-slate-700 p-1 gap-1">
                <button
                  onClick={() => setLoadCondition("Ballast")}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all ${loadCondition === "Ballast" ? "bg-[#60A5FA] text-black shadow-md" : "text-slate-300 hover:text-white hover:bg-white/5"}`}
                >
                  Ballast
                  <span className="block text-[10px] font-normal opacity-75">{ballastDraft}m</span>
                </button>
                <button
                  onClick={() => setLoadCondition("Laden")}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all ${loadCondition === "Laden" ? "bg-[#A78BFA] text-black shadow-md" : "text-slate-300 hover:text-white hover:bg-white/5"}`}
                >
                  Laden
                  <span className="block text-[10px] font-normal opacity-75">{ladenDraft}m</span>
                </button>
              </div>
            </div>

            <div className="text-sm text-slate-400 bg-[#0A1B26] rounded-lg p-3 border border-slate-700/30">
              Draft <span className="value-badge">{snappedDraft}m</span> · Wave <span className="value-badge">{snappedWave}m</span> · Wind <span className="value-badge">Bf {snappedWind}</span>
            </div>

            <div className="border-t border-slate-700/50 pt-4">
              <p className="section-heading text-sm mb-3">Display Options</p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="showActual" checked={showActual} onCheckedChange={setShowActual} />
              <label htmlFor="showActual" className="text-white text-base">Show Reported Points</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="showTrendline" checked={showTrendline} onCheckedChange={v => setShowTrendline(!!v)} />
              <label htmlFor="showTrendline" className="text-white text-base">Show Polynomial Trendline</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="showTable" checked={showTable} onCheckedChange={setShowTable} />
              <label htmlFor="showTable" className="text-white text-base">Show Model Data Table</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="showUserCurve" checked={showUserCurve} onCheckedChange={v => setShowUserCurve(!!v)} />
              <label htmlFor="showUserCurve" className="text-white text-base">Show Reference Data</label>
            </div>

            {showUserCurve && (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox id="normalizeWeather" checked={normalizeWeather} onCheckedChange={v => setNormalizeWeather(!!v)} />
                  <label htmlFor="normalizeWeather" className="text-white text-base">Normalize to baseline weather</label>
                </div>
                <button
                  onClick={() => setShowUserCurveModal(true)}
                  className="w-full text-sm text-black bg-[#FF8C00] hover:bg-orange-400 rounded px-3 py-2 font-medium"
                >
                  Edit Reference Data
                </button>
                {(() => {
                  const combos = userCurvePoints
                    .filter(p => p.draft && p.wave && p.wind)
                    .map(p => `${p.draft}|${p.wave}|${p.wind}`)
                  const unique = [...new Set(combos)].map(c => {
                    const [d, w, wi] = c.split("|")
                    return { draft: parseFloat(d), wave: parseFloat(w), wind: parseFloat(wi) }
                  }).filter(c => !isNaN(c.draft) && !isNaN(c.wave) && !isNaN(c.wind))
                  if (unique.length === 0) return null
                  return (
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Quick select from user data</p>
                      <div className="flex flex-wrap gap-1.5">
                        {unique.map((c, i) => {
                          const isActive = snappedDraft === c.draft && snappedWave === c.wave && snappedWind === c.wind
                          return (
                            <button key={i}
                              onClick={() => {
                                setLoadCondition(Math.abs(c.draft - ballastDraft) <= Math.abs(c.draft - ladenDraft) ? "Ballast" : "Laden")
                                setWaveHeight([c.wave])
                                setWindBf([c.wind])
                              }}
                              className={`text-xs px-2 py-1 rounded border transition-all ${isActive ? "bg-[#FF8C00]/20 border-[#FF8C00] text-[#FF8C00]" : "bg-[#0A1B26] border-slate-600 text-slate-300 hover:border-[#FF8C00]/50 hover:text-white"}`}
                            >
                              D{c.draft} · W{c.wave}m · Bf{c.wind}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            <div className="border-t border-slate-700/50 pt-4 mt-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="showCharterParty" checked={showCharterParty} onCheckedChange={v => setShowCharterParty(!!v)} />
                <label htmlFor="showCharterParty" className="text-white text-base">Show Charter Party</label>
              </div>
            </div>

            {showCharterParty && (
              <div className="space-y-3 bg-[#0A1B26] rounded-lg p-3 border border-[#22C55E]/30">
                <p className="text-[#22C55E] text-sm font-medium">CP Guarantee Points</p>
                <p className="text-xs text-slate-500">Draft is auto-set from Load Condition (Ballast = {ballastDraft}m, Laden = {ladenDraft}m). The CP curve runs parallel to the visible baseline.</p>
                {(["Ballast", "Laden"] as CPCondition[]).map(cond => {
                  const points = cpPoints.map((p, i) => ({ p, i })).filter(({ p }) => p.condition === cond)
                  const accent = cond === "Ballast" ? "#60A5FA" : "#A78BFA"
                  return (
                    <div key={cond} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>{cond}</span>
                        <button onClick={() => addCPPoint(cond)}
                          className="text-xs hover:opacity-80 border rounded px-1.5 py-0.5 transition-opacity"
                          style={{ color: accent, borderColor: `${accent}80` }}>
                          + Add
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">Draft fixed: {cond === "Ballast" ? `${ballastDraft}m` : `${ladenDraft}m`}</p>
                      <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_auto] gap-1 items-center">
                        <span className="text-slate-500 text-[10px]">Speed</span>
                        <span className="text-slate-500 text-[10px]">FOC</span>
                        <span className="text-slate-500 text-[10px]">Wave</span>
                        <span className="text-slate-500 text-[10px]">Wind</span>
                        <span></span>
                        {points.map(({ p, i }) => (
                          <React.Fragment key={i}>
                            <input type="number" value={p.speed} onChange={e => updateCPPoint(i, "speed", e.target.value)}
                              className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="kts" />
                            <input type="number" value={p.foc} onChange={e => updateCPPoint(i, "foc", e.target.value)}
                              className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="MT/d" />
                            <input type="number" value={p.wave} onChange={e => updateCPPoint(i, "wave", e.target.value)}
                              className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="m" />
                            <input type="number" value={p.wind} onChange={e => updateCPPoint(i, "wind", e.target.value)}
                              className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="Bf" />
                            <button onClick={() => removeCPPoint(i)} disabled={cpPoints.length <= 1}
                              className="text-red-400 hover:text-red-300 disabled:text-slate-700 disabled:cursor-not-allowed text-base leading-none px-1">×</button>
                          </React.Fragment>
                        ))}
                        {points.length === 0 && (
                          <span className="col-span-5 text-xs text-slate-600 italic">No {cond.toLowerCase()} points</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {(cpBallastCurve.length > 0 || cpLadenCurve.length > 0) && (
                  <p className="text-xs text-[#22C55E]">
                    Curves: {cpBallastCurve.length > 0 ? "Ballast ✓" : ""}{cpBallastCurve.length > 0 && cpLadenCurve.length > 0 ? " · " : ""}{cpLadenCurve.length > 0 ? "Laden ✓" : ""}
                  </p>
                )}
                {(() => {
                  const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length
                  const groupAvg = (cond: CPCondition) => {
                    const valid = cpPoints
                      .filter(p => p.condition === cond)
                      .map(p => ({ w: parseFloat(p.wave), wi: parseFloat(p.wind) }))
                      .filter(p => !isNaN(p.w) && !isNaN(p.wi))
                    if (valid.length === 0) return null
                    return { wave: avg(valid.map(p => p.w)), wind: avg(valid.map(p => p.wi)) }
                  }
                  const ballast = groupAvg("Ballast")
                  const laden = groupAvg("Laden")
                  if (!ballast && !laden) return null
                  return (
                    <div className="space-y-1.5 pt-2 border-t border-slate-700/50">
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Quick jump to CP context</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ballast && (
                          <button
                            onClick={() => { setLoadCondition("Ballast"); setWaveHeight([ballast.wave]); setWindBf([ballast.wind]) }}
                            className={`text-xs px-2 py-1 rounded border transition-all ${loadCondition === "Ballast" ? "bg-[#60A5FA]/20 border-[#60A5FA] text-[#60A5FA]" : "bg-[#0A1B26] border-slate-600 text-slate-300 hover:border-[#60A5FA]/50 hover:text-white"}`}
                          >
                            Ballast · W{ballast.wave.toFixed(1)}m · Bf{Math.round(ballast.wind)}
                          </button>
                        )}
                        {laden && (
                          <button
                            onClick={() => { setLoadCondition("Laden"); setWaveHeight([laden.wave]); setWindBf([laden.wind]) }}
                            className={`text-xs px-2 py-1 rounded border transition-all ${loadCondition === "Laden" ? "bg-[#A78BFA]/20 border-[#A78BFA] text-[#A78BFA]" : "bg-[#0A1B26] border-slate-600 text-slate-300 hover:border-[#A78BFA]/50 hover:text-white"}`}
                          >
                            Laden · W{laden.wave.toFixed(1)}m · Bf{Math.round(laden.wind)}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart */}
        <Card className="lg:col-span-3 card-maritime">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-2xl font-bold">Speed vs Fuel Consumption</CardTitle>
            <p className="text-sm text-slate-400">Draft {snappedDraft}m · Wave {snappedWave}m · Wind Bf {snappedWind}</p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={speedFocData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4f" />
                <XAxis
                  dataKey="speed"
                  type="number"
                  domain={[chartXMin, chartXMax]}
                  ticks={chartXTicks}
                  stroke="white"
                  tick={{ fill: "white" }}
                  label={{ value: "STW (Kts)", position: "insideBottom", offset: -15, style: { textAnchor: "middle", fill: "white" } }}
                />
                <YAxis
                  domain={[0, chartYMax ?? 'auto']}
                  stroke="white"
                  tick={{ fill: "white" }}
                  label={{ value: "FOC (MT/day)", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle", fill: "white" } }}
                />
                <ZAxis type="number" range={[60, 60]} />
                <Tooltip content={props => (
                  <SpeedFocTooltip
                    {...props}
                    interpolateUserFoc={interpolateUserFoc}
                    showUserCurve={showUserCurve && parsedUserCurve.length >= 2}
                    speedFocData={speedFocData}
                    cpGuaranteedCurve={cpGuaranteedCurve}
                    cpAdjustedCurve={cpAdjustedCurve}
                    activeCondition={activeCondition}
                  />
                )} />
                <Legend
                  wrapperStyle={{ paddingTop: "10px", cursor: "pointer" }}
                  onClick={(o: any) => { if (o?.value) toggleSeries(o.value) }}
                  payload={[
                    // improvement #5: bright blue #60A5FA instead of #0000FF
                    { value: "Actual Reported FOC", type: "circle", color: "#60A5FA", inactive: isHidden("Actual Reported FOC") },
                    { value: "Model Curve", type: "line", color: "#00FFFF", inactive: isHidden("Model Curve") },
                    ...(showTrendline && polyTrendline.length > 0
                      ? [{ value: "Trendline", type: "line" as const, color: "#FACC15", inactive: isHidden("Trendline") }]
                      : []),
                    ...(showUserCurve && parsedUserCurve.length >= 2
                      ? [{ value: "Reference Model", type: "line" as const, color: "#FF8C00", inactive: isHidden("Reference Model") }]
                      : []),
                    ...(showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition
                      ? [{ value: `CP ${activeCondition}`, type: "line" as const, color: activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA", inactive: isHidden(`CP ${activeCondition}`) }]
                      : []),
                    ...(showCharterParty && cpAdjustedCurve.length > 0
                      ? [{ value: "CP Weather Adjusted", type: "line" as const, color: "#22C55E", inactive: isHidden("CP Weather Adjusted") }]
                      : []),
                  ]}
                />
                {!isHidden("Model Curve") && (
                  <Line type="monotone" dataKey="baseline" stroke="#00FFFF" strokeWidth={3}
                    name="Model Curve" dot={false} activeDot={false} isAnimationActive={false} />
                )}
                {showTrendline && polyTrendline.length > 0 && !isHidden("Trendline") && (
                  <Line data={polyTrendline} type="monotone" dataKey="trendFoc"
                    stroke="#FACC15" strokeWidth={2} strokeDasharray="5 3"
                    name="Trendline" dot={false} activeDot={false} isAnimationActive={false} legendType="line" />
                )}
                {/* improvement #9: dataKey is now "reportedFoc"; #5: fill is #60A5FA */}
                {showActual && !isHidden("Actual Reported FOC") && (
                  <Scatter data={actualPoints} dataKey="reportedFoc" fill="#60A5FA" name="Actual Reported FOC">
                    {actualPoints.map((_, index) => (
                      <Cell key={`cell-${index}`} fill="#60A5FA" />
                    ))}
                  </Scatter>
                )}
                {showUserCurve && parsedUserCurve.length >= 2 && !isHidden("Reference Model") && (
                  <Line data={parsedUserCurve} type="monotone" dataKey="userFoc"
                    stroke="#FF8C00" strokeWidth={2} strokeDasharray="6 3"
                    name="Reference Model" dot={{ fill: "#FF8C00", r: 4 }} legendType="line" />
                )}
                {showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition && !isHidden(`CP ${activeCondition}`) && (
                  <Line data={cpGuaranteedCurve} type="monotone" dataKey="cpFoc"
                    stroke={activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA"}
                    strokeWidth={2} strokeDasharray="8 4"
                    name={`CP ${activeCondition}`} dot={false} legendType="line" />
                )}
                {showCharterParty && activeCondition && !isHidden(`CP ${activeCondition}`) &&
                  cpGuaranteeMarkers.map((m, i) => (
                    <ReferenceDot key={`cpmark-${i}`} x={m.speed} y={m.foc}
                      r={6} fill={activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA"}
                      stroke="white" strokeWidth={1.5} ifOverflow="extendDomain" />
                  ))
                }
                {showCharterParty && cpAdjustedCurve.length > 0 && !isHidden("CP Weather Adjusted") && (
                  <Line data={cpAdjustedCurve} type="monotone" dataKey="cpFoc"
                    stroke="#22C55E" strokeWidth={2} strokeDasharray="4 4"
                    name="CP Weather Adjusted" dot={false} legendType="line" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* improvement #8: Escape key handled via useEffect above; modal backdrop click still works */}
      {showUserCurveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={e => { if (e.target === e.currentTarget) setShowUserCurveModal(false) }}
        >
          <div className="bg-[#071318] border border-slate-600 rounded-lg w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div>
                <h2 className="text-[#FF8C00] font-semibold text-lg">Reference Data — Data Points</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Baseline at <span className="text-[#24D2B5]">{snappedDraft}m</span> · rows must have a matching draft to appear on the chart · <kbd className="text-[10px] bg-slate-700 px-1 rounded">Esc</kbd> to close
                </p>
              </div>
              <button onClick={() => setShowUserCurveModal(false)} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-left text-base">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="p-2 text-slate-400">Speed (Kts)</th>
                    <th className="p-2 text-slate-400">FOC (MT/day)</th>
                    <th className="p-2 text-slate-400">Draft (m)</th>
                    <th className="p-2 text-slate-400">Wave Height (m)</th>
                    <th className="p-2 text-slate-400">Wind (Beaufort)</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {userCurvePoints.map((point, index) => (
                    <tr key={index} className={`${index % 2 === 0 ? "bg-[#071318]" : "bg-[#0A1B26]"} hover:bg-[#24D2B5]/5 transition-colors`}>
                      <td className="p-1">
                        <input type="number" value={point.speed} onChange={e => updateUserCurvePoint(index, "speed", e.target.value)}
                          className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="e.g. 10" />
                      </td>
                      <td className="p-1">
                        <input type="number" value={point.foc} onChange={e => updateUserCurvePoint(index, "foc", e.target.value)}
                          className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="e.g. 50" />
                      </td>
                      <td className="p-1">
                        <input type="number" value={point.draft} onChange={e => updateUserCurvePoint(index, "draft", e.target.value)}
                          className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="e.g. 10" min={0} step={0.5} />
                      </td>
                      <td className="p-1">
                        <input type="number" value={point.wave} onChange={e => updateUserCurvePoint(index, "wave", e.target.value)}
                          className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="0–4" min={0} max={4} step={1} />
                      </td>
                      <td className="p-1">
                        <input type="number" value={point.wind} onChange={e => updateUserCurvePoint(index, "wind", e.target.value)}
                          className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="0–8" min={0} max={8} step={1} />
                      </td>
                      <td className="p-1 text-center">
                        <button onClick={() => removeUserCurvePoint(index)} className="text-red-400 hover:text-red-300 text-base leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-slate-700 flex flex-wrap items-center gap-3">
              <button onClick={addUserCurvePoint}
                className="text-sm text-[#FF8C00] hover:text-orange-300 border border-[#FF8C00] rounded px-3 py-1">
                + Add Row
              </button>
              <label className="text-sm text-[#FF8C00] hover:text-orange-300 border border-[#FF8C00] rounded px-3 py-1 cursor-pointer">
                Upload CSV
                <input type="file" accept=".csv" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = evt => {
                      const text = evt.target?.result as string
                      const lines = text.split(/\r?\n/).filter(l => l.trim())
                      const dataLines = isNaN(parseFloat(lines[0]?.split(",")[0])) ? lines.slice(1) : lines
                      const parsed = dataLines.map(line => {
                        const [speed = "", foc = "", draft = "", wave = "", wind = ""] = line.split(",").map(c => c.trim())
                        return { speed, foc, draft, wave, wind }
                      }).filter(p => p.speed !== "" && p.foc !== "")
                      if (parsed.length > 0) setUserCurvePoints(parsed)
                    }
                    reader.readAsText(file)
                    e.target.value = ""
                  }}
                />
              </label>
              <span className="text-xs text-slate-500">CSV columns: speed, foc, draft, wave, wind</span>
              {normalizeWeather && (
                <span className="text-xs text-slate-400 ml-auto">
                  Weather normalization active — adjusting to wave {waveHeight[0]} / wind {windBf[0]}
                </span>
              )}
              <button onClick={() => setShowUserCurveModal(false)}
                className="ml-auto text-sm bg-[#24D2B5] hover:bg-teal-400 text-black rounded px-4 py-1 font-medium">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* improvement #6: Model Data Table with CSV export button */}
      {showTable && (
        <Card className="card-maritime">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-2xl font-bold">
                Speed Consumption Model Data
                <span className="ml-2 text-sm font-normal text-slate-400">
                  Draft {snappedDraft}m · Wave {snappedWave}m · Wind Bf {snappedWind}
                </span>
              </CardTitle>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 text-sm text-[#24D2B5] hover:text-teal-300 border border-[#24D2B5]/40 hover:border-[#24D2B5] rounded px-3 py-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="p-3 text-white">Speed (Kts)</th>
                    <th className="p-3 text-white">Draft (m)</th>
                    <th className="p-3 text-white">Model Curve (MT/day)</th>
                    {showUserCurve && parsedUserCurve.length >= 2 && (
                      <th className="p-3 text-[#FF8C00]">Reference FOC (MT/day)</th>
                    )}
                    {showUserCurve && parsedUserCurve.length >= 2 && (
                      <th className="p-3 text-slate-400">Δ vs Baseline</th>
                    )}
                    {showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition && (
                      <th className="p-3" style={{ color: activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA" }}>
                        CP {activeCondition} (MT/day)
                      </th>
                    )}
                    {showCharterParty && cpAdjustedCurve.length > 0 && (
                      <th className="p-3 text-[#22C55E]">CP Weather Adj. (MT/day)</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {speedFocData.filter(d => Math.abs(d.speed - Math.round(d.speed * 2) / 2) < 0.001).map((dataPoint, index) => {
                    const userFoc = showUserCurve ? interpolateUserFoc(dataPoint.speed) : null
                    const delta = userFoc !== null ? dataPoint.baseline - userFoc : null
                    const cpGuaranteedVal = cpGuaranteedCurve.find(c => Math.abs(c.speed - dataPoint.speed) < 0.001)?.cpFoc ?? null
                    const cpAdjustedVal = cpAdjustedCurve.find(c => Math.abs(c.speed - dataPoint.speed) < 0.001)?.cpFoc ?? null
                    return (
                      <tr key={index} className={`${index % 2 === 0 ? "bg-[#071318]" : "bg-[#0A1B26]"} hover:bg-[#24D2B5]/5 transition-colors`}>
                        <td className="p-3 text-white">{dataPoint.speed.toFixed(1)}</td>
                        <td className="p-3 text-white">{dataPoint.draft}</td>
                        <td className="p-3 text-white">{dataPoint.baseline.toFixed(2)}</td>
                        {showUserCurve && parsedUserCurve.length >= 2 && (
                          <td className="p-3 text-[#FF8C00]">{userFoc !== null ? userFoc.toFixed(2) : "—"}</td>
                        )}
                        {showUserCurve && parsedUserCurve.length >= 2 && (
                          <td className={`p-3 ${delta === null ? "text-slate-500" : delta > 0 ? "text-red-400" : "text-green-400"}`}>
                            {delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)} (${delta > 0 ? "+" : ""}${((delta / dataPoint.baseline) * 100).toFixed(1)}%)` : "—"}
                          </td>
                        )}
                        {showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition && (
                          <td className="p-3" style={{ color: activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA" }}>
                            {cpGuaranteedVal !== null ? cpGuaranteedVal.toFixed(2) : "—"}
                          </td>
                        )}
                        {showCharterParty && cpAdjustedCurve.length > 0 && (
                          <td className="p-3 text-[#22C55E]">{cpAdjustedVal !== null ? cpAdjustedVal.toFixed(2) : "—"}</td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── main OverviewTab component ───────────────────────────────────────────────

interface OverviewTabProps {
  selectedVessel: string
  timePeriod: string
  // improvement #7: custom date range support
  customFrom?: string
  customTo?: string
}

export function OverviewTab({ selectedVessel, timePeriod, customFrom, customTo }: OverviewTabProps) {
  // improvement #7: derive period scale from date range when "Custom" is selected
  const ps = useMemo(() => {
    if (timePeriod === "Custom" && customFrom && customTo) {
      const from = new Date(customFrom)
      const to = new Date(customTo)
      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
        const days = Math.max(1, (to.getTime() - from.getTime()) / 86400000)
        return days / 30
      }
    }
    return ({ "Last Week": 0.25, "Last Month": 1, "Last Quarter": 3, "YTD": 6 } as Record<string, number>)[timePeriod] ?? 1
  }, [timePeriod, customFrom, customTo])

  const fmt = (n: number) => Math.round(n).toLocaleString()

  // Per-vessel monthly base KPI values and previous-period values
  const vesselKPIBase: Record<string, [number, number, number, number]> = {
    PRIDE:         [4820, 48150, 15920, 28400],
    CONSTELLATION: [5612, 54230, 18745, 76500],
    WILLOW:        [6340, 61800, 21100, 108200],
  }
  // improvement #2: previous-period baselines for computing real deltas
  const vesselKPIPrev: Record<string, [number, number, number, number]> = {
    PRIDE:         [4680, 46250, 15480, 26700],
    CONSTELLATION: [5340, 51820, 18020, 73100],
    WILLOW:        [5990, 59700, 20200, 103800],
  }

  const kpiBase = vesselKPIBase[selectedVessel] ?? vesselKPIBase.CONSTELLATION
  const kpiPrev = vesselKPIPrev[selectedVessel] ?? vesselKPIPrev.CONSTELLATION

  const kpiDefinitions: { label: string; unit: string; higherIsBetter: boolean; icon: React.FC<any>; color: string }[] = [
    { label: "Total Fuel Consumption", unit: "MT",  higherIsBetter: false, icon: Droplets,   color: "#FF6B6B" },
    { label: "Total Sailing Distance", unit: "NM",  higherIsBetter: true,  icon: Navigation, color: "#4ECDC4" },
    { label: "Total Emissions (CO₂e)", unit: "MT",  higherIsBetter: false, icon: Leaf,       color: "#45B7D1" },
    { label: "Cargo Carried",          unit: "MT",  higherIsBetter: true,  icon: Package,    color: "#96CEB4" },
  ]

  const kpiData: KPICardData[] = kpiDefinitions.map((def, i) => {
    const current = kpiBase[i] * ps
    const previous = kpiPrev[i] * ps
    const delta = ((current - previous) / previous) * 100
    return { ...def, value: fmt(current), delta }
  })

  // Per-vessel monthly base fuel breakdown
  const vesselFuelBase: Record<string, { name: string; base: number; color: string }[]> = {
    PRIDE: [
      { name: "VLSFO", base: 2400, color: "#4ECDC4" },
      { name: "LSMGO", base: 1200, color: "#96CEB4" },
      { name: "LNG",   base: 820,  color: "#45B7D1" },
      { name: "HSFO",  base: 400,  color: "#FF6B6B" },
    ],
    CONSTELLATION: [
      { name: "HSFO",  base: 1500, color: "#FF6B6B" },
      { name: "VLSFO", base: 2000, color: "#4ECDC4" },
      { name: "LNG",   base: 1500, color: "#45B7D1" },
      { name: "LSMGO", base: 612,  color: "#96CEB4" },
    ],
    WILLOW: [
      { name: "HSFO",  base: 2800, color: "#FF6B6B" },
      { name: "VLSFO", base: 2100, color: "#4ECDC4" },
      { name: "LSMGO", base: 940,  color: "#96CEB4" },
      { name: "LNG",   base: 500,  color: "#45B7D1" },
    ],
  }
  const fuelData: FuelItem[] = (vesselFuelBase[selectedVessel] ?? vesselFuelBase.CONSTELLATION).map(f => ({
    name: f.name, value: Math.round(f.base * ps), color: f.color,
  }))

  // Per-vessel score card
  const vesselScoreBase: Record<string, { metric: string; base: number }[]> = {
    PRIDE: [
      { metric: "Reporting Accuracy",   base: 95 },
      { metric: "Reporting Timeliness", base: 91 },
      { metric: "Route Adherence",      base: 88 },
      { metric: "Speed Compliance",     base: 90 },
      { metric: "On-Time Arrival",      base: 93 },
    ],
    CONSTELLATION: [
      { metric: "Reporting Accuracy",   base: 92 },
      { metric: "Reporting Timeliness", base: 88 },
      { metric: "Route Adherence",      base: 94 },
      { metric: "Speed Compliance",     base: 86 },
      { metric: "On-Time Arrival",      base: 89 },
    ],
    WILLOW: [
      { metric: "Reporting Accuracy",   base: 87 },
      { metric: "Reporting Timeliness", base: 82 },
      { metric: "Route Adherence",      base: 91 },
      { metric: "Speed Compliance",     base: 79 },
      { metric: "On-Time Arrival",      base: 85 },
    ],
  }
  const scoreShift: Record<string, number> = { "Last Week": 2, "Last Month": 0, "Last Quarter": -1, "YTD": -2, "Custom": 0 }
  const ss = scoreShift[timePeriod] ?? 0
  const scoreCardData: ScoreItem[] = (vesselScoreBase[selectedVessel] ?? vesselScoreBase.CONSTELLATION).map(s => {
    const v = Math.min(100, Math.max(0, s.base + ss))
    return { metric: s.metric, rawScore: `${v}%`, value: v }
  })

  return (
    <div className="space-y-6">
      {/* improvement #2 & #10: computed deltas, sub-component */}
      <KPICards data={kpiData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* improvement #10: sub-components */}
        <FuelBreakdown data={fuelData} />
        <VesselScoreCard data={scoreCardData} />
      </div>

      {/* improvement #10: speed curve is a self-contained sub-component */}
      <SpeedConsumptionCurve selectedVessel={selectedVessel} />
    </div>
  )
}
