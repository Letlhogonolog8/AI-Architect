import { useState } from "react";
import { useListVehicles, useCreateVehicle, getListVehiclesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge, ScoreDisplay } from "@/components/ui/shared";
import { Link } from "wouter";
import { Plus, Search, Car, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().min(1900).max(new Date().getFullYear() + 1),
  licensePlate: z.string().min(1, "License plate is required"),
});

export function Vehicles() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: vehicles, isLoading, error } = useListVehicles(
    statusFilter ? { status: statusFilter as any } : undefined
  );

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorState message="Failed to fetch fleet data." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Fleet Registry" 
        description="Monitor and manage all protected vehicles"
      >
        <CreateVehicleDialog />
      </PageHeader>

      <div className="bg-card border rounded-md shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-secondary/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search vehicles..." 
              className="w-full pl-9 pr-4 py-2 bg-background border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <FilterButton active={statusFilter === ""} onClick={() => setStatusFilter("")}>All</FilterButton>
            <FilterButton active={statusFilter === "safe"} onClick={() => setStatusFilter("safe")}>Safe</FilterButton>
            <FilterButton active={statusFilter === "alert"} onClick={() => setStatusFilter("alert")}>Alert</FilterButton>
            <FilterButton active={statusFilter === "emergency"} onClick={() => setStatusFilter("emergency")}>Emergency</FilterButton>
            <FilterButton active={statusFilter === "offline"} onClick={() => setStatusFilter("offline")}>Offline</FilterButton>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/40 text-muted-foreground font-mono text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">Identifier</th>
                <th className="px-6 py-3 font-medium">Details</th>
                <th className="px-6 py-3 font-medium">License</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Threat Level</th>
                <th className="px-6 py-3 font-medium">Last Seen</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vehicles?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    <Car className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No vehicles found matching criteria.
                  </td>
                </tr>
              ) : vehicles?.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-muted/50 transition-colors group">
                  <td className="px-6 py-4 font-medium">
                    <Link href={`/vehicles/${vehicle.id}`} className="hover:underline focus:outline-none flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary/20" />
                      {vehicle.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">
                    <span className="px-2 py-1 bg-secondary rounded border">{vehicle.licensePlate}</span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={vehicle.status} pulse={vehicle.status === 'emergency'} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ScoreDisplay score={vehicle.threatLevel} className="justify-end" />
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs font-mono">
                    {vehicle.lastSeenAt ? format(new Date(vehicle.lastSeenAt), 'MM/dd HH:mm') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      href={`/vehicles/${vehicle.id}`}
                      className="text-xs font-mono uppercase tracking-wider text-accent hover:text-accent/80 font-semibold px-3 py-1.5 border border-accent/20 rounded hover:bg-accent/5 transition-colors"
                    >
                      Inspect
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
      className={`px-3 py-1 text-xs font-mono uppercase tracking-wider rounded border transition-colors ${
        active 
          ? "bg-foreground text-background border-foreground" 
          : "bg-background text-muted-foreground hover:bg-secondary border-border"
      }`}
    >
      {children}
    </button>
  );
}

function CreateVehicleDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createMutation = useCreateVehicle();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", make: "", model: "", year: new Date().getFullYear(), licensePlate: "" }
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createMutation.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setOpen(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
          <Plus size={16} /> Add Vehicle
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 duration-200">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2 border-b pb-4">
            <Car size={20} className="text-accent" /> Register Vehicle
          </Dialog.Title>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Identifier</label>
                <input {...form.register("name")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none" placeholder="e.g. Unit-Alpha-1" />
                {form.formState.errors.name && <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Make</label>
                <input {...form.register("make")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Model</label>
                <input {...form.register("model")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Year</label>
                <input type="number" {...form.register("year")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">License Plate</label>
                <input {...form.register("licensePlate")} className="w-full p-2 border rounded bg-background font-mono focus:ring-1 focus:ring-ring outline-none uppercase" />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6 border-t pt-4">
              <Dialog.Close asChild>
                <button type="button" className="px-4 py-2 text-sm font-medium border rounded hover:bg-secondary transition-colors">Cancel</button>
              </Dialog.Close>
              <button 
                type="submit" 
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? "Registering..." : "Register"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
