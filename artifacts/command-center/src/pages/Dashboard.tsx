import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { 
  useGetDashboardSummary, 
  useGetRecentActivity, 
  useGetThreatTrends 
} from "@workspace/api-client-react";
import { PageHeader, LoadingScreen, ErrorState, StatusBadge } from "@/components/ui/shared";
import { ShieldAlert, Car, AlertTriangle, Activity, Database, Clock, BellRing, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";

export function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary, error: summaryError } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity({ limit: 10 });
  const { data: trends, isLoading: isLoadingTrends } = useGetThreatTrends({ days: 7 });

  if (isLoadingSummary) return <LoadingScreen />;
  if (summaryError || !summary) return <ErrorState message="Failed to load command center summary." />;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader 
        title="Command Center" 
        description={`Fleet Status • ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')} UTC`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Protected Fleet" 
          value={summary.totalVehicles} 
          icon={Car} 
          trend="active"
        />
        <MetricCard 
          title="Active Incidents" 
          value={summary.activeIncidents} 
          icon={ShieldAlert} 
          alert={summary.activeIncidents > 0}
        />
        <MetricCard 
          title="Unresolved Alerts" 
          value={summary.unresolvedAlerts} 
          icon={AlertTriangle} 
          alert={summary.unresolvedAlerts > 5}
        />
        <MetricCard 
          title="Avg Threat Level" 
          value={`${summary.threatLevelAvg.toFixed(1)}`} 
          icon={Activity} 
          subValue="/100"
          alert={summary.threatLevelAvg > 40}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Threat Trends Chart */}
          <div className="bg-card border rounded-md p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">7-Day Threat Activity</h2>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Live Telemetry</div>
            </div>
            <div className="h-[300px] w-full">
              {isLoadingTrends ? (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Activity className="animate-pulse" /></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorSuspicious" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--alert-amber))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--alert-amber))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(new Date(val), 'MMM dd')}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      fontFamily="var(--font-mono)"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      fontFamily="var(--font-mono)"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      labelFormatter={(val) => format(new Date(val), 'MMM dd, yyyy')}
                    />
                    <Area type="monotone" dataKey="sos_triggered" name="SOS" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorSos)" strokeWidth={2} />
                    <Area type="monotone" dataKey="suspicious_activity" name="Suspicious" stroke="hsl(var(--alert-amber))" fillOpacity={1} fill="url(#colorSuspicious)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border rounded-md p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Fleet Status</h3>
              <div className="space-y-3">
                <StatusRow label="Safe" count={summary.vehiclesByStatus.safe} color="bg-green" total={summary.totalVehicles} />
                <StatusRow label="Alert" count={summary.vehiclesByStatus.alert} color="bg-amber" total={summary.totalVehicles} />
                <StatusRow label="Emergency" count={summary.vehiclesByStatus.emergency} color="bg-destructive" total={summary.totalVehicles} />
                <StatusRow label="Offline" count={summary.vehiclesByStatus.offline} color="bg-muted-foreground" total={summary.totalVehicles} />
              </div>
            </div>
            
            <div className="bg-card border rounded-md p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Active Incidents</h3>
              <div className="space-y-3">
                <StatusRow label="Critical" count={summary.incidentsBySeverity.critical} color="bg-destructive" total={summary.activeIncidents} />
                <StatusRow label="High" count={summary.incidentsBySeverity.high} color="bg-amber" total={summary.activeIncidents} />
                <StatusRow label="Medium" count={summary.incidentsBySeverity.medium} color="bg-blue-500" total={summary.activeIncidents} />
                <StatusRow label="Low" count={summary.incidentsBySeverity.low} color="bg-muted-foreground" total={summary.activeIncidents} />
              </div>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-card border rounded-md shadow-sm flex flex-col h-[calc(100vh-8rem)] sticky top-8">
          <div className="p-4 border-b flex items-center justify-between shrink-0 bg-secondary/30 rounded-t-md">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock size={16} /> 
              Recent Activity
            </h2>
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          </div>
          
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {isLoadingActivity ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
            ) : activity?.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">No recent activity</div>
            ) : (
              activity?.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="flex gap-3 relative group">
                  <div className="w-px h-full bg-border absolute left-[15px] top-6 -z-10 group-last:hidden" />
                  <div className="shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full border bg-background flex items-center justify-center shadow-sm">
                      {item.kind === 'incident' ? <ShieldAlert size={14} className="text-destructive" /> : <BellRing size={14} className="text-amber" />}
                    </div>
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{item.title}</p>
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <StatusBadge status={item.severity} />
                      {item.vehicleName && (
                        <Link href={`/vehicles/${item.vehicleId}`} className="text-xs font-mono text-muted-foreground hover:text-foreground hover:underline transition-colors">
                          {item.vehicleName}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, subValue, alert, trend }: any) {
  return (
    <div className="bg-card border rounded-md p-5 shadow-sm relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
          <div className="flex items-baseline gap-1">
            <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
            {subValue && <span className="text-sm text-muted-foreground font-mono">{subValue}</span>}
          </div>
        </div>
        <div className={`p-2 rounded ${alert ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>
          <Icon size={20} />
        </div>
      </div>
      {alert && <div className="absolute top-0 left-0 w-full h-1 bg-destructive" />}
    </div>
  );
}

function StatusRow({ label, count, color, total }: any) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">{count}</span>
      </div>
      <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
