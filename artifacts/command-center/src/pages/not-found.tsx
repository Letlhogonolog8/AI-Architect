import { Link } from "wouter";
import { AlertTriangle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 border border-destructive/20 mb-4">
          <AlertTriangle size={40} className="text-destructive" />
        </div>
        
        <div>
          <h1 className="text-6xl font-bold tracking-tight font-mono mb-2">404</h1>
          <h2 className="text-xl font-semibold mb-2">Route Not Found</h2>
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
            The requested resource does not exist in the command center registry.
          </p>
        </div>

        <div className="pt-6">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Home size={16} />
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
