import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Search, Wifi, WifiOff } from 'lucide-react';
import { Badge, Button, StatusPill, cn } from '@aegisdrive/ui';
import { fullName, initials } from '@aegisdrive/shared';
import type { ThreatLevel } from '@aegisdrive/types';
import { useAuthStore, useCurrentUser } from '@/stores/auth.store';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { useUiStore } from '@/stores/ui.store';
import { routes } from '@/config/routes';

interface TopbarProps {
  /** Organisation-wide posture from the dashboard snapshot. */
  posture?: ThreatLevel;
  unreadAlerts?: number;
}

/** Connection indicator. Silence about a dropped feed is the dangerous failure mode. */
function ConnectionBadge() {
  const connection = useCommandCentreStore((state) => state.connection);

  if (connection === 'connected') {
    return (
      <Badge tone="live" title="Live telemetry feed connected">
        <Wifi className="size-3" aria-hidden />
        Live
      </Badge>
    );
  }

  if (connection === 'connecting' || connection === 'reconnecting') {
    return (
      <Badge tone="warning" title="Reconnecting to the live feed">
        <Wifi className="size-3 animate-pulse" aria-hidden />
        Reconnecting
      </Badge>
    );
  }

  return (
    <Badge tone="danger" title="Live feed unavailable — data on screen may be stale">
      <WifiOff className="size-3" aria-hidden />
      Offline
    </Badge>
  );
}

export function Topbar({ posture, unreadAlerts = 0 }: TopbarProps) {
  const user = useCurrentUser();
  const logout = useAuthStore((state) => state.logout);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const toggleAlertRail = useUiStore((state) => state.toggleAlertRail);
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate(routes.login, { replace: true });
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-hairline bg-abyss/60 px-6 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className={cn(
          'group flex h-9 min-w-64 items-center gap-2 rounded-control border border-hairline bg-white/4 px-3',
          'text-left text-sm text-ink-tertiary transition-colors hover:bg-white/6 hover:text-ink-secondary',
        )}
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1">Search vehicles, incidents, drivers…</span>
        <kbd className="rounded border border-hairline bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-ink-tertiary">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {posture ? (
          <StatusPill status={{ kind: 'threat', value: posture }} size="sm" pulse />
        ) : null}

        <ConnectionBadge />

        <button
          type="button"
          onClick={toggleAlertRail}
          aria-label={`Alerts${unreadAlerts > 0 ? `, ${unreadAlerts} unread` : ''}`}
          className="relative grid size-9 place-items-center rounded-control text-ink-secondary transition-colors hover:bg-white/6 hover:text-ink-primary"
        >
          <Bell className="size-[18px]" aria-hidden />
          {unreadAlerts > 0 && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 size-2 animate-pulse-ring rounded-full bg-signal-critical"
            />
          )}
        </button>

        <div className="flex items-center gap-3 border-l border-hairline pl-3">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-full bg-aegis-500/15 text-xs font-semibold text-aegis-200"
          >
            {initials(user?.firstName, user?.lastName)}
          </span>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-medium text-ink-primary">
              {fullName(user?.firstName, user?.lastName)}
            </p>
            <p className="truncate text-[10px] uppercase tracking-widest text-ink-tertiary">
              {user?.roles.join(' · ')}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-[18px]" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
