"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"

interface MachineryTabProps {
  selectedVessel: string
  timePeriod: string
}

export function MachineryTab({ selectedVessel, timePeriod }: MachineryTabProps) {
  const [selectedEngine, setSelectedEngine] = useState("ME")

  // Machinery summary data
  const machinerySummary = [
    {
      engine: "ME",
      engineMaker: "MAN B&W",
      engineType: "6S60ME-C8.5",
      mcr: 13560,
      rpmAtMcr: 102,
      runningHours: 5320,
    },
    {
      engine: "AE1",
      engineMaker: "Caterpillar",
      engineType: "3516C",
      mcr: 2250,
      rpmAtMcr: 1800,
      runningHours: 4320,
    },
    {
      engine: "AE2",
      engineMaker: "Caterpillar",
      engineType: "3516C",
      mcr: 2250,
      rpmAtMcr: 1800,
      runningHours: 4100,
    },
    {
      engine: "AE3",
      engineMaker: "Caterpillar",
      engineType: "3516C",
      mcr: 2250,
      rpmAtMcr: 1800,
      runningHours: 3980,
    },
    {
      engine: "AE4",
      engineMaker: "Caterpillar",
      engineType: "3516C",
      mcr: 2250,
      rpmAtMcr: 1800,
      runningHours: 3850,
    },
  ]

  // SFOC baseline curve data
  const sfocBaselineData = Array.from({ length: 15 }, (_, i) => {
    const mcr = 30 + (i * 70) / 14
    const sfoc = 180 - 0.9 * mcr + 0.01 * Math.pow(mcr, 2)
    return { mcr, sfoc }
  })

  // Generate reported SFOC points
  const generateReportedSfoc = (engine: string) => {
    const seed = engine.charCodeAt(0) * 42
    const points = []
    for (let i = 0; i < 15; i++) {
      const mcr = 30 + Math.random() * 70
      const sfoc = 180 - 0.9 * mcr + 0.01 * Math.pow(mcr, 2) + (Math.random() - 0.5) * 4
      points.push({ mcr, sfoc })
    }
    return points.sort((a, b) => a.mcr - b.mcr)
  }

  const reportedSfocData = generateReportedSfoc(selectedEngine)

  // Lube oil consumption data - now includes ME Cylinder Oil
  const lubeOilData = [
    { month: "Jan", me: 82, ae: 41, meCylOil: 125 },
    { month: "Feb", me: 85, ae: 44, meCylOil: 130 },
    { month: "Mar", me: 88, ae: 47, meCylOil: 135 },
    { month: "Apr", me: 83, ae: 42, meCylOil: 128 },
    { month: "May", me: 87, ae: 46, meCylOil: 132 },
    { month: "Jun", me: 84, ae: 43, meCylOil: 129 },
    { month: "Jul", me: 86, ae: 45, meCylOil: 131 },
    { month: "Aug", me: 89, ae: 48, meCylOil: 136 },
    { month: "Sep", me: 85, ae: 44, meCylOil: 130 },
    { month: "Oct", me: 87, ae: 46, meCylOil: 133 },
    { month: "Nov", me: 83, ae: 42, meCylOil: 127 },
    { month: "Dec", me: 86, ae: 45, meCylOil: 131 },
  ]

  return (
    <div className="space-y-6">
      {/* Machinery Summary */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white mb-4">Machinery Summary</h3>
        <Card className="card-maritime">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-white p-3">Engine</th>
                    <th className="text-left text-white p-3">Engine Maker</th>
                    <th className="text-left text-white p-3">Engine Type</th>
                    <th className="text-left text-white p-3">MCR (kW)</th>
                    <th className="text-left text-white p-3">RPM@MCR</th>
                    <th className="text-left text-white p-3">Running Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {machinerySummary.map((item, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-[#071318]" : "bg-[#0A1B26]"}>
                      <td className="text-white p-3 font-semibold">{item.engine}</td>
                      <td className="text-white p-3">{item.engineMaker}</td>
                      <td className="text-white p-3">{item.engineType}</td>
                      <td className="text-[#00FFD1] p-3 font-bold">{item.mcr.toLocaleString()}</td>
                      <td className="text-[#00FFD1] p-3 font-bold">{item.rpmAtMcr}</td>
                      <td className="text-[#00FFD1] p-3 font-bold">{item.runningHours.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Engine SFOC */}
      <Card className="card-maritime">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            Engine SFOC
            <Select value={selectedEngine} onValueChange={setSelectedEngine}>
              <SelectTrigger className="w-32 bg-[#051219] border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0A1B26] border-slate-600">
                <SelectItem value="ME">ME</SelectItem>
                <SelectItem value="AE1">AE1</SelectItem>
                <SelectItem value="AE2">AE2</SelectItem>
                <SelectItem value="AE3">AE3</SelectItem>
                <SelectItem value="AE4">AE4</SelectItem>
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4f" />
              <XAxis
                type="number"
                dataKey="mcr"
                domain={[30, 100]}
                stroke="white"
                label={{
                  value: "MCR (%)",
                  position: "insideBottom",
                  offset: -5,
                  style: { textAnchor: "middle", fill: "white" },
                }}
              />
              <YAxis
                stroke="white"
                label={{
                  value: "SFOC (g/kWh)",
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
              <Line
                data={sfocBaselineData}
                type="monotone"
                dataKey="sfoc"
                stroke="#00FFFF"
                strokeWidth={3}
                name="Reference SFOC Curve"
                dot={false}
              />
              <Line
                data={reportedSfocData}
                type="monotone"
                dataKey="sfoc"
                stroke="#0000FF"
                strokeWidth={0}
                name={`${selectedEngine} Reported SFOC`}
                dot={{ fill: "#0000FF", strokeWidth: 2, r: 4 }}
                line={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Lube Oil Consumption Trend */}
      <Card className="card-maritime">
        <CardHeader>
          <CardTitle className="text-white text-2xl font-bold">Lube Oil Consumption Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lubeOilData} >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4f" />
              <XAxis
                dataKey="month"
                stroke="white"
                label={{
                  value: "Month",
                  position: "insideBottom",
                  offset: -5,
                  style: { textAnchor: "middle", fill: "white" },
                }}
              />
              <YAxis
                stroke="white"
                domain={[0, 500]}
                label={{
                  value: "Consumption (L/day)",
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
              <Line type="monotone" dataKey="me" stroke="#4682B4" strokeWidth={2} name="ME Lube Oil (L/day)" />
              <Line type="monotone" dataKey="ae" stroke="#FFA500" strokeWidth={2} name="AE Lube Oil (L/day)" />
              <Line type="monotone" dataKey="meCylOil" stroke="#32CD32" strokeWidth={2} name="ME Cyl Oil (L/day)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
