import { useParams, Link, useLocation } from "wouter";
import { 
  useGetIncident, 
  useGetIncidentTimeline, 
  useUpdateIncident,
  getGetIncidentQueryKey,
  getGetIncidentTimelineQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge } from "@/components/ui/shared";
import { ArrowLeft, MapPin, Clock, Activity, ShieldAlert, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { formatDistanceToNow } from "date-fns";

export function IncidentDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const queryClient = useQueryClient();

  const { data: incident, isLoading, error } = useGetIncident(id, {
    query: { enabled: !!id, queryKey: getGetIncidentQueryKey(id) }
  });

  const { data: timeline } = useGetIncidentTimeline(id, {
    query: { enabled: !!id, queryKey: getGetIncidentTimelineQueryKey(id) }
  });

  const updateMutation = useUpdateIncident();

  if (!id) return <ErrorState message="Invalid incident ID" />;
  if (isLoading) return <LoadingScreen />;
  if (error || !incident) return <ErrorState message="Incident not found or connection failed." />;

  const handleStatusChange = (newStatus: any) => {
    updateMutation.mutate({ id, data: { status: newStatus } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetIncidentQueryKey(id), data);
        queryClient.invalidateQueries({ queryKey: getGetIncidentTimelineQueryKey(id) });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/incidents" className="p-2 border rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
          Incident / INC-{incident.id.toString().padStart(4, '0')}
        </div>
      </div>

      <PageHeader 
        title={`INC-${incident.id.toString().padStart(4, '0')}`}
        description={incident.type.replace(/_/g, ' ').toUpperCase()}
      >
        <div className="flex items-center gap-3">
          <select 
            value={incident.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updateMutation.isPending}
            className="text-sm border rounded bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-ring font-mono uppercase tracking-wider"
          >
            <option value="active">Active</option>
            <option value="investigating">Investigating</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          {/* Incident Card */}
          <div className="bg-card border rounded-md shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-destructive/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-destructive" />
                <h2 className="font-semibold text-sm uppercase tracking-wider">Incident Summary</h2>
              </div>
              <StatusBadge status={incident.severity} pulse={incident.severity === 'critical'} />
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Type</p>
                  <p className="text-sm font-medium capitalize">{incident.type.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Status</p>
                  <StatusBadge status={incident.status} />
                </div>
              </div>

              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Vehicle</p>
                <Link href={`/vehicles/${incident.vehicleId}`} className="text-sm text-accent hover:underline font-medium">
                  VEH-{incident.vehicleId}
                </Link>
              </div>

              {incident.driverId && (
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Driver</p>
                  <Link href={`/drivers/${incident.driverId}`} className="text-sm text-accent hover:underline font-medium">
                    Driver #{incident.driverId}
                  </Link>
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-xs font-mono text-muted-foreground uppercase mb-2">AI Confidence</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-secondary h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${incident.aiConfidence >= 0.8 ? 'bg-green' : incident.aiConfidence >= 0.5 ? 'bg-amber' : 'bg-muted-foreground'}`}
                      style={{ width: `${incident.aiConfidence * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm font-bold">{(incident.aiConfidence * 100).toFixed(0)}%</span>
                </div>
              </div>

              {incident.description && (
                <div className="pt-4 border-t">
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-2">Description</p>
                  <p className="text-sm leading-relaxed">{incident.description}</p>
                </div>
              )}

              <div className="pt-4 border-t space-y-3">
                {(incident.latitude && incident.longitude) && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin size={14} className="text-muted-foreground" />
                    <span className="font-mono text-xs">{incident.latitude.toFixed(6)}, {incident.longitude.toFixed(6)}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Clock size={14} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Started {formatDistanceToNow(new Date(incident.startedAt), { addSuffix: true })}</span>
                </div>
                {incident.resolvedAt && (
                  <div className="flex items-center gap-3 text-sm">
                    <Activity size={14} className="text-green" />
                    <span className="text-green">Resolved {format(new Date(incident.resolvedAt), 'MMM dd, HH:mm')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {/* Timeline */}
          <div className="bg-card border rounded-md shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-secondary/30 flex items-center gap-2">
              <TrendingUp size={16} />
              <h2 className="font-semibold text-sm uppercase tracking-wider">Event Timeline</h2>
            </div>
            <div className="p-5">
              {timeline?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No events logged yet.</div>
              ) : (
                <div className="space-y-6 relative">
                  <div className="absolute left-[15px] top-6 bottom-0 w-px bg-border" />
                  {timeline?.map((event, idx) => (
                    <div key={event.id} className="flex gap-4 relative">
                      <div className="shrink-0 mt-1">
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-sm z-10 relative ${
                          event.eventType === 'incident_created' ? 'bg-destructive/10 border-destructive' :
                          event.eventType === 'status_changed' ? 'bg-amber/10 border-amber' :
                          event.eventType === 'alert_triggered' ? 'bg-destructive/10 border-destructive' :
                          'bg-background border-border'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${
                            event.eventType === 'incident_created' ? 'bg-destructive' :
                            event.eventType === 'status_changed' ? 'bg-amber' :
                            event.eventType === 'alert_triggered' ? 'bg-destructive' :
                            'bg-muted-foreground'
                          }`} />
                        </div>
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium leading-tight">{event.description}</p>
                          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                            {format(new Date(event.occurredAt), 'HH:mm:ss')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.occurredAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
