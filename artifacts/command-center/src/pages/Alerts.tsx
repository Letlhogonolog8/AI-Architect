import { useState } from "react";
import { useListAlerts, useAcknowledgeAlert, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge } from "@/components/ui/shared";
import { Link } from "wouter";
import { Search, BellRing, Check } from "lucide-react";
import { format } from "date-fns";
import { formatDistanceToNow } from "date-fns";

export function Alerts() {
  const [acknowledgedFilter, setAcknowledgedFilter] = useState<boolean | undefined>(false);
  const [severityFilter, setSeverityFilter] = useState<string>("");

  const params: any = {};
  if (acknowledgedFilter !== undefined) params.acknowledged = acknowledgedFilter;
  if (severityFilter) params.severity = severityFilter;

  const { data: alerts, isLoading, error } = useListAlerts(Object.keys(params).length > 0 ? params : undefined);
  const queryClient = useQueryClient();
  const acknowledgeMutation = useAcknowledgeAlert();

  const handleAcknowledge = (id: number) => {
    acknowledgeMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey(params) });
      }
    });
  };

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorState message="Failed to load alert feed." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Active Alerts" 
        description="Real-time threat notifications and system warnings"
      />

      <div className="bg-card border rounded-md shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-secondary/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search alerts..." 
              className="w-full pl-9 pr-4 py-2 bg-background border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <FilterButton active={acknowledgedFilter === false} onClick={() => setAcknowledgedFilter(false)}>Unacknowledged</FilterButton>
              <FilterButton active={acknowledgedFilter === true} onClick={() => setAcknowledgedFilter(true)}>Acknowledged</FilterButton>
              <FilterButton active={acknowledgedFilter === undefined} onClick={() => setAcknowledgedFilter(undefined)}>All</FilterButton>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-1">
              <FilterButton active={severityFilter === ""} onClick={() => setSeverityFilter("")}>All Severity</FilterButton>
              <FilterButton active={severityFilter === "critical"} onClick={() => setSeverityFilter("critical")}>Critical</FilterButton>
              <FilterButton active={severityFilter === "high"} onClick={() => setSeverityFilter("high")}>High</FilterButton>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/40 text-muted-foreground font-mono text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">Alert</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Vehicle</th>
                <th className="px-6 py-3 font-medium">Severity</th>
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {alerts?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    <BellRing className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No alerts found matching criteria.
                  </td>
                </tr>
              ) : alerts?.map((alert) => (
                <tr key={alert.id} className={`hover:bg-muted/50 transition-colors ${!alert.acknowledgedAt ? 'bg-destructive/5' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${!alert.acknowledgedAt ? (alert.severity === 'critical' ? 'bg-destructive animate-pulse' : 'bg-amber animate-pulse') : 'bg-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-sm leading-tight">{alert.message}</p>
                        {alert.incidentId && (
                          <Link href={`/incidents/${alert.incidentId}`} className="text-xs text-accent hover:underline font-mono mt-1 inline-block">
                            INC-{alert.incidentId.toString().padStart(4, '0')}
                          </Link>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono uppercase text-muted-foreground">{alert.type.replace(/_/g, ' ')}</td>
                  <td className="px-6 py-4">
                    <Link href={`/vehicles/${alert.vehicleId}`} className="text-accent hover:underline font-mono text-xs">
                      VEH-{alert.vehicleId}
                    </Link>
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={alert.severity} pulse={alert.severity === 'critical' && !alert.acknowledgedAt} /></td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono">{format(new Date(alert.createdAt), 'MM/dd HH:mm')}</span>
                      <span className="text-[10px]">{formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {alert.acknowledgedAt ? (
                      <div className="flex items-center gap-2 text-green">
                        <Check size={14} />
                        <span className="text-xs font-mono">ACK</span>
                      </div>
                    ) : (
                      <span className="text-xs font-mono uppercase tracking-wider text-destructive">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!alert.acknowledgedAt && (
                      <button 
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={acknowledgeMutation.isPending}
                        className="text-xs font-mono uppercase tracking-wider text-accent hover:text-accent/80 font-semibold px-3 py-1.5 border border-accent/20 rounded hover:bg-accent/5 transition-colors disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
