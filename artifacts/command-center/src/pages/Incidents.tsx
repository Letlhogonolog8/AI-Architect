import { useState } from "react";
import { 
  useListIncidents, 
  useCreateIncident, 
  useListVehicles,
  getListIncidentsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge } from "@/components/ui/shared";
import { Link } from "wouter";
import { Plus, Search, ShieldAlert, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { IncidentInputType, IncidentInputSeverity } from "@workspace/api-client-react";

const formSchema = z.object({
  vehicleId: z.coerce.number().min(1, "Vehicle is required"),
  type: z.enum(["hijacking", "theft_attempt", "coercion", "kidnapping", "suspicious_activity", "sos_triggered"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().optional(),
  aiConfidence: z.coerce.number().min(0).max(1).optional(),
  latitude: z.coerce.number().optional().or(z.literal("")),
  longitude: z.coerce.number().optional().or(z.literal("")),
});

export function Incidents() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");

  const params: any = {};
  if (statusFilter) params.status = statusFilter;
  if (severityFilter) params.severity = severityFilter;

  const { data: incidents, isLoading, error } = useListIncidents(Object.keys(params).length > 0 ? params : undefined);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorState message="Failed to load incident registry." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Incident Registry" 
        description="Monitor all security events and threat responses"
      >
        <CreateIncidentDialog />
      </PageHeader>

      <div className="bg-card border rounded-md shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-secondary/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search incidents..." 
              className="w-full pl-9 pr-4 py-2 bg-background border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <FilterButton active={statusFilter === ""} onClick={() => setStatusFilter("")}>All</FilterButton>
              <FilterButton active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Active</FilterButton>
              <FilterButton active={statusFilter === "investigating"} onClick={() => setStatusFilter("investigating")}>Investigating</FilterButton>
              <FilterButton active={statusFilter === "resolved"} onClick={() => setStatusFilter("resolved")}>Resolved</FilterButton>
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
                <th className="px-6 py-3 font-medium">ID</th>
                <th className="px-6 py-3 font-medium">Vehicle</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Severity</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">AI Conf.</th>
                <th className="px-6 py-3 font-medium">Elapsed</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {incidents?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No incidents found matching criteria.
                  </td>
                </tr>
              ) : incidents?.map((incident) => (
                <tr key={incident.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs font-bold">
                    <Link href={`/incidents/${incident.id}`} className="hover:underline flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-destructive" />
                      INC-{incident.id.toString().padStart(4, '0')}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/vehicles/${incident.vehicleId}`} className="text-accent hover:underline font-mono text-xs">
                      VEH-{incident.vehicleId}
                    </Link>
                  </td>
                  <td className="px-6 py-4 capitalize text-sm">{incident.type.replace(/_/g, ' ')}</td>
                  <td className="px-6 py-4"><StatusBadge status={incident.severity} pulse={incident.severity === 'critical'} /></td>
                  <td className="px-6 py-4"><StatusBadge status={incident.status} /></td>
                  <td className="px-6 py-4 text-right font-mono text-xs">
                    <span className={incident.aiConfidence >= 0.8 ? "text-green" : incident.aiConfidence >= 0.5 ? "text-amber" : "text-muted-foreground"}>
                      {(incident.aiConfidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(incident.startedAt), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      href={`/incidents/${incident.id}`}
                      className="text-xs font-mono uppercase tracking-wider text-accent hover:text-accent/80 font-semibold px-3 py-1.5 border border-accent/20 rounded hover:bg-accent/5 transition-colors"
                    >
                      Review
                    </Link>
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

function CreateIncidentDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createMutation = useCreateIncident();
  const { data: vehicles } = useListVehicles();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
      vehicleId: 0,
      type: "suspicious_activity",
      severity: "medium",
      description: "",
      aiConfidence: 0.5
    }
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    const payload: any = { 
      vehicleId: data.vehicleId,
      type: data.type,
      severity: data.severity,
      description: data.description || null,
      aiConfidence: data.aiConfidence || 0.5,
      latitude: data.latitude ? Number(data.latitude) : null,
      longitude: data.longitude ? Number(data.longitude) : null
    };
    createMutation.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListIncidentsQueryKey() });
        setOpen(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded text-sm font-medium hover:bg-destructive/90 transition-colors shadow-sm">
          <Plus size={16} /> Report Incident
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 duration-200">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2 border-b pb-4">
            <AlertTriangle size={20} className="text-destructive" /> Report New Incident
          </Dialog.Title>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Vehicle</label>
                <select {...form.register("vehicleId")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none">
                  <option value={0}>Select vehicle...</option>
                  {vehicles?.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>
                  ))}
                </select>
                {form.formState.errors.vehicleId && <p className="text-destructive text-xs">{form.formState.errors.vehicleId.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Incident Type</label>
                <select {...form.register("type")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none text-sm">
                  <option value="suspicious_activity">Suspicious Activity</option>
                  <option value="theft_attempt">Theft Attempt</option>
                  <option value="hijacking">Hijacking</option>
                  <option value="coercion">Coercion</option>
                  <option value="kidnapping">Kidnapping</option>
                  <option value="sos_triggered">SOS Triggered</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Severity</label>
                <select {...form.register("severity")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Description</label>
                <textarea {...form.register("description")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none resize-none" rows={3} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Latitude</label>
                <input type="number" step="any" {...form.register("latitude")} className="w-full p-2 border rounded bg-background font-mono text-xs focus:ring-1 focus:ring-ring outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Longitude</label>
                <input type="number" step="any" {...form.register("longitude")} className="w-full p-2 border rounded bg-background font-mono text-xs focus:ring-1 focus:ring-ring outline-none" />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6 border-t pt-4">
              <Dialog.Close asChild>
                <button type="button" className="px-4 py-2 text-sm font-medium border rounded hover:bg-secondary transition-colors">Cancel</button>
              </Dialog.Close>
              <button 
                type="submit" 
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? "Submitting..." : "Submit Incident"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
