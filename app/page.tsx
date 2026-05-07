"use client"

import { useState } from "react"
import { OverviewTab } from "@/components/overview-tab-v2"
import { HullTab } from "@/components/hull-tab"
import { MachineryTab } from "@/components/machinery-tab"
import { VesselInfoCard } from "@/components/vessel-info-card"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Ship, Calendar } from "lucide-react"

const PERIOD_OPTIONS = ["Last Week", "Last Month", "Last Quarter", "YTD", "Custom"] as const
type Period = typeof PERIOD_OPTIONS[number]

export default function VesselDashboard() {
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedVessel, setSelectedVessel] = useState("PRIDE")
  const [timePeriod, setTimePeriod] = useState<Period>("Last Month")
  // improvement #7: custom date range state
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const tabItems = [
    { id: "overview", title: "Overview" },
    { id: "hull", title: "Hull" },
    { id: "machinery", title: "Machinery" },
  ]

  return (
    <div className="min-h-screen w-full bg-[#051219] p-4 md:p-6 lg:p-8">
      <VesselInfoCard selectedVessel={selectedVessel} />

      {/* Selection Controls */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-1.5 text-base font-medium text-slate-300 mb-2">
            <Ship className="w-4 h-4 text-[#24D2B5]" />
            Select Vessel
          </label>
          <Select value={selectedVessel} onValueChange={setSelectedVessel}>
            <SelectTrigger className="card-maritime text-white hover:border-[#24D2B5]/40 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0A1B26] border-slate-600">
              <SelectItem value="PRIDE">PRIDE</SelectItem>
              <SelectItem value="CONSTELLATION">CONSTELLATION</SelectItem>
              <SelectItem value="WILLOW">WILLOW</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-base font-medium text-slate-300 mb-2">
            <Calendar className="w-4 h-4 text-[#24D2B5]" />
            Select Period
          </label>
          <Select value={timePeriod} onValueChange={v => setTimePeriod(v as Period)}>
            <SelectTrigger className="card-maritime text-white hover:border-[#24D2B5]/40 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0A1B26] border-slate-600">
              {PERIOD_OPTIONS.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* improvement #7: custom date range inputs */}
          {timePeriod === "Custom" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="flex-1 bg-[#0A1B26] border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:border-[#24D2B5] outline-none transition-colors"
              />
              <span className="text-slate-500 text-sm">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={e => setCustomTo(e.target.value)}
                className="flex-1 bg-[#0A1B26] border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:border-[#24D2B5] outline-none transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="flex bg-[#0A1B26]/50 p-1 rounded-xl border border-slate-700/50 backdrop-blur-sm">
          {tabItems.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 text-base font-medium rounded-lg transition-all duration-200 relative ${
                activeTab === tab.id
                  ? "bg-gradient-to-b from-[#24D2B5] to-[#1fb89e] text-black shadow-lg shadow-[#24D2B5]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="animate-fade-in-up">
        {activeTab === "overview" && (
          <OverviewTab
            selectedVessel={selectedVessel}
            timePeriod={timePeriod}
            customFrom={customFrom}
            customTo={customTo}
          />
        )}
        {activeTab === "hull" && <HullTab selectedVessel={selectedVessel} timePeriod={timePeriod} />}
        {activeTab === "machinery" && <MachineryTab selectedVessel={selectedVessel} timePeriod={timePeriod} />}
      </div>
    </div>
  )
}
