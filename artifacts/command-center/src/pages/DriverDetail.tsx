import { useParams, Link } from "wouter";
import { useGetDriver, useListIncidents, getGetDriverQueryKey } from "@workspace/api-client-react";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge, ScoreDisplay } from "@/components/ui/shared";
import { ArrowLeft, Phone, Mail, Calendar, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

export function DriverDetail() {
  const params = useParams();
  const id = Number(params.id);

  const { data: driver, isLoading, error } = useGetDriver(id, {
    query: { enabled: !!id, queryKey: getGetDriverQueryKey(id) }
  });

  const { data: incidents } = useListIncidents({ driverId: id });

  if (!id) return <ErrorState message="Invalid driver ID" />;
  if (isLoading) return <LoadingScreen />;
  if (error || !driver) return <ErrorState message="Driver profile not found." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/drivers" className="p-2 border rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
          Personnel / {driver.name}
        </div>
      </div>

      <PageHeader 
        title={driver.name} 
        description={`Registered ${format(new Date(driver.createdAt), 'MMMM dd, yyyy')}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border rounded-md shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-secondary/30 flex items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg">
              {driver.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wider">{driver.name}</h2>
              <p className="text-xs font-mono text-muted-foreground">Driver Profile</p>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase mb-2">Current Status</p>
              <StatusBadge status={driver.status} />
            </div>

            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase mb-2">Behavior Score</p>
              <ScoreDisplay score={driver.behaviorScore} />
            </div>

            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Phone size={14} className="text-muted-foreground" />
                <span className="font-mono">{driver.phone}</span>
              </div>
              {driver.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail size={14} className="text-muted-foreground" />
                  <span className="text-sm">{driver.email}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">Registered {format(new Date(driver.createdAt), 'MMM dd, yyyy')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border rounded-md shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-secondary/30 flex items-center gap-2">
            <ShieldAlert size={16} />
            <h2 className="font-semibold text-sm uppercase tracking-wider">Incident History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/20 text-muted-foreground font-mono text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-4 py-2 font-medium">Vehicle</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Severity</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {incidents?.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No incidents on record for this driver.</td></tr>
                ) : incidents?.map(incident => (
                  <tr key={incident.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs">INC-{incident.id.toString().padStart(4, '0')}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/vehicles/${incident.vehicleId}`} className="text-accent hover:underline">
                        VEH-{incident.vehicleId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm capitalize">{incident.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3"><StatusBadge status={incident.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge status={incident.status} /></td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{format(new Date(incident.startedAt), 'MM/dd/yyyy')}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/incidents/${incident.id}`} className="text-xs font-mono uppercase text-accent hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
