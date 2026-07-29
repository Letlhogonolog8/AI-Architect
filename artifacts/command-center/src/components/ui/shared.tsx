import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
  pulse?: boolean;
}

export function StatusBadge({ status, className, pulse }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  
  let colorClass = "bg-muted text-muted-foreground border-muted-border";
  let dotClass = "bg-muted-foreground";

  if (["safe", "active", "resolved"].includes(normalized)) {
    colorClass = "bg-green/10 text-green border-green/20";
    dotClass = "bg-green";
  } else if (["alert", "investigating", "medium", "suspicious_activity"].includes(normalized)) {
    colorClass = "bg-amber/10 text-amber border-amber/20";
    dotClass = "bg-amber";
  } else if (["emergency", "escalated", "high", "critical", "sos_triggered", "kidnapping", "hijacking"].includes(normalized)) {
    colorClass = "bg-destructive/10 text-destructive border-destructive/20";
    dotClass = "bg-destructive";
  } else if (["offline", "inactive", "suspended"].includes(normalized)) {
    colorClass = "bg-secondary text-secondary-foreground border-border";
    dotClass = "bg-secondary-foreground/50";
  }

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-medium border uppercase tracking-wider",
      colorClass,
      className
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dotClass, pulse && "animate-pulse")} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ScoreDisplay({ score, className }: { score: number; className?: string }) {
  let colorClass = "text-green";
  if (score >= 50) colorClass = "text-amber";
  if (score >= 80) colorClass = "text-destructive";

  return (
    <div className={cn("font-mono font-bold flex items-baseline gap-0.5", colorClass, className)}>
      <span className="text-xl">{Math.round(score)}</span>
      <span className="text-[10px] opacity-50">/100</span>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
      <div className="font-mono text-xs uppercase tracking-widest animate-pulse">Initializing Interface...</div>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="p-6 border border-destructive/20 bg-destructive/5 rounded-md flex flex-col items-start gap-4">
      <div className="flex items-center gap-2 text-destructive font-mono text-sm font-bold uppercase tracking-wider">
        <div className="w-2 h-2 bg-destructive rounded-full" />
        System Error
      </div>
      <p className="text-sm text-foreground">{message}</p>
      {retry && (
        <button 
          onClick={retry}
          className="px-4 py-2 bg-background border border-border rounded text-xs font-medium uppercase tracking-wider hover:bg-secondary transition-colors"
        >
          Retry Connection
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 font-mono text-xs uppercase tracking-wider">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
    </div>
  );
}
