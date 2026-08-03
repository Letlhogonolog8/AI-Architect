import { useEffect, useState } from "react";

interface CameraCardProps {
  name: string;
  detection: string;
  confidence: number;
  status: "SECURE" | "ANOMALY" | "THREAT" | "RECORDING";
}

export function CameraCard({ name, detection, confidence, status }: CameraCardProps) {
  const [timestamp, setTimestamp] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimestamp(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const statusColors = {
    SECURE: "text-green border-green/30 bg-green/10",
    ANOMALY: "text-amber border-amber/30 bg-amber/10",
    THREAT: "text-destructive border-destructive/30 bg-destructive/10",
    RECORDING: "text-accent border-accent/30 bg-accent/10"
  };

  return (
    <div className="bg-card/60 backdrop-blur-md border border-white/[0.06] rounded-xl overflow-hidden shadow-2xl transition-all duration-200">
      {/* Header */}
      <div className="px-4 py-2 border-b border-white/[0.06] bg-gradient-to-r from-blue-950/50 to-transparent flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-foreground/90">{name}</span>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-[10px] font-mono text-destructive font-bold">REC</span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {timestamp.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>
      </div>

      {/* Camera Feed Simulation */}
      <div className="relative aspect-video bg-gradient-to-br from-[#050810] to-[#0a1020] overflow-hidden">
        {/* Scanline effect */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
          }}
        />
        
        {/* Crosshair */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 border border-accent/30">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-2 bg-accent/50" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-2 bg-accent/50" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-px w-2 bg-accent/50" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-px w-2 bg-accent/50" />
        </div>

        {/* Corner markers */}
        <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-accent/40" />
        <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-accent/40" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-accent/40" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-accent/40" />

        {/* Timestamp overlay */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 backdrop-blur-sm border border-white/10 rounded text-[9px] font-mono text-white/70">
          {timestamp.toISOString().split('T')[0]} {timestamp.toLocaleTimeString('en-US', { hour12: false })}
        </div>
      </div>

      {/* AI Detection Bar */}
      <div className="px-4 py-3 bg-sidebar/50 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground/80">{detection}</span>
          <span className="text-xs font-mono font-bold text-accent">{confidence.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-sidebar rounded-full overflow-hidden">
            <div 
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${statusColors[status]}`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}