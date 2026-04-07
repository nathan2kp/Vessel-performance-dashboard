import type React from "react"
import { Progress } from "@/components/ui/progress"
import { Ship, ArrowRight } from "lucide-react"

const VESSEL_INFO: Record<string, {
  name: string; imo: string; type: string; dwt: string;
  engine: string; power: string; rpm: string;
  departure: string; arrival: string; depPort: string; arrPort: string;
  depDate: string; eta: string; progress: number;
}> = {
  PRIDE: {
    name: "PRIDE", imo: "9312456", type: "CONTAINER SHIP", dwt: "65,000",
    engine: "MAN B&W 7S65ME-C8.2", power: "18,660 kW", rpm: "95",
    departure: "SG SIN", arrival: "CN SHA", depPort: "Singapore",
    arrPort: "Shanghai", depDate: "2025-02-01 08:30 (UTC+8)",
    eta: "2025-02-08 14:00 (UTC+8)", progress: 72,
  },
  CONSTELLATION: {
    name: "CONSTELLATION", imo: "9425781", type: "BULK CARRIER", dwt: "82,000",
    engine: "MAN B&W 6S60ME-C8.5", power: "13,560 kW", rpm: "102",
    departure: "SG SIN", arrival: "KE MBA", depPort: "Singapore",
    arrPort: "Mombasa", depDate: "2025-01-19 17:25 (UTC+8)",
    eta: "2025-01-30 10:00 (UTC+3)", progress: 65,
  },
  WILLOW: {
    name: "WILLOW", imo: "9538192", type: "TANKER", dwt: "115,000",
    engine: "MAN B&W 6G50ME-C9.5", power: "11,300 kW", rpm: "89",
    departure: "AE JEA", arrival: "JP YOK", depPort: "Jebel Ali",
    arrPort: "Yokohama", depDate: "2025-01-25 06:00 (UTC+4)",
    eta: "2025-02-10 09:00 (UTC+9)", progress: 48,
  },
}

export function VesselInfoCard({ selectedVessel }: { selectedVessel: string }) {
  const v = VESSEL_INFO[selectedVessel] ?? VESSEL_INFO.CONSTELLATION

  return (
    <div className="card-maritime-elevated mb-6 overflow-hidden">
      <div className="h-0.5 bg-gradient-to-r from-[#24D2B5] via-[#24D2B5]/40 to-transparent" />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vessel Information */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center text-sm font-medium px-2 py-0.5 rounded border border-[#24D2B5]/30 text-[#24D2B5] bg-[#24D2B5]/10">
                {v.type}
              </span>
              <span className="text-sm text-slate-400">IMO {v.imo} · {v.dwt} DWT</span>
            </div>
            <h2 className="text-white text-4xl font-bold tracking-tight flex items-center gap-3 mb-2">
              <Ship className="w-7 h-7 text-[#24D2B5]" />
              {v.name}
            </h2>
            <p className="text-slate-400 text-base">{v.engine} · {v.power} · {v.rpm} RPM</p>
          </div>

          {/* Voyage Progress */}
          <div className="flex flex-col justify-center">
            <div className="mb-4">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 mb-0.5">Departure</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#24D2B5] shadow-[0_0_6px_rgba(36,210,181,0.5)]" />
                    <span className="text-white font-semibold text-xl">{v.departure}</span>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 mb-1" />
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-slate-500 mb-0.5">Arrival</p>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-xl">{v.arrival}</span>
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-[#24D2B5]" />
                  </div>
                </div>
              </div>

              <div className="relative">
                <Progress
                  value={v.progress}
                  className="h-1.5 bg-slate-700/50 rounded-full"
                  style={{ "--progress-background": "#24D2B5" } as React.CSSProperties}
                />
                <div
                  className="absolute top-1/2 w-3.5 h-3.5 bg-[#24D2B5] rounded-full border-2 border-white shadow-[0_0_8px_rgba(36,210,181,0.5)] animate-glow-pulse"
                  style={{ left: `${v.progress}%`, transform: "translateX(-50%) translateY(-50%)" }}
                />
              </div>
              <p className="text-center text-sm text-[#24D2B5] mt-1.5 font-medium">{v.progress}% complete</p>
            </div>

            <div className="flex justify-between text-sm">
              <div>
                <p className="text-slate-500 text-sm">Actual departure</p>
                <p className="text-white font-medium text-base">{v.depDate}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-sm">Reported ETA</p>
                <p className="text-white font-medium text-base">{v.eta}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
