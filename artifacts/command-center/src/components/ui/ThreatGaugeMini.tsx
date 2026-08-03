interface ThreatGaugeMiniProps {
  score: number;
  size?: number;
}

export function ThreatGaugeMini({ score, size = 80 }: ThreatGaugeMiniProps) {
  const radius = (size / 2) - 8;
  const circumference = Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = "rgba(34, 197, 94, 1)"; // green
  if (score >= 40) color = "rgba(245, 158, 11, 1)"; // amber
  if (score >= 70) color = "rgba(239, 68, 68, 1)"; // red

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="6"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold font-mono" style={{ color }}>{Math.round(score)}</span>
        <span className="text-[8px] font-mono text-muted-foreground uppercase">/100</span>
      </div>
    </div>
  );
}