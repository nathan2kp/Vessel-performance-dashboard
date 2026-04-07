"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts"

interface HullTabProps {
  selectedVessel: string
  timePeriod: string
}

export function HullTab({ selectedVessel, timePeriod }: HullTabProps) {
  // Hull KPIs
  const hullKpis = [
    { label: "Last Hull Cleaning Date", value: "2025-01-12" },
    { label: "Days Since Last Cleaning", value: "107" },
    { label: "Added Resistance", value: "24%" },
    { label: "Hull Fouling Score", value: "🟡 Moderate" },
  ]

  // Hull performance data - updated to use compact month abbreviations
  const hullPerformanceData = [
    { month: "Jan", resistance: 14, benchmark: 15 },
    { month: "Feb", resistance: 12, benchmark: 15 },
    { month: "Mar", resistance: 12, benchmark: 15 },
    { month: "Apr", resistance: 13, benchmark: 15 },
    { month: "May", resistance: 47, benchmark: 15 },
    { month: "Jun", resistance: 45, benchmark: 15 },
    { month: "Jul", resistance: 44, benchmark: 15 },
    { month: "Aug", resistance: 46, benchmark: 15 },
    { month: "Sep", resistance: 28, benchmark: 15 },
    { month: "Oct", resistance: 27, benchmark: 15 },
    { month: "Nov", resistance: 22, benchmark: 15 },
    { month: "Dec", resistance: 19, benchmark: 15 },
    { month: "Jan", resistance: 20, benchmark: 15 },
    { month: "Feb", resistance: 23, benchmark: 15 },
  ]

  // Fuel penalty data - updated to use compact month abbreviations
  const fuelPenaltyData = [
    { month: "Jun", penalty: 1.2 },
    { month: "Jul", penalty: 1.0 },
    { month: "Aug", penalty: 1.0 },
    { month: "Sep", penalty: 1.1 },
    { month: "Oct", penalty: 4.7 },
    { month: "Nov", penalty: 4.5 },
    { month: "Dec", penalty: 4.4 },
    { month: "Jan", penalty: 4.6 },
  ]

  // Declare cleaningHistory variable
  const cleaningHistory = [
    { date: "2023-03-10", location: "Singapore", type: "Full Cleaning", remarks: "Moderate fouling removed" },
    { date: "2023-09-22", location: "Rotterdam", type: "Inspection Only", remarks: "Slight slime layer" },
    { date: "2024-08-26", location: "Zhoushan", type: "DryDock", remarks: "Heavy fouling removed" },
  ]

  return (
    <div className="space-y-6">
      {/* Hull KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {hullKpis.map((kpi, index) => (
          <Card key={index} className="card-maritime">
            <CardContent className="p-4">
              <div className="text-sm text-slate-400 mb-1">{kpi.label}</div>
              <div className="text-xl font-bold text-[#00FFD1]">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Hull Performance Chart */}
      <Card className="card-maritime">
        <CardHeader>
          <CardTitle className="text-white text-2xl font-bold">Hull Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={hullPerformanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4f" />
              <XAxis dataKey="month" stroke="white" angle={-30} textAnchor="end" height={80} />
              <YAxis
                stroke="white"
                domain={[0, 50]}
                label={{
                  value: "Added Resistance (%)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle", fill: "white" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0A1B26",
                  border: "1px solid #475569",
                  color: "white",
                }}
              />
              <Legend />
              <ReferenceLine y={15} stroke="#24D2B5" strokeDasharray="2 2" />
              <ReferenceLine y={25} stroke="#FFA500" strokeDasharray="2 2" />
              <Line type="monotone" dataKey="resistance" stroke="white" strokeWidth={2} name="Performance" />
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="white"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Benchmark"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Hull Cleaning History */}
      <Card className="card-maritime">
        <CardHeader>
          <CardTitle className="text-white text-2xl font-bold">Hull Cleaning & Inspection History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-white p-3">Date</th>
                  <th className="text-left text-white p-3">Location</th>
                  <th className="text-left text-white p-3">Type</th>
                  <th className="text-left text-white p-3">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {cleaningHistory.map((record, index) => (
                  <tr key={index} className={index % 2 === 0 ? "bg-[#071318]" : "bg-[#0A1B26]"}>
                    <td className="text-white p-3">{record.date}</td>
                    <td className="text-white p-3">{record.location}</td>
                    <td className="text-white p-3">{record.type}</td>
                    <td className="text-white p-3">{record.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Fuel Penalty Chart */}
      <Card className="card-maritime">
        <CardHeader>
          <CardTitle className="text-white text-2xl font-bold">Fuel Penalty Due to Hull Fouling</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={fuelPenaltyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4f" />
              <XAxis dataKey="month" stroke="white" angle={-30} textAnchor="end" height={80} />
              <YAxis
                stroke="white"
                domain={[0, 6]}
                label={{
                  value: "Extra Fuel Consumption (MT/day)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle", fill: "white" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0A1B26",
                  border: "1px solid #475569",
                  color: "white",
                }}
              />
              <Bar dataKey="penalty" fill="#00CC99" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
