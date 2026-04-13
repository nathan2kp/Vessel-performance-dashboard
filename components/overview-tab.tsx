"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Scatter,
  ComposedChart,
  ZAxis,
} from "recharts"
import React, { useState, useEffect, useCallback } from "react"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { ScoreIndicator } from "./score-indicator"
import { Droplets, Navigation, Leaf, Package, Waves, Wind, Anchor, Settings2, Upload, Plus, X } from "lucide-react"

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

  // Find the reported scatter point if one exists in payload (prioritize it)
  const reportedEntry = payload.find(e => e?.payload?.date)
  // Find baseline line entry
  const baselineEntry = payload.find(e => e?.payload && !e.payload.date && typeof e.payload.baseline === "number")
  // Find reference model entry
  const refEntry = payload.find(e => e?.payload && typeof e.payload.userFoc === "number")

  // Use the most specific data source for speed
  const primaryData = reportedEntry?.payload ?? baselineEntry?.payload ?? refEntry?.payload ?? payload[0]?.payload
  if (!primaryData) return null
  const speed = typeof primaryData.speed === "number" ? primaryData.speed : null
  if (speed == null) return null

  // ALWAYS look up baseline from speedFocData at the hovered speed (most accurate).
  // Don't rely on baselineEntry.payload.baseline because Recharts may pair scatter hovers
  // with arbitrary line data points, causing speed/baseline mismatch.
  let baseline: number | null = null
  if (speedFocData && speedFocData.length > 0) {
    if (speed <= speedFocData[0].speed) baseline = speedFocData[0].baseline
    else if (speed >= speedFocData[speedFocData.length - 1].speed) baseline = speedFocData[speedFocData.length - 1].baseline
    else {
      // Linear interpolation between dense speed points
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
  // Mark baselineEntry as referenced so TS doesn't complain (kept for context detection)
  void baselineEntry

  // Get reference FOC from payload or interpolate
  let refFoc: number | null = refEntry?.payload?.userFoc ?? null
  if (refFoc == null && showUserCurve && interpolateUserFoc) {
    refFoc = interpolateUserFoc(speed)
  }

  // Charter Party FOC lookups
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

  // Reported point tooltip
  if (reportedEntry) {
    const reportedFoc = reportedEntry.payload.baseline
    return (
      <div className="bg-[#102338] border border-slate-600 rounded-lg p-3 text-sm space-y-1 shadow-lg">
        <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Reported Noon Data</p>
        <p className="text-white font-medium">Date: {reportedEntry.payload.date}</p>
        <p className="text-white">Speed: {speed.toFixed(2)} kts</p>
        {reportedFoc != null && <p className="text-[#0088FF]">Reported FOC: {reportedFoc.toFixed(2)} MT/day</p>}
        {baseline != null && <p className="text-[#00FFFF]">Baseline FOC: {baseline.toFixed(2)} MT/day</p>}
        {refFoc != null && <p className="text-[#FF8C00]">Reference FOC: {refFoc.toFixed(2)} MT/day</p>}
        {cpGuaranteed != null && activeCondition && <p style={{ color: cpAccent }}>CP {activeCondition}: {cpGuaranteed.toFixed(2)} MT/day</p>}
        {cpAdjusted != null && <p className="text-[#22C55E]">CP Weather Adjusted: {cpAdjusted.toFixed(2)} MT/day</p>}
      </div>
    )
  }

  // Baseline / Reference / CP tooltip
  return (
    <div className="bg-[#102338] border border-slate-600 rounded-lg p-3 text-sm space-y-1 shadow-lg">
      <p className="text-white font-medium">Speed: {speed.toFixed(2)} kts</p>
      {baseline != null && <p className="text-[#00FFFF]">Baseline FOC: {baseline.toFixed(2)} MT/day</p>}
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

interface OverviewTabProps {
  selectedVessel: string
  timePeriod: string
}

export function OverviewTab({ selectedVessel, timePeriod }: OverviewTabProps) {
  const [vesselData, setVesselData] = useState<FuelPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [waveHeight, setWaveHeight] = useState([1])
  const [windBf, setWindBf] = useState([3])
  const [draft, setDraft] = useState([9])
  const [showActual, setShowActual] = useState(true)
  const [showTable, setShowTable] = useState(true)
  const [showUserCurve, setShowUserCurve] = useState(false)
  const [showUserCurveModal, setShowUserCurveModal] = useState(false)
  const [showCharterParty, setShowCharterParty] = useState(false)
  type CPCondition = "Ballast" | "Laden"
  type CPPoint = { condition: CPCondition; speed: string; foc: string; draft: string; wave: string; wind: string }
  const blankBallast = (): CPPoint => ({ condition: "Ballast", speed: "", foc: "", draft: "7", wave: "1", wind: "3" })
  const blankLaden = (): CPPoint => ({ condition: "Laden", speed: "", foc: "", draft: "11", wave: "1", wind: "3" })
  const [allCPPoints, setAllCPPoints] = useState<Record<string, CPPoint[]>>({
    PRIDE: [blankBallast(), blankLaden()],
    CONSTELLATION: [blankBallast(), blankLaden()],
    WILLOW: [blankBallast(), blankLaden()],
  })
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
  const [allVesselCurves, setAllVesselCurves] = useState<Record<string, CurveRow[]>>({
    PRIDE: [],
    CONSTELLATION: [],
    WILLOW: [],
  })

  const userCurvePoints = allVesselCurves[selectedVessel] ?? []
  const setUserCurvePoints = useCallback((updater: CurveRow[] | ((prev: CurveRow[]) => CurveRow[])) => {
    setAllVesselCurves(prev => ({
      ...prev,
      [selectedVessel]: typeof updater === "function" ? updater(prev[selectedVessel] ?? []) : updater,
    }))
  }, [selectedVessel])

  const addUserCurvePoint = () => {
    setUserCurvePoints((prev) => [...prev, { speed: "", foc: "", wave: "", wind: "", draft: "" }])
  }
  const removeUserCurvePoint = (index: number) => {
    setUserCurvePoints((prev) => prev.filter((_, i) => i !== index))
  }
  const updateUserCurvePoint = (index: number, field: "speed" | "foc" | "wave" | "wind" | "draft", value: string) => {
    setUserCurvePoints((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  // Load vessel CSV data
  useEffect(() => {
    const csvPath = VESSEL_CSV_MAP[selectedVessel]
    if (!csvPath) return
    setLoading(true)
    fetch(csvPath)
      .then(r => r.text())
      .then(text => {
        const data = parseCSV(text)
        setVesselData(data)
        // Reset sliders to midpoint of available ranges
        const drafts = [...new Set(data.map(d => d.draft))].sort((a, b) => a - b)
        if (drafts.length > 0) setDraft([drafts[Math.floor(drafts.length / 2)]])
      })
      .finally(() => setLoading(false))
  }, [selectedVessel])

  // Period multipliers for cumulative KPI values and fuel
  const periodScale: Record<string, number> = { "Last Week": 0.25, "Last Month": 1, "Last Quarter": 3, "YTD": 6 }
  const ps = periodScale[timePeriod] ?? 1
  // Period-based delta variation (shorter periods = more volatile)
  const periodDeltas: Record<string, Record<string, string[]>> = {
    "Last Week":    { PRIDE: ["+1%","+2%","+1%","+3%"],    CONSTELLATION: ["+2%","+3%","+2%","-1%"],   WILLOW: ["+4%","+1%","+3%","+2%"] },
    "Last Month":   { PRIDE: ["+3%","+4%","+3%","+6%"],    CONSTELLATION: ["+5%","+5%","+5%","+2%"],   WILLOW: ["+7%","+4%","+6%","+3%"] },
    "Last Quarter": { PRIDE: ["+4%","+5%","+4%","+7%"],    CONSTELLATION: ["+6%","+4%","+6%","+3%"],   WILLOW: ["+8%","+5%","+7%","+4%"] },
    "YTD":          { PRIDE: ["+5%","+6%","+5%","+8%"],    CONSTELLATION: ["+7%","+5%","+7%","+4%"],   WILLOW: ["+9%","+6%","+8%","+5%"] },
  }
  const deltas = periodDeltas[timePeriod]?.[selectedVessel] ?? ["+5%","+5%","+5%","+5%"]
  const fmt = (n: number) => Math.round(n).toLocaleString()

  // Per-vessel monthly base KPI values (scaled by period)
  const vesselKPIBase: Record<string, [number, number, number, number]> = {
    PRIDE:         [4820, 48150, 15920, 28400],
    CONSTELLATION: [5612, 54230, 18745, 76500],
    WILLOW:        [6340, 61800, 21100, 108200],
  }
  const kpiBase = vesselKPIBase[selectedVessel] ?? vesselKPIBase.CONSTELLATION
  const kpiData = [
    { label: "Total Fuel Consumption", unit: "MT", value: fmt(kpiBase[0] * ps), delta: deltas[0], icon: Droplets, color: "#FF6B6B" },
    { label: "Total Sailing Distance", unit: "NM", value: fmt(kpiBase[1] * ps), delta: deltas[1], icon: Navigation, color: "#4ECDC4" },
    { label: "Total Emissions (CO₂e)", unit: "MT", value: fmt(kpiBase[2] * ps), delta: deltas[2], icon: Leaf, color: "#45B7D1" },
    { label: "Cargo Carried", unit: "MT", value: fmt(kpiBase[3] * ps), delta: deltas[3], icon: Package, color: "#96CEB4" },
  ]

  // Per-vessel monthly base fuel breakdown (scaled by period)
  const vesselFuelBase: Record<string, { name: string; base: number; color: string }[]> = {
    PRIDE: [
      { name: "VLSFO", base: 2400, color: "#4ECDC4" },
      { name: "LSMGO", base: 1200, color: "#96CEB4" },
      { name: "LNG", base: 820, color: "#45B7D1" },
      { name: "HSFO", base: 400, color: "#FF6B6B" },
    ],
    CONSTELLATION: [
      { name: "HSFO", base: 1500, color: "#FF6B6B" },
      { name: "VLSFO", base: 2000, color: "#4ECDC4" },
      { name: "LNG", base: 1500, color: "#45B7D1" },
      { name: "LSMGO", base: 612, color: "#96CEB4" },
    ],
    WILLOW: [
      { name: "HSFO", base: 2800, color: "#FF6B6B" },
      { name: "VLSFO", base: 2100, color: "#4ECDC4" },
      { name: "LSMGO", base: 940, color: "#96CEB4" },
      { name: "LNG", base: 500, color: "#45B7D1" },
    ],
  }
  const fuelData = (vesselFuelBase[selectedVessel] ?? vesselFuelBase.CONSTELLATION).map(f => ({
    name: f.name, value: Math.round(f.base * ps), color: f.color,
  }))

  // Per-vessel score card (scores shift slightly by period — longer periods regress toward mean)
  const vesselScoreBase: Record<string, { metric: string; base: number }[]> = {
    PRIDE: [
      { metric: "Reporting Accuracy", base: 95 },
      { metric: "Reporting Timeliness", base: 91 },
      { metric: "Route Adherence", base: 88 },
      { metric: "Speed Compliance", base: 90 },
      { metric: "On-Time Arrival", base: 93 },
    ],
    CONSTELLATION: [
      { metric: "Reporting Accuracy", base: 92 },
      { metric: "Reporting Timeliness", base: 88 },
      { metric: "Route Adherence", base: 94 },
      { metric: "Speed Compliance", base: 86 },
      { metric: "On-Time Arrival", base: 89 },
    ],
    WILLOW: [
      { metric: "Reporting Accuracy", base: 87 },
      { metric: "Reporting Timeliness", base: 82 },
      { metric: "Route Adherence", base: 91 },
      { metric: "Speed Compliance", base: 79 },
      { metric: "On-Time Arrival", base: 85 },
    ],
  }
  const scoreShift: Record<string, number> = { "Last Week": 2, "Last Month": 0, "Last Quarter": -1, "YTD": -2 }
  const ss = scoreShift[timePeriod] ?? 0
  const scoreCardData = (vesselScoreBase[selectedVessel] ?? vesselScoreBase.CONSTELLATION).map(s => {
    const v = Math.min(100, Math.max(0, s.base + ss))
    return { metric: s.metric, rawScore: `${v}%`, value: v }
  })

  // Resolve active vessel data from loaded CSV
  // Full ranges for slider min/max (unfiltered)
  const allDrafts = [...new Set(vesselData.map(d => d.draft))].sort((a, b) => a - b)
  const allWaves = [...new Set(vesselData.map(d => d.wave))].sort((a, b) => a - b)
  const allWinds = [...new Set(vesselData.map(d => d.wind))].sort((a, b) => a - b)
  // Snapped values for filtering (use full ranges for snapping)
  const snappedDraft = allDrafts.length > 0 ? snapToNearest(draft[0], allDrafts) : draft[0]
  const snappedWave = allWaves.length > 0 ? snapToNearest(waveHeight[0], allWaves) : waveHeight[0]
  const snappedWind = allWinds.length > 0 ? snapToNearest(windBf[0], allWinds) : windBf[0]

  const parsedUserCurve = userCurvePoints
    .filter((p) => parseFloat(p.draft) === snappedDraft)
    .map((p) => {
      const speed = parseFloat(p.speed)
      const rawFoc = parseFloat(p.foc)
      const wave = parseFloat(p.wave) || 0
      const wind = parseFloat(p.wind) || 0
      if (isNaN(speed) || isNaN(rawFoc)) return null
      let userFoc = rawFoc
      if (normalizeWeather) {
        // Normalize from recorded weather conditions to current baseline weather
        const wfRecorded = 0.075 * ((wave + wind) / 2)
        const wfBaseline = 0.075 * snappedWave
        userFoc = parseFloat((rawFoc / (1 + wfRecorded) * (1 + wfBaseline)).toFixed(2))
      }
      return { speed, userFoc }
    })
    .filter((p): p is { speed: number; userFoc: number } => p !== null)
    .sort((a, b) => a.speed - b.speed)

  // Linear interpolation of user curve at a given speed
  const interpolateUserFoc = (speed: number): number | null => {
    if (parsedUserCurve.length < 2) return null
    if (speed < parsedUserCurve[0].speed || speed > parsedUserCurve[parsedUserCurve.length - 1].speed) return null
    for (let i = 0; i < parsedUserCurve.length - 1; i++) {
      const a = parsedUserCurve[i]
      const b = parsedUserCurve[i + 1]
      if (speed >= a.speed && speed <= b.speed) {
        const t = (speed - a.speed) / (b.speed - a.speed)
        return parseFloat((a.userFoc + t * (b.userFoc - a.userFoc)).toFixed(2))
      }
    }
    return null
  }

  // Speed vs FOC data — lookup from loaded vessel CSV
  const rawSpeedFocData = vesselData
    .filter(d => d.draft === snappedDraft && d.wave === snappedWave && d.wind === snappedWind)
    .sort((a, b) => a.stw - b.stw)
    .map(d => ({ speed: d.stw, baseline: d.baseline, draft: d.draft }))

  // Densify to 0.1 kts increments via linear interpolation between CSV points
  const speedFocData = (() => {
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
  })()

  // Helper: look up baseline FOC at any (speed, draft, wave, wind) by snapping + linear interpolation
  const baselineAtContext = (speed: number, draft: number, wave: number, wind: number): number | null => {
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
  }

  // Compute CP scale + average guaranteed weather context per condition
  const computeCPInfo = (condition: CPCondition) => {
    if (!showCharterParty || speedFocData.length === 0 || vesselData.length === 0) return null
    const valid = cpPoints
      .filter(p => p.condition === condition)
      .map(p => ({
        speed: parseFloat(p.speed), foc: parseFloat(p.foc),
        draft: parseFloat(p.draft), wave: parseFloat(p.wave), wind: parseFloat(p.wind),
      }))
      .filter(p => !isNaN(p.speed) && !isNaN(p.foc) && p.speed > 0 && p.foc > 0
        && !isNaN(p.draft) && !isNaN(p.wave) && !isNaN(p.wind))
    if (valid.length === 0) return null
    const ratios = valid.map(p => {
      const bl = baselineAtContext(p.speed, p.draft, p.wave, p.wind)
      return bl && bl > 0 ? p.foc / bl : null
    }).filter((r): r is number => r !== null)
    if (ratios.length === 0) return null
    const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length
    return {
      scale: avg(ratios),
      avgDraft: avg(valid.map(p => p.draft)),
      avgWave: avg(valid.map(p => p.wave)),
      avgWind: avg(valid.map(p => p.wind)),
    }
  }
  const ballastInfo = computeCPInfo("Ballast")
  const ladenInfo = computeCPInfo("Laden")

  // Determine which CP condition matches the current draft
  const distBallast = ballastInfo != null ? Math.abs(snappedDraft - ballastInfo.avgDraft) : Infinity
  const distLaden = ladenInfo != null ? Math.abs(snappedDraft - ladenInfo.avgDraft) : Infinity
  const activeCPInfo = distBallast <= distLaden ? ballastInfo : ladenInfo
  const activeCondition: CPCondition | null = activeCPInfo === ballastInfo && ballastInfo ? "Ballast" : (activeCPInfo === ladenInfo && ladenInfo ? "Laden" : null)

  // CP Guaranteed curve — fixed at the CP's own weather context (does NOT change with sliders)
  // For each speed, FOC = baseline(speed, cpDraft, cpWave, cpWind) × scale → passes through CP points
  const cpGuaranteedCurve = (() => {
    if (!activeCPInfo || !showCharterParty || speedFocData.length === 0) return []
    return speedFocData.map(d => {
      const blAtCP = baselineAtContext(d.speed, activeCPInfo.avgDraft, activeCPInfo.avgWave, activeCPInfo.avgWind)
      return {
        speed: d.speed,
        cpFoc: blAtCP != null ? parseFloat((blAtCP * activeCPInfo.scale).toFixed(2)) : 0,
      }
    }).filter(d => d.cpFoc > 0)
  })()

  // CP Weather-Adjusted curve — scales the currently visible baseline by the CP scale (moves with sliders)
  const cpAdjustedCurve = (() => {
    if (!activeCPInfo || !showCharterParty || speedFocData.length === 0) return []
    return speedFocData.map(d => ({
      speed: d.speed,
      cpFoc: parseFloat((d.baseline * activeCPInfo.scale).toFixed(2)),
    }))
  })()

  // Backward-compat exports for tooltip/table
  const cpBallastCurve = activeCondition === "Ballast" ? cpAdjustedCurve : []
  const cpLadenCurve = activeCondition === "Laden" ? cpAdjustedCurve : []
  const charterPartyCurve = cpAdjustedCurve

  // Actual reported scatter points concentrated between 11.5–13 kts
  const generateActualPoints = () => {
    if (speedFocData.length === 0) return []
    const seed = 42
    const clusterMin = 11.5, clusterMax = 13.0
    const baseDate = new Date("2025-01-05")
    const points = []
    for (let i = 0; i < 25; i++) {
      const t = i / 24
      const speed = parseFloat((clusterMin + t * (clusterMax - clusterMin) + (Math.sin(seed + i) * 0.15)).toFixed(2))
      const idx = speedFocData.findIndex(d => d.speed >= speed)
      const ref = speedFocData[Math.max(0, idx < 0 ? speedFocData.length - 1 : idx)]
      if (!ref) continue
      const noise = (Math.sin(seed * (i + 1)) * 0.08 + Math.cos(seed + i * 2) * 0.04) * ref.baseline
      const reportDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000)
      const dateStr = reportDate.toISOString().split("T")[0]
      points.push({ speed, baseline: parseFloat((ref.baseline + noise).toFixed(2)), date: dateStr })
    }
    return points.sort((a, b) => a.speed - b.speed)
  }

  const actualPoints = generateActualPoints()

  if (loading && vesselData.length === 0) {
    return <div className="text-center text-slate-400 py-12 text-lg">Loading vessel data for {selectedVessel}...</div>
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiData.map((kpi, index) => {
            const Icon = kpi.icon
            return (
              <div key={index} className="card-maritime p-4 border-l-2 transition-all duration-200 hover:translate-y-[-2px]" style={{ borderLeftColor: kpi.color }}>
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
                    <span className="inline-flex items-center text-sm font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                      {kpi.delta}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fuel Consumption Breakdown */}
        <Card className="card-maritime">
          <CardHeader>
            <CardTitle className="text-white text-2xl font-bold">Fuel Consumption Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={fuelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  dataKey="value"
                  stroke="#000000"
                  strokeWidth={1}
                >
                  {fuelData.map((entry, index) => (
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
              {fuelData.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-sm text-white">
                    {item.name}: {item.value.toLocaleString()}MT
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Vessel Score Card (as Score Indicators) */}
        <Card className="card-maritime">
          <CardHeader>
            <CardTitle className="text-white text-2xl font-bold">Vessel Score Card</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2">
              {scoreCardData.map((item, index) => (
                <ScoreIndicator key={index} label={item.metric} rawScore={item.rawScore} value={item.value} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Speed Consumption Curve */}
      <div className="space-y-4">
        <h3 className="section-heading text-2xl">Speed Consumption Curve</h3>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls */}
          <Card className="card-maritime bg-[#071318]">
            <CardContent className="p-5 space-y-5">
              <p className="section-heading text-sm mb-3">Weather Conditions</p>
              <div>
                <label className="text-white text-base mb-2 flex items-center gap-2">
                  <Waves className="w-3.5 h-3.5 text-[#24D2B5]" />
                  Wave Height (m) <span className="value-badge">{waveHeight[0]}</span>
                </label>
                <Slider
                  value={waveHeight}
                  onValueChange={setWaveHeight}
                  max={4}
                  min={0}
                  step={0.25}
                  className="w-full [&>span:first-child]:bg-[#24D2B5]"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>0m</span>
                  <span>4m</span>
                </div>
              </div>
              <div>
                <label className="text-white text-base mb-2 flex items-center gap-2">
                  <Wind className="w-3.5 h-3.5 text-[#24D2B5]" />
                  Wind (Beaufort) <span className="value-badge">{windBf[0]}</span>
                </label>
                <Slider
                  value={windBf}
                  onValueChange={setWindBf}
                  max={8}
                  min={0}
                  step={1}
                  className="w-full [&>span:first-child]:bg-[#24D2B5]"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>0</span>
                  <span>8</span>
                </div>
              </div>
              <div className="border-t border-slate-700/50 pt-4">
                <p className="section-heading text-sm mb-3">Vessel Draft</p>
              </div>
              <div>
                <label className="text-white text-base mb-2 flex items-center gap-2">
                  <Anchor className="w-3.5 h-3.5 text-[#24D2B5]" />
                  Draft (m) <span className="value-badge">{draft[0]}</span>
                  <span className="text-slate-500 text-xs">→ {snappedDraft}m</span>
                </label>
                <Slider
                  value={draft}
                  onValueChange={setDraft}
                  max={12}
                  min={7}
                  step={0.2}
                  className="w-full [&>span:first-child]:bg-[#24D2B5]"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>7m</span>
                  <span>12m</span>
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
                <label htmlFor="showActual" className="text-white text-base">
                  Show Reported Points
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="showTable" checked={showTable} onCheckedChange={setShowTable} />
                <label htmlFor="showTable" className="text-white text-base">
                  Show Model Data Table
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showUserCurve"
                  checked={showUserCurve}
                  onCheckedChange={(v) => setShowUserCurve(!!v)}
                />
                <label htmlFor="showUserCurve" className="text-white text-base">
                  Show Reference Data
                </label>
              </div>
              {showUserCurve && (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="normalizeWeather"
                      checked={normalizeWeather}
                      onCheckedChange={(v) => setNormalizeWeather(!!v)}
                    />
                    <label htmlFor="normalizeWeather" className="text-white text-base">
                      Normalize to baseline weather
                    </label>
                  </div>
                  <button
                    onClick={() => setShowUserCurveModal(true)}
                    className="w-full text-sm text-black bg-[#FF8C00] hover:bg-orange-400 rounded px-3 py-2 font-medium"
                  >
                    Edit Reference Data
                  </button>
                  {/* Quick-select from user curve conditions */}
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
                              <button
                                key={i}
                                onClick={() => {
                                  setDraft([c.draft])
                                  setWaveHeight([c.wave])
                                  setWindBf([c.wind])
                                }}
                                className={`text-xs px-2 py-1 rounded border transition-all ${
                                  isActive
                                    ? "bg-[#FF8C00]/20 border-[#FF8C00] text-[#FF8C00]"
                                    : "bg-[#0A1B26] border-slate-600 text-slate-300 hover:border-[#FF8C00]/50 hover:text-white"
                                }`}
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
                  <Checkbox
                    id="showCharterParty"
                    checked={showCharterParty}
                    onCheckedChange={(v) => setShowCharterParty(!!v)}
                  />
                  <label htmlFor="showCharterParty" className="text-white text-base">
                    Show Charter Party
                  </label>
                </div>
              </div>
              {showCharterParty && (
                <div className="space-y-3 bg-[#0A1B26] rounded-lg p-3 border border-[#22C55E]/30">
                  <p className="text-[#22C55E] text-sm font-medium">CP Guarantee Points</p>
                  <p className="text-xs text-slate-500">Each point includes its own draft + weather context. The CP curve runs parallel to the visible baseline.</p>
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
                        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_auto] gap-1 items-center">
                          <span className="text-slate-500 text-[10px]">Speed</span>
                          <span className="text-slate-500 text-[10px]">FOC</span>
                          <span className="text-slate-500 text-[10px]">Draft</span>
                          <span className="text-slate-500 text-[10px]">Wave</span>
                          <span className="text-slate-500 text-[10px]">Wind</span>
                          <span></span>
                          {points.map(({ p, i }) => (
                            <React.Fragment key={i}>
                              <input type="number" value={p.speed} onChange={e => updateCPPoint(i, "speed", e.target.value)}
                                className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="kts" />
                              <input type="number" value={p.foc} onChange={e => updateCPPoint(i, "foc", e.target.value)}
                                className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="MT/d" />
                              <input type="number" value={p.draft} onChange={e => updateCPPoint(i, "draft", e.target.value)}
                                className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="m" />
                              <input type="number" value={p.wave} onChange={e => updateCPPoint(i, "wave", e.target.value)}
                                className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="m" />
                              <input type="number" value={p.wind} onChange={e => updateCPPoint(i, "wind", e.target.value)}
                                className="bg-[#071318] border border-slate-700 rounded px-1.5 py-1 text-white text-xs w-full focus:border-[#22C55E] transition-colors" placeholder="Bf" />
                              <button onClick={() => removeCPPoint(i)} disabled={cpPoints.length <= 1}
                                className="text-red-400 hover:text-red-300 disabled:text-slate-700 disabled:cursor-not-allowed text-base leading-none px-1">×</button>
                            </React.Fragment>
                          ))}
                          {points.length === 0 && (
                            <span className="col-span-6 text-xs text-slate-600 italic">No {cond.toLowerCase()} points</span>
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
                  {/* Quick-jump shortcuts: average draft/wave/wind per condition */}
                  {(() => {
                    const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length
                    const groupAvg = (cond: CPCondition) => {
                      const valid = cpPoints
                        .filter(p => p.condition === cond)
                        .map(p => ({ d: parseFloat(p.draft), w: parseFloat(p.wave), wi: parseFloat(p.wind) }))
                        .filter(p => !isNaN(p.d) && !isNaN(p.w) && !isNaN(p.wi))
                      if (valid.length === 0) return null
                      return { draft: avg(valid.map(p => p.d)), wave: avg(valid.map(p => p.w)), wind: avg(valid.map(p => p.wi)) }
                    }
                    const ballast = groupAvg("Ballast")
                    const laden = groupAvg("Laden")
                    if (!ballast && !laden) return null
                    return (
                      <div className="space-y-1.5 pt-2 border-t border-slate-700/50">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Quick jump to CP context</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ballast && (() => {
                            const isActive = snappedDraft === snapToNearest(ballast.draft, allDrafts)
                            return (
                              <button
                                onClick={() => {
                                  setDraft([ballast.draft])
                                  setWaveHeight([ballast.wave])
                                  setWindBf([ballast.wind])
                                }}
                                className={`text-xs px-2 py-1 rounded border transition-all ${
                                  isActive
                                    ? "bg-[#60A5FA]/20 border-[#60A5FA] text-[#60A5FA]"
                                    : "bg-[#0A1B26] border-slate-600 text-slate-300 hover:border-[#60A5FA]/50 hover:text-white"
                                }`}
                              >
                                Ballast · D{ballast.draft.toFixed(1)} · W{ballast.wave.toFixed(1)}m · Bf{Math.round(ballast.wind)}
                              </button>
                            )
                          })()}
                          {laden && (() => {
                            const isActive = snappedDraft === snapToNearest(laden.draft, allDrafts)
                            return (
                              <button
                                onClick={() => {
                                  setDraft([laden.draft])
                                  setWaveHeight([laden.wave])
                                  setWindBf([laden.wind])
                                }}
                                className={`text-xs px-2 py-1 rounded border transition-all ${
                                  isActive
                                    ? "bg-[#A78BFA]/20 border-[#A78BFA] text-[#A78BFA]"
                                    : "bg-[#0A1B26] border-slate-600 text-slate-300 hover:border-[#A78BFA]/50 hover:text-white"
                                }`}
                              >
                                Laden · D{laden.draft.toFixed(1)} · W{laden.wave.toFixed(1)}m · Bf{Math.round(laden.wind)}
                              </button>
                            )
                          })()}
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
                    domain={speedFocData.length > 0
                      ? [Math.floor(speedFocData[0].speed), Math.ceil(speedFocData[speedFocData.length - 1].speed)]
                      : [8, 18]}
                    ticks={speedFocData.length > 0
                      ? Array.from({ length: Math.ceil(speedFocData[speedFocData.length - 1].speed) - Math.floor(speedFocData[0].speed) + 1 }, (_, i) => Math.floor(speedFocData[0].speed) + i)
                      : [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]}
                    stroke="white"
                    tick={{ fill: "white" }}
                    label={{
                      value: "STW (Kts)",
                      position: "insideBottom",
                      offset: -15,
                      style: { textAnchor: "middle", fill: "white" },
                    }}
                  />
                  <YAxis
                    stroke="white"
                    tick={{ fill: "white" }}
                    label={{
                      value: "FOC (MT/day)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      style: { textAnchor: "middle", fill: "white" },
                    }}
                  />
                  <ZAxis type="number" range={[60, 60]} />
                  <Tooltip content={(props) => (
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
                    wrapperStyle={{ paddingTop: "10px" }}
                    payload={[
                      { value: "Actual Reported FOC", type: "circle", color: "#0000FF" },
                      { value: "Baseline FOC", type: "line", color: "#00FFFF" },
                      ...(showUserCurve && parsedUserCurve.length >= 2
                        ? [{ value: "Reference Model", type: "line" as const, color: "#FF8C00" }]
                        : []),
                      ...(showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition
                        ? [{ value: `CP ${activeCondition}`, type: "line" as const, color: activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA" }]
                        : []),
                      ...(showCharterParty && cpAdjustedCurve.length > 0
                        ? [{ value: "CP Weather Adjusted", type: "line" as const, color: "#22C55E" }]
                        : []),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke="#00FFFF"
                    strokeWidth={3}
                    name="Baseline FOC"
                    dot={false}
                  />
                  {showActual && (
                    <Scatter
                      data={actualPoints}
                      dataKey="baseline"
                      fill="#0000FF"
                      name="Actual Reported FOC"
                    >
                      {actualPoints.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="#0000FF" />
                      ))}
                    </Scatter>
                  )}
                  {showUserCurve && parsedUserCurve.length >= 2 && (
                    <Line
                      data={parsedUserCurve}
                      type="monotone"
                      dataKey="userFoc"
                      stroke="#FF8C00"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      name="Reference Model"
                      dot={{ fill: "#FF8C00", r: 4 }}
                      legendType="line"
                    />
                  )}
                  {showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition && (
                    <Line
                      data={cpGuaranteedCurve}
                      type="monotone"
                      dataKey="cpFoc"
                      stroke={activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA"}
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      name={`CP ${activeCondition}`}
                      dot={false}
                      legendType="line"
                    />
                  )}
                  {showCharterParty && cpAdjustedCurve.length > 0 && (
                    <Line
                      data={cpAdjustedCurve}
                      type="monotone"
                      dataKey="cpFoc"
                      stroke="#22C55E"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      name="CP Weather Adjusted"
                      dot={false}
                      legendType="line"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Reference Data Modal */}
        {showUserCurveModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={(e) => { if (e.target === e.currentTarget) setShowUserCurveModal(false) }}
          >
            <div className="bg-[#071318] border border-slate-600 rounded-lg w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col shadow-2xl">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                <div>
                  <h2 className="text-[#FF8C00] font-semibold text-lg">Reference Data — Data Points</h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Baseline at <span className="text-[#24D2B5]">{snappedDraft}m</span> · rows must have a matching draft to appear on the chart
                  </p>
                </div>
                <button
                  onClick={() => setShowUserCurveModal(false)}
                  className="text-slate-400 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Modal body — scrollable */}
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
                          <input type="number" value={point.speed}
                            onChange={(e) => updateUserCurvePoint(index, "speed", e.target.value)}
                            className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="e.g. 10" />
                        </td>
                        <td className="p-1">
                          <input type="number" value={point.foc}
                            onChange={(e) => updateUserCurvePoint(index, "foc", e.target.value)}
                            className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="e.g. 50" />
                        </td>
                        <td className="p-1">
                          <input type="number" value={point.draft}
                            onChange={(e) => updateUserCurvePoint(index, "draft", e.target.value)}
                            className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="e.g. 10" min={0} step={0.5} />
                        </td>
                        <td className="p-1">
                          <input type="number" value={point.wave}
                            onChange={(e) => updateUserCurvePoint(index, "wave", e.target.value)}
                            className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="0–4" min={0} max={4} step={1} />
                        </td>
                        <td className="p-1">
                          <input type="number" value={point.wind}
                            onChange={(e) => updateUserCurvePoint(index, "wind", e.target.value)}
                            className="bg-[#0A1B26] border border-slate-600 rounded px-2 py-1 text-white text-sm w-full" placeholder="0–4" min={0} max={4} step={1} />
                        </td>
                        <td className="p-1 text-center">
                          <button onClick={() => removeUserCurvePoint(index)} className="text-red-400 hover:text-red-300 text-base leading-none">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal footer */}
              <div className="px-5 py-3 border-t border-slate-700 flex flex-wrap items-center gap-3">
                <button
                  onClick={addUserCurvePoint}
                  className="text-sm text-[#FF8C00] hover:text-orange-300 border border-[#FF8C00] rounded px-3 py-1"
                >
                  + Add Row
                </button>
                <label className="text-sm text-[#FF8C00] hover:text-orange-300 border border-[#FF8C00] rounded px-3 py-1 cursor-pointer">
                  Upload CSV
                  <input type="file" accept=".csv" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = (evt) => {
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
                <button
                  onClick={() => setShowUserCurveModal(false)}
                  className="ml-auto text-sm bg-[#24D2B5] hover:bg-teal-400 text-black rounded px-4 py-1 font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Model Data Table */}
        {showTable && (
          <Card className="card-maritime">
            <CardHeader>
              <CardTitle className="text-white text-2xl font-bold">
                Speed Consumption Model Data
                <span className="ml-2 text-sm font-normal text-slate-400">Draft {snappedDraft}m · Wave {snappedWave}m · Wind Bf {snappedWind}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="p-3 text-white">Speed (Kts)</th>
                      <th className="p-3 text-white">Draft (m)</th>
                      <th className="p-3 text-white">Baseline FOC (MT/day)</th>
                      {showUserCurve && parsedUserCurve.length >= 2 && (
                        <th className="p-3 text-[#FF8C00]">Reference FOC (MT/day)</th>
                      )}
                      {showUserCurve && parsedUserCurve.length >= 2 && (
                        <th className="p-3 text-slate-400">Δ vs Baseline</th>
                      )}
                      {showCharterParty && cpGuaranteedCurve.length > 0 && activeCondition && (
                        <th className="p-3" style={{ color: activeCondition === "Ballast" ? "#60A5FA" : "#A78BFA" }}>CP {activeCondition} (MT/day)</th>
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
                            <td className="p-3 text-[#FF8C00]">
                              {userFoc !== null ? userFoc.toFixed(2) : "—"}
                            </td>
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
                            <td className="p-3 text-[#22C55E]">
                              {cpAdjustedVal !== null ? cpAdjustedVal.toFixed(2) : "—"}
                            </td>
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
    </div>
  )
}
