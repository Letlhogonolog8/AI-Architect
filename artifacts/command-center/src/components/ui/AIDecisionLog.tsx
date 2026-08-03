import { useEffect, useState } from "react";

const LOG_ENTRIES = [
  { type: "THREAT ENGINE", message: "Hijack pattern confidence: 97.4% — threshold exceeded", color: "text-destructive" },
  { type: "BEHAVIOUR AI", message: "Driver stress index elevated — 142bpm detected", color: "text-amber" },
  { type: "IDENTITY AI", message: "Continuous identity mismatch — vehicle 3", color: "text-destructive" },
  { type: "WEAPON DETECT", message: "Object classification: possible firearm — cabin cam", color: "text-destructive" },
  { type: "SAFECORRIDOR", message: "Optimal escape route calculated: 3.2km via N1", color: "text-accent" },
  { type: "DISPATCH", message: "SAPS notification sent — unit 4-Lima responding", color: "text-accent" },
  { type: "EVIDENCE", message: "Video stream encrypted: AES-256-GCM sealed", color: "text-green" },
  { type: "RECOVERY MESH", message: "Engine immobilization armed — awaiting command", color: "text-green" },
  { type: "COMMS", message: "Silent SOS activated — driver biometric trigger", color: "text-accent" },
  { type: "LEARNING", message: "Threat model updated: +0.3% accuracy improvement", color: "text-green" }
];

export function AIDecisionLog() {
  const [logs, setLogs] = useState<Array<{ timestamp: string; entry: typeof LOG_ENTRIES[0] }>>([]);

  useEffect(() => {
    // Initialize with 3 entries
    const now = new Date();
    setLogs([
      { timestamp: new Date(now.getTime() - 8000).toLocaleTimeString('en-US', { hour12: false }), entry: LOG_ENTRIES[0] },
      { timestamp: new Date(now.getTime() - 5000).toLocaleTimeString('en-US', { hour12: false }), entry: LOG_ENTRIES[1] },
      { timestamp: new Date(now.getTime() - 2000).toLocaleTimeString('en-US', { hour12: false }), entry: LOG_ENTRIES[2] }
    ]);

    let index = 3;
    const interval = setInterval(() => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      const entry = LOG_ENTRIES[index % LOG_ENTRIES.length];
      setLogs(prev => [{ timestamp, entry }, ...prev].slice(0, 8));
      index++;
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card/60 backdrop-blur-md border border-white/[0.06] rounded-xl overflow-hidden shadow-2xl">
      <div className="px-5 py-3 border-b border-white/[0.06] bg-gradient-to-r from-blue-950/50 to-transparent flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">AI Decision Log</h3>
        <div className="w-2 h-4 bg-green animate-pulse" />
      </div>
      <div className="p-5 bg-[#030508] font-mono text-xs max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-accent/20 scrollbar-track-transparent">
        {logs.map((log, idx) => (
          <div key={idx} className="mb-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="text-green/70">[{log.timestamp}]</span>{' '}
            <span className={log.entry.color}>[ {log.entry.type}]</span>{' '}
            <span className="text-green/90">{log.entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}