import { useState } from "react";
import { useListDrivers, useCreateDriver, getListDriversQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge, ScoreDisplay } from "@/components/ui/shared";
import { Link } from "wouter";
import { Plus, Search, Users, UserCircle } from "lucide-react";
import { format } from "date-fns";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

export function Drivers() {
  const { data: drivers, isLoading, error } = useListDrivers();

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorState message="Failed to load driver profiles." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Personnel Registry" 
        description="Manage driver profiles and behavior tracking"
      >
        <CreateDriverDialog />
      </PageHeader>

      <div className="bg-card border rounded-md shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-secondary/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search drivers..." 
              className="w-full pl-9 pr-4 py-2 bg-background border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/40 text-muted-foreground font-mono text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Behavior Score</th>
                <th className="px-6 py-3 font-medium">Registered</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {drivers?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No driver profiles registered.
                  </td>
                </tr>
              ) : drivers?.map((driver) => (
                <tr key={driver.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium">
                    <Link href={`/drivers/${driver.id}`} className="hover:underline flex items-center gap-2">
                      <UserCircle size={16} className="text-muted-foreground" />
                      {driver.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs">{driver.phone}</span>
                      {driver.email && <span className="text-xs">{driver.email}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={driver.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ScoreDisplay score={driver.behaviorScore} className="justify-end" />
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs font-mono">
                    {format(new Date(driver.createdAt), 'MM/dd/yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      href={`/drivers/${driver.id}`}
                      className="text-xs font-mono uppercase tracking-wider text-accent hover:text-accent/80 font-semibold px-3 py-1.5 border border-accent/20 rounded hover:bg-accent/5 transition-colors"
                    >
                      View
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

function CreateDriverDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createMutation = useCreateDriver();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", phone: "", email: "" }
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    const payload = { ...data, email: data.email || null };
    createMutation.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
        setOpen(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
          <Plus size={16} /> Add Driver
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 duration-200">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2 border-b pb-4">
            <UserCircle size={20} className="text-accent" /> Register Driver
          </Dialog.Title>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Full Name</label>
                <input {...form.register("name")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none" />
                {form.formState.errors.name && <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Phone</label>
                <input {...form.register("phone")} className="w-full p-2 border rounded bg-background font-mono focus:ring-1 focus:ring-ring outline-none" />
                {form.formState.errors.phone && <p className="text-destructive text-xs">{form.formState.errors.phone.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground">Email (Optional)</label>
                <input type="email" {...form.register("email")} className="w-full p-2 border rounded bg-background focus:ring-1 focus:ring-ring outline-none" />
                {form.formState.errors.email && <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>}
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
