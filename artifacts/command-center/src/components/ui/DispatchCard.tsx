interface DispatchCardProps {
  unit: string;
  status: "RESPONDING" | "NOTIFIED" | "DELIVERED" | "PENDING ACK";
  eta?: string;
  info?: string;
}

export function DispatchCard({ unit, status, eta, info }: DispatchCardProps) {
  const statusConfig = {
    "RESPONDING": { color: "text-amber border-amber/30 bg-amber/10", dot: "bg-amber" },
    "NOTIFIED": { color: "text-accent border-accent/30 bg-accent/10", dot: "bg-accent" },
    "DELIVERED": { color: "text-green border-green/30 bg-green/10", dot: "bg-green" },
    "PENDING ACK": { color: "text-muted-foreground border-border bg-muted/10", dot: "bg-muted-foreground" }
  };

  const config = statusConfig[status];

  return (
    <div className="bg-card/60 backdrop-blur-md border border-white/[0.06] rounded-xl p-4 transition-all duration-200 hover:border-white/[0.12]">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 mt-1.5 rounded-full ${config.dot} ${status === "RESPONDING" ? "animate-pulse" : ""}`} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground mb-1">{unit}</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${config.color}`}>
              {status}
            </span>
            {eta && <span className="text-xs font-mono text-muted-foreground">ETA {eta}</span>}
            {info && <span className="text-xs font-mono text-muted-foreground">{info}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}