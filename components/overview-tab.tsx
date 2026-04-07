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
import { useState, useEffect, useCallback } from "react"
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
  interpolateUserFoc, showUserCurve,
}: {
  active?: boolean
  payload?: any[]
  interpolateUserFoc?: (speed: number) => number | null
  showUserCurve?: boolean
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const speed = typeof d.speed === "number" ? d.speed : null
  const baseline = typeof d.baseline === "number" ? d.baseline : null
  if (speed == null) return null
  const userFoc = showUserCurve && interpolateUserFoc ? interpolateUserFoc(speed) : null
  const delta = userFoc != null && baseline != null ? userFoc - baseline : null
  return (
    <div className="bg-[#102338] border border-slate-600 rounded p-3 text-sm space-y-1">
      <p className="text-white font-medium">Speed: {speed.toFixed(1)} kts</p>
      {baseline != null && <p className="text-[#00FFFF]">Baseline FOC: {baseline.toFixed(2)} MT/day</p>}
      {userFoc != null && delta != null && (
        <>
          <p className="text-[#FF8C00]">User FOC: {userFoc.toFixed(2)} MT/day</p>
          <p className={delta > 0 ? "text-red-400" : "text-green-400"}>
            Δ: {delta > 0 ? "+" : ""}{delta.toFixed(2)} ({delta > 0 ? "+" : ""}{((delta / baseline!) * 100).toFixed(1)}%)
          </p>
        </>
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

  // Per-vessel KPI data
  const vesselKPIs: Record<string, { label: string; unit: string; value: string; delta: string; icon: typeof Droplets; color: string }[]> = {
    PRIDE: [
      { label: "Total Fuel Consumption", unit: "MT", value: "4,820", delta: "+3%", icon: Droplets, color: "#FF6B6B" },
      { label: "Total Sailing Distance", unit: "NM", value: "48,150", delta: "+4%", icon: Navigation, color: "#4ECDC4" },
      { label: "Total Emissions (CO₂e)", unit: "MT", value: "15,920", delta: "+3%", icon: Leaf, color: "#45B7D1" },
      { label: "Cargo Carried", unit: "MT", value: "28,400", delta: "+6%", icon: Package, color: "#96CEB4" },
    ],
    CONSTELLATION: [
      { label: "Total Fuel Consumption", unit: "MT", value: "5,612", delta: "+5%", icon: Droplets, color: "#FF6B6B" },
      { label: "Total Sailing Distance", unit: "NM", value: "54,230", delta: "+5%", icon: Navigation, color: "#4ECDC4" },
      { label: "Total Emissions (CO₂e)", unit: "MT", value: "18,745", delta: "+5%", icon: Leaf, color: "#45B7D1" },
      { label: "Cargo Carried", unit: "MT", value: "76,500", delta: "+2%", icon: Package, color: "#96CEB4" },
    ],
    WILLOW: [
      { label: "Total Fuel Consumption", unit: "MT", value: "6,340", delta: "+7%", icon: Droplets, color: "#FF6B6B" },
      { label: "Total Sailing Distance", unit: "NM", value: "61,800", delta: "+4%", icon: Navigation, color: "#4ECDC4" },
      { label: "Total Emissions (CO₂e)", unit: "MT", value: "21,100", delta: "+6%", icon: Leaf, color: "#45B7D1" },
      { label: "Cargo Carried", unit: "MT", value: "108,200", delta: "+3%", icon: Package, color: "#96CEB4" },
    ],
  }
  const kpiData = vesselKPIs[selectedVessel] ?? vesselKPIs.CONSTELLATION

  // Per-vessel fuel breakdown
  const vesselFuel: Record<string, { name: string; value: number; color: string }[]> = {
    PRIDE: [
      { name: "VLSFO", value: 2400, color: "#4ECDC4" },
      { name: "LSMGO", value: 1200, color: "#96CEB4" },
      { name: "LNG", value: 820, color: "#45B7D1" },
      { name: "HSFO", value: 400, color: "#FF6B6B" },
    ],
    CONSTELLATION: [
      { name: "HSFO", value: 1500, color: "#FF6B6B" },
      { name: "VLSFO", value: 2000, color: "#4ECDC4" },
      { name: "LNG", value: 1500, color: "#45B7D1" },
      { name: "LSMGO", value: 612, color: "#96CEB4" },
    ],
    WILLOW: [
      { name: "HSFO", value: 2800, color: "#FF6B6B" },
      { name: "VLSFO", value: 2100, color: "#4ECDC4" },
      { name: "LSMGO", value: 940, color: "#96CEB4" },
      { name: "LNG", value: 500, color: "#45B7D1" },
    ],
  }
  const fuelData = vesselFuel[selectedVessel] ?? vesselFuel.CONSTELLATION

  // Per-vessel score card
  const vesselScores: Record<string, { metric: string; rawScore: string; value: number }[]> = {
    PRIDE: [
      { metric: "Reporting Accuracy", rawScore: "95%", value: 95 },
      { metric: "Reporting Timeliness", rawScore: "91%", value: 91 },
      { metric: "Route Adherence", rawScore: "88%", value: 88 },
      { metric: "Speed Compliance", rawScore: "90%", value: 90 },
      { metric: "On-Time Arrival", rawScore: "93%", value: 93 },
    ],
    CONSTELLATION: [
      { metric: "Reporting Accuracy", rawScore: "92%", value: 92 },
      { metric: "Reporting Timeliness", rawScore: "88%", value: 88 },
      { metric: "Route Adherence", rawScore: "94%", value: 94 },
      { metric: "Speed Compliance", rawScore: "86%", value: 86 },
      { metric: "On-Time Arrival", rawScore: "89%", value: 89 },
    ],
    WILLOW: [
      { metric: "Reporting Accuracy", rawScore: "87%", value: 87 },
      { metric: "Reporting Timeliness", rawScore: "82%", value: 82 },
      { metric: "Route Adherence", rawScore: "91%", value: 91 },
      { metric: "Speed Compliance", rawScore: "79%", value: 79 },
      { metric: "On-Time Arrival", rawScore: "85%", value: 85 },
    ],
  }
  const scoreCardData = vesselScores[selectedVessel] ?? vesselScores.CONSTELLATION

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
  const speedFocData = vesselData
    .filter(d => d.draft === snappedDraft && d.wave === snappedWave && d.wind === snappedWind)
    .sort((a, b) => a.stw - b.stw)
    .map(d => ({ speed: d.stw, baseline: d.baseline, draft: d.draft }))

  // Actual reported scatter points concentrated between 11.5–13 kts
  const generateActualPoints = () => {
    if (speedFocData.length === 0) return []
    const seed = 42
    const clusterMin = 11.5, clusterMax = 13.0
    const points = []
    for (let i = 0; i < 25; i++) {
      const t = i / 24
      const speed = parseFloat((clusterMin + t * (clusterMax - clusterMin) + (Math.sin(seed + i) * 0.15)).toFixed(2))
      const idx = speedFocData.findIndex(d => d.speed >= speed)
      const ref = speedFocData[Math.max(0, idx < 0 ? speedFocData.length - 1 : idx)]
      if (!ref) continue
      const noise = (Math.sin(seed * (i + 1)) * 0.08 + Math.cos(seed + i * 2) * 0.04) * ref.baseline
      points.push({ speed, baseline: parseFloat((ref.baseline + noise).toFixed(2)) })
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
                    {item.name}: {item.value}MT
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
                  Show User Curve
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
                    Edit User Curve Data
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
                    />
                  )} />
                  <Legend
                    wrapperStyle={{ paddingTop: "10px" }}
                    payload={[
                      { value: "Actual Reported FOC", type: "circle", color: "#0000FF" },
                      { value: "Baseline FOC", type: "line", color: "#00FFFF" },
                      ...(showUserCurve && parsedUserCurve.length >= 2
                        ? [{ value: "User Input Curve", type: "line" as const, color: "#FF8C00" }]
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
                      name="User Input Curve"
                      dot={{ fill: "#FF8C00", r: 4 }}
                      legendType="line"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* User Curve Modal */}
        {showUserCurveModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={(e) => { if (e.target === e.currentTarget) setShowUserCurveModal(false) }}
          >
            <div className="bg-[#071318] border border-slate-600 rounded-lg w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col shadow-2xl">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                <div>
                  <h2 className="text-[#FF8C00] font-semibold text-lg">User Fuel Curve — Data Points</h2>
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
                        <th className="p-3 text-[#FF8C00]">User FOC (MT/day)</th>
                      )}
                      {showUserCurve && parsedUserCurve.length >= 2 && (
                        <th className="p-3 text-slate-400">Δ vs Baseline</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {speedFocData.map((dataPoint, index) => {
                      const userFoc = showUserCurve ? interpolateUserFoc(dataPoint.speed) : null
                      const delta = userFoc !== null ? userFoc - dataPoint.baseline : null
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
