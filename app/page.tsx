"use client"

import { useState } from "react"
import { OverviewTab } from "@/components/overview-tab"
import { HullTab } from "@/components/hull-tab"
import { MachineryTab } from "@/components/machinery-tab"
import { VesselInfoCard } from "@/components/vessel-info-card"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Ship, Calendar } from "lucide-react"

export default function VesselDashboard() {
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedVessel, setSelectedVessel] = useState("PRIDE")
  const [timePeriod, setTimePeriod] = useState("Last Month")

  const tabItems = [
    { id: "overview", title: "Overview" },
    { id: "hull", title: "Hull" },
    { id: "machinery", title: "Machinery" },
  ]

  const tabProps = { selectedVessel, timePeriod }

  return (
    <div className="min-h-screen w-full bg-[#051219] p-4 md:p-6 lg:p-8">
      {/* Top Section: Vessel Info Card */}
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
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="card-maritime text-white hover:border-[#24D2B5]/40 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0A1B26] border-slate-600">
              <SelectItem value="Last Week">Last Week</SelectItem>
              <SelectItem value="Last Month">Last Month</SelectItem>
              <SelectItem value="Last Quarter">Last Quarter</SelectItem>
              <SelectItem value="YTD">YTD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="flex bg-[#0A1B26]/50 p-1 rounded-xl border border-slate-700/50 backdrop-blur-sm">
          {tabItems.map((tab) => (
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

      {/* Main Content Area */}
      <div className="animate-fade-in-up">
        {activeTab === "overview" && <OverviewTab {...tabProps} />}
        {activeTab === "hull" && <HullTab {...tabProps} />}
        {activeTab === "machinery" && <MachineryTab {...tabProps} />}
      </div>
    </div>
  )
}
