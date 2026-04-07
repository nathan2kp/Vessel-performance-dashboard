interface ScoreIndicatorProps {
  label: string
  rawScore: string
  value: number // Percentage from 0-100
}

const segments = [
  { color: "bg-red-600", label: "Poor" },
  { color: "bg-amber-500", label: "Below Avg" },
  { color: "bg-slate-500", label: "Average" },
  { color: "bg-teal-500", label: "Good" },
  { color: "bg-[#24D2B5]", label: "Excellent" },
]

export function ScoreIndicator({ label, rawScore, value }: ScoreIndicatorProps) {
  const indicatorColor =
    value <= 20 ? "bg-red-600" : value <= 40 ? "bg-amber-500" : value <= 60 ? "bg-slate-400" : value <= 80 ? "bg-teal-500" : "bg-[#24D2B5]"

  const isExcellent = value > 80

  return (
    <div className="flex items-center gap-4 py-2.5 group">
      <div className="w-1/3 text-white text-base font-medium">{label}</div>
      <div className="w-16 bg-slate-700/50 p-1.5 rounded-md text-center text-[#00FFD1] font-bold text-base border border-slate-600/30">
        {rawScore}
      </div>
      <div className="relative flex-1 h-3 rounded-full overflow-hidden flex gap-0.5">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`flex-1 ${seg.color} h-full ${i === 0 ? "rounded-l-full" : ""} ${i === 4 ? "rounded-r-full" : ""} opacity-80`}
          />
        ))}
        {/* Indicator */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${indicatorColor} border-2 border-white transition-all duration-300 ${isExcellent ? "shadow-[0_0_8px_rgba(36,210,181,0.5)]" : "shadow-md"}`}
          style={{ left: `calc(${value}% - 8px)` }}
        />
      </div>
    </div>
  )
}
