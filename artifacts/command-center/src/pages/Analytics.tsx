import { useGetThreatTrends, useGetVehicleRiskScores } from "@workspace/api-client-react";
import { PageHeader, LoadingScreen, ErrorState } from "@/components/ui/shared";
import { TrendingUp, AlertTriangle, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from "recharts";
import { Link } from "wouter";

export function Analytics() {
  const { data: trends, isLoading: isLoadingTrends, error: trendsError } = useGetThreatTrends({ days: 30 });
  const { data: riskScores, isLoading: isLoadingRisk, error: riskError } = useGetVehicleRiskScores();

  if (isLoadingTrends || isLoadingRisk) return <LoadingScreen />;
  if (trendsError || riskError) return <ErrorState message="Failed to load analytics data." />;

  // Aggregate incident types for pie chart
  const totalsByType = trends?.reduce((acc: any, day) => {
    acc.hijacking = (acc.hijacking || 0) + day.hijacking;
    acc.theft_attempt = (acc.theft_attempt || 0) + day.theft_attempt;
    acc.coercion = (acc.coercion || 0) + day.coercion;
    acc.kidnapping = (acc.kidnapping || 0) + day.kidnapping;
    acc.suspicious_activity = (acc.suspicious_activity || 0) + day.suspicious_activity;
    acc.sos_triggered = (acc.sos_triggered || 0) + day.sos_triggered;
    return acc;
  }, {});

  const pieData = totalsByType ? [
    { name: 'Hijacking', value: totalsByType.hijacking, color: 'hsl(var(--destructive))' },
    { name: 'Theft Attempt', value: totalsByType.theft_attempt, color: 'hsl(var(--alert-amber))' },
    { name: 'Coercion', value: totalsByType.coercion, color: 'hsl(var(--chart-3))' },
    { name: 'Kidnapping', value: totalsByType.kidnapping, color: 'hsl(var(--chart-4))' },
    { name: 'Suspicious', value: totalsByType.suspicious_activity, color: 'hsl(var(--chart-2))' },
    { name: 'SOS', value: totalsByType.sos_triggered, color: 'hsl(var(--chart-1))' },
  ].filter(d => d.value > 0) : [];

  // Severity breakdown
  const severityData = trends?.reduce((acc: any, day) => {
    const critical = day.hijacking + day.kidnapping;
    const high = day.coercion + day.sos_triggered;
    const medium = day.theft_attempt;
    const low = day.suspicious_activity;
    
    acc.critical = (acc.critical || 0) + critical;
    acc.high = (acc.high || 0) + high;
    acc.medium = (acc.medium || 0) + medium;
    acc.low = (acc.low || 0) + low;
    return acc;
  }, {});

  const severityChartData = severityData ? [
    { severity: 'Critical', count: severityData.critical },
    { severity: 'High', count: severityData.high },
    { severity: 'Medium', count: severityData.medium },
    { severity: 'Low', count: severityData.low },
  ] : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Threat Intelligence" 
        description="Analytics and predictive insights from 30-day dataset"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 30-Day Trend Line */}
        <div className="bg-card border rounded-md p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-accent" />
            <h2 className="font-semibold text-lg">30-Day Incident Trend by Type</h2>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => format(new Date(val), 'MM/dd')}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  labelFormatter={(val) => format(new Date(val), 'MMM dd, yyyy')}
                />
                <Legend 
                  wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                  iconType="circle"
                />
                <Bar dataKey="hijacking" name="Hijacking" fill="hsl(var(--destructive))" stackId="a" />
                <Bar dataKey="theft_attempt" name="Theft" fill="hsl(var(--alert-amber))" stackId="a" />
                <Bar dataKey="coercion" name="Coercion" fill="hsl(var(--chart-3))" stackId="a" />
                <Bar dataKey="kidnapping" name="Kidnapping" fill="hsl(var(--chart-4))" stackId="a" />
                <Bar dataKey="suspicious_activity" name="Suspicious" fill="hsl(var(--chart-2))" stackId="a" />
                <Bar dataKey="sos_triggered" name="SOS" fill="hsl(var(--chart-1))" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incident Type Breakdown */}
        <div className="bg-card border rounded-md p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={18} className="text-accent" />
            <h2 className="font-semibold text-lg">Incident Type Distribution</h2>
          </div>
          <div className="h-[280px] w-full flex items-center justify-center">
            {pieData.length === 0 ? (
              <p className="text-muted-foreground text-sm">No incident data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Severity Breakdown */}
        <div className="bg-card border rounded-md p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-destructive" />
            <h2 className="font-semibold text-lg">Severity Breakdown</h2>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} fontFamily="var(--font-mono)" />
                <YAxis dataKey="severity" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} fontFamily="var(--font-mono)" width={80} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                />
                <Bar dataKey="count" fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vehicle Risk Leaderboard */}
        <div className="bg-card border rounded-md shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-4 border-b bg-secondary/30">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp size={18} className="text-accent" />
              Vehicle Risk Leaderboard
            </h2>
            <p className="text-xs font-mono text-muted-foreground uppercase mt-1">Top at-risk vehicles by historical incident frequency</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/20 text-muted-foreground font-mono text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-medium">Rank</th>
                  <th className="px-6 py-3 font-medium">Vehicle</th>
                  <th className="px-6 py-3 font-medium">License Plate</th>
                  <th className="px-6 py-3 font-medium text-right">Risk Score</th>
                  <th className="px-6 py-3 font-medium text-right">Incidents</th>
                  <th className="px-6 py-3 font-medium">Last Incident</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {riskScores?.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No risk data available.</td></tr>
                ) : riskScores?.map((vehicle, idx) => (
                  <tr key={vehicle.vehicleId} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-bold font-mono text-muted-foreground">#{idx + 1}</td>
                    <td className="px-6 py-4 font-medium">
                      <Link href={`/vehicles/${vehicle.vehicleId}`} className="hover:underline">{vehicle.vehicleName}</Link>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      <span className="px-2 py-1 bg-secondary rounded border">{vehicle.licensePlate}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-mono font-bold ${vehicle.riskScore >= 80 ? 'text-destructive' : vehicle.riskScore >= 50 ? 'text-amber' : 'text-green'}`}>
                        {vehicle.riskScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">{vehicle.incidentCount}</td>
                    <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                      {vehicle.lastIncidentAt ? format(new Date(vehicle.lastIncidentAt), 'MM/dd/yyyy') : 'None'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/vehicles/${vehicle.vehicleId}`}
                        className="text-xs font-mono uppercase tracking-wider text-accent hover:underline"
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
    </div>
  );
}
