import { useParams, Link } from "wouter";
import { 
  useGetVehicle, 
  useUpdateVehicle, 
  useListIncidents, 
  useListAlerts,
  useDeleteVehicle,
  getGetVehicleQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge, ScoreDisplay } from "@/components/ui/shared";
import { ArrowLeft, MapPin, Calendar, Clock, Activity, ShieldAlert, BellRing, Trash2, Crosshair, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import * as Dialog from "@radix-ui/react-dialog";

export function VehicleDetail() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();

  const { data: vehicle, isLoading, error } = useGetVehicle(id, {
    query: { enabled: !!id, queryKey: getGetVehicleQueryKey(id) }
  });

  const { data: incidents } = useListIncidents({ vehicleId: id });
  const { data: alerts } = useListAlerts({ vehicleId: id });
  
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();

  if (!id) return <ErrorState message="Invalid vehicle ID" />;
  if (isLoading) return <LoadingScreen />;
  if (error || !vehicle) return <ErrorState message="Vehicle not found or connection failed." />;

  const handleStatusChange = (newStatus: any) => {
    updateMutation.mutate({ id, data: { status: newStatus } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetVehicleQueryKey(id), data);
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/vehicles" className="p-2 border rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
          Registry / {vehicle.licensePlate}
        </div>
      </div>

      <PageHeader 
        title={vehicle.name} 
        description={`Registered ${format(new Date(vehicle.createdAt), 'MMM dd, yyyy')}`}
      >
        <div className="flex items-center gap-3">
          <select 
            value={vehicle.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updateMutation.isPending}
            className="text-sm border rounded bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-ring font-mono uppercase tracking-wider"
          >
            <option value="safe">Force Safe</option>
            <option value="alert">Force Alert</option>
            <option value="emergency">Force Emergency</option>
            <option value="offline">Force Offline</option>
          </select>
          
          <DeleteVehicleDialog id={id} name={vehicle.name} />
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          {/* Identity Card */}
          <div className="bg-card border rounded-md shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-secondary/30 flex items-center gap-2">
              <Crosshair size={16} className="text-accent" />
              <h2 className="font-semibold text-sm uppercase tracking-wider">Telemetry & Identity</h2>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase">Current Status</p>
                  <div className="mt-1"><StatusBadge status={vehicle.status} pulse={vehicle.status === 'emergency'} /></div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-muted-foreground uppercase">Threat Score</p>
                  <ScoreDisplay score={vehicle.threatLevel} className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Make / Model</p>
                  <p className="text-sm font-medium">{vehicle.make} {vehicle.model}</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Year</p>
                  <p className="text-sm font-medium">{vehicle.year}</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">License Plate</p>
                  <span className="inline-block px-2 py-1 bg-secondary rounded border font-mono text-xs">{vehicle.licensePlate}</span>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Assigned Driver</p>
                  {vehicle.driverId ? (
                    <Link href={`/drivers/${vehicle.driverId}`} className="text-sm text-accent hover:underline font-medium">Driver #{vehicle.driverId}</Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <MapPin size={14} className="text-muted-foreground" />
                  <span className="font-mono">{vehicle.locationLat?.toFixed(6) ?? 'N/A'}, {vehicle.locationLng?.toFixed(6) ?? 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock size={14} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Last seen: {vehicle.lastSeenAt ? format(new Date(vehicle.lastSeenAt), 'MMM dd, HH:mm:ss') : 'Never'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Active Alerts */}
          <div className="bg-card border border-amber/20 rounded-md shadow-sm overflow-hidden">
            <div className="p-4 border-b border-amber/20 bg-amber/5 flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wider flex items-center gap-2 text-amber">
                <BellRing size={16} /> Active Alerts
              </h2>
              <span className="text-xs font-mono bg-amber/20 text-amber px-2 py-0.5 rounded">{alerts?.length || 0}</span>
            </div>
            <div className="divide-y divide-border">
              {alerts?.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No active alerts for this vehicle.</div>
              ) : alerts?.map(alert => (
                <div key={alert.id} className="p-4 flex gap-4">
                  <div className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${alert.severity === 'critical' ? 'bg-destructive animate-pulse' : 'bg-amber'}`} />
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <span className="text-[10px] font-mono text-muted-foreground">{format(new Date(alert.createdAt), 'HH:mm')}</span>
                    </div>
                    <div className="flex gap-2">
                      <StatusBadge status={alert.severity} className="text-[10px] px-1.5 py-0" />
                      <span className="text-xs font-mono text-muted-foreground uppercase">{alert.type.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Incident History */}
          <div className="bg-card border rounded-md shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-secondary/30 flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={16} /> Incident History
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/20 text-muted-foreground font-mono text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 font-medium">ID</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {incidents?.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No incident history.</td></tr>
                  ) : incidents?.map(incident => (
                    <tr key={incident.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-mono text-xs">INC-{incident.id.toString().padStart(4, '0')}</td>
                      <td className="px-4 py-3 text-sm capitalize">{incident.type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3"><StatusBadge status={incident.status} /></td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{format(new Date(incident.startedAt), 'MMM dd, yyyy')}</td>
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
    </div>
  );
}

function DeleteVehicleDialog({ id, name }: { id: number, name: string }) {
  const deleteMutation = useDeleteVehicle();
  const queryClient = useQueryClient();

  const handleDelete = () => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        window.location.href = '/vehicles';
      }
    });
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="p-2 border border-destructive/20 text-destructive rounded hover:bg-destructive/10 transition-colors" title="Decommission Vehicle">
          <Trash2 size={16} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-destructive/20 bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2 text-destructive">
            <AlertTriangle size={20} /> Decommission {name}
          </Dialog.Title>
          <p className="text-sm text-foreground">
            Are you sure you want to decommission this vehicle? This action will remove it from active tracking and cannot be undone. Associated incident records will be retained.
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm font-medium border rounded hover:bg-secondary transition-colors">Cancel</button>
            </Dialog.Close>
            <button 
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
            >
              {deleteMutation.isPending ? "Processing..." : "Confirm Decommission"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
