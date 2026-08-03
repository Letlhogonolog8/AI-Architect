import { Link, useLocation } from "wouter";
import { 
  ShieldAlert, 
  CarFront, 
  Users, 
  Activity, 
  BellRing, 
  Database, 
  LineChart, 
  Crosshair,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/vehicles", label: "Fleet", icon: CarFront },
  { href: "/drivers", label: "Personnel", icon: Users },
  { href: "/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/alerts", label: "Active Alerts", icon: BellRing },
  { href: "/evidence", label: "Vault", icon: Database },
  { href: "/analytics", label: "Intelligence", icon: LineChart },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col fixed inset-y-0 left-0 z-50">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 group outline-none">
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center text-accent-foreground relative">
              <div className="absolute inset-0 rounded bg-accent opacity-50 pulse-ring" />
              <Crosshair size={20} className="relative z-10 group-hover:rotate-90 transition-transform duration-500" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-sm uppercase leading-tight">AEGISDRIVE</span>
              <span className="text-[10px] text-sidebar-foreground/60 font-mono tracking-widest leading-none">CMD_CNTR</span>
            </div>
          </Link>
        </div>

        {/* Global Search */}
        <div className="px-3 py-4 border-b border-sidebar-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search command centre..." 
              className="w-full pl-9 pr-3 py-2 bg-sidebar-accent/30 border border-sidebar-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono placeholder:text-muted-foreground/50 transition-all duration-200"
            />
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-all duration-200 outline-none relative",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                {isActive && <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-accent rounded-r" />}
                <Icon size={18} className={cn("shrink-0 transition-colors duration-200", isActive ? "text-accent" : "text-sidebar-foreground/50")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 bg-sidebar-accent/30 rounded">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs font-mono text-sidebar-foreground/70">AI.ONLINE</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 bg-sidebar-accent/30 rounded">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-mono text-sidebar-foreground/70">SYS.ONLINE</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-w-0 flex flex-col">
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
