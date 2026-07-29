import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/layout/Shell';
import { Dashboard } from '@/pages/Dashboard';
import { Vehicles } from '@/pages/Vehicles';
import { VehicleDetail } from '@/pages/VehicleDetail';
import { Drivers } from '@/pages/Drivers';
import { DriverDetail } from '@/pages/DriverDetail';
import { Incidents } from '@/pages/Incidents';
import { IncidentDetail } from '@/pages/IncidentDetail';
import { Alerts } from '@/pages/Alerts';
import { Evidence } from '@/pages/Evidence';
import { Analytics } from '@/pages/Analytics';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/vehicles/:id" component={VehicleDetail} />
        <Route path="/drivers" component={Drivers} />
        <Route path="/drivers/:id" component={DriverDetail} />
        <Route path="/incidents" component={Incidents} />
        <Route path="/incidents/:id" component={IncidentDetail} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/evidence" component={Evidence} />
        <Route path="/analytics" component={Analytics} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
