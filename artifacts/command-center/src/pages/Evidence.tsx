import { useState } from "react";
import { useListEvidence } from "@workspace/api-client-react";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge } from "@/components/ui/shared";
import { Link } from "wouter";
import { Search, Database, FileVideo, FileAudio, MapPin, Activity, Brain, FileText } from "lucide-react";
import { format } from "date-fns";

export function Evidence() {
  const [typeFilter, setTypeFilter] = useState<string>("");
  
  const params: any = {};
  if (typeFilter) params.type = typeFilter;

  const { data: evidence, isLoading, error } = useListEvidence(Object.keys(params).length > 0 ? params : undefined);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorState message="Failed to load evidence vault." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Evidence Vault" 
        description="Repository of forensic data and AI-generated insights"
      />

      <div className="bg-card border rounded-md shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-secondary/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search evidence..." 
              className="w-full pl-9 pr-4 py-2 bg-background border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
          
          <div className="flex items-center gap-1">
            <FilterButton active={typeFilter === ""} onClick={() => setTypeFilter("")}>All Types</FilterButton>
            <FilterButton active={typeFilter === "video"} onClick={() => setTypeFilter("video")}>Video</FilterButton>
            <FilterButton active={typeFilter === "audio"} onClick={() => setTypeFilter("audio")}>Audio</FilterButton>
            <FilterButton active={typeFilter === "gps_track"} onClick={() => setTypeFilter("gps_track")}>GPS</FilterButton>
            <FilterButton active={typeFilter === "sensor_log"} onClick={() => setTypeFilter("sensor_log")}>Sensor</FilterButton>
            <FilterButton active={typeFilter === "ai_analysis"} onClick={() => setTypeFilter("ai_analysis")}>AI Analysis</FilterButton>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
          {evidence?.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No evidence items found matching criteria.</p>
            </div>
          ) : evidence?.map((item) => (
            <div key={item.id} className="bg-background border rounded-md overflow-hidden shadow-sm hover:shadow transition-shadow group">
              <div className="p-4 border-b bg-secondary/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.type === 'video' && <FileVideo size={16} className="text-accent" />}
                  {item.type === 'audio' && <FileAudio size={16} className="text-accent" />}
                  {item.type === 'gps_track' && <MapPin size={16} className="text-accent" />}
                  {item.type === 'sensor_log' && <Activity size={16} className="text-accent" />}
                  {item.type === 'ai_analysis' && <Brain size={16} className="text-accent" />}
                  <span className="text-xs font-mono uppercase tracking-wider">{item.type.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">EV-{item.id}</span>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Filename</p>
                  <p className="text-sm font-medium truncate" title={item.filename}>{item.filename}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="font-mono text-muted-foreground uppercase mb-1">Incident</p>
                    <Link href={`/incidents/${item.incidentId}`} className="text-accent hover:underline font-mono">
                      INC-{item.incidentId.toString().padStart(4, '0')}
                    </Link>
                  </div>
                  <div>
                    <p className="font-mono text-muted-foreground uppercase mb-1">Vehicle</p>
                    <Link href={`/vehicles/${item.vehicleId}`} className="text-accent hover:underline font-mono">
                      VEH-{item.vehicleId}
                    </Link>
                  </div>
                </div>

                {item.sizeBytes && (
                  <div>
                    <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Size</p>
                    <p className="text-xs font-mono">{(item.sizeBytes / 1024).toFixed(2)} KB</p>
                  </div>
                )}

                {item.aiSummary && (
                  <div className="pt-3 border-t">
                    <p className="text-xs font-mono text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
                      <Brain size={12} />
                      AI Summary
                    </p>
                    <p className="text-xs leading-relaxed line-clamp-3">{item.aiSummary}</p>
                  </div>
                )}

                <div className="pt-3 border-t">
                  <p className="text-[10px] font-mono text-muted-foreground">
                    Captured {format(new Date(item.capturedAt), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>

                {item.url && (
                  <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block w-full text-center text-xs font-mono uppercase tracking-wider text-accent hover:text-accent/80 font-semibold px-3 py-2 border border-accent/20 rounded hover:bg-accent/5 transition-colors"
                  >
                    Access File
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterButton({ active, children, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded border transition-colors ${
        active 
          ? "bg-foreground text-background border-foreground" 
          : "bg-background text-muted-foreground hover:bg-secondary border-border"
      }`}
    >
      {children}
    </button>
  );
}
