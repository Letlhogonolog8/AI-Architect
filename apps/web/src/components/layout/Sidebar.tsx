import { NavLink } from 'react-router';
import { ChevronsLeft, ShieldCheck } from 'lucide-react';
import { cn } from '@aegisdrive/ui';
import { APP_NAME } from '@aegisdrive/shared';
import { navigation } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

interface SidebarProps {
  /** Live counts rendered as badges next to their nav item. */
  counts?: { openIncidents?: number; openAlerts?: number };
}

/**
 * Primary navigation.
 *
 * Sections whose every item is hidden by permission collapse entirely, so a
 * driver on a small screen does not scroll past three empty group headings.
 */
export function Sidebar({ counts }: SidebarProps) {
  const canAny = useAuthStore((state) => state.canAny);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const visibleSections = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAny([item.permission])),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-hairline bg-abyss/80 backdrop-blur-xl',
        'transition-[width] duration-300 ease-out-expo',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-hairline px-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-aegis-500/15 text-aegis-300 shadow-glow">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink-primary">
              {APP_NAME}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-tertiary">
              Protection OS
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-6 last:mb-0">
            {!collapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
                {section.title}
              </p>
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const badgeCount = item.badge ? counts?.[item.badge] : undefined;

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-control px-3 py-2 text-sm',
                          'transition-colors duration-200 ease-out-expo',
                          isActive
                            ? 'bg-aegis-500/12 text-aegis-100 shadow-[inset_2px_0_0_0_var(--color-aegis-400)]'
                            : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
                          collapsed && 'justify-center px-0',
                        )
                      }
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && badgeCount !== undefined && badgeCount > 0 && (
                        <span
                          data-numeric
                          className="rounded-pill bg-signal-critical/15 px-1.5 py-0.5 text-[10px] font-semibold text-signal-critical"
                        >
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-hairline p-3">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          className={cn(
            'flex w-full items-center gap-3 rounded-control px-3 py-2 text-xs text-ink-tertiary',
            'transition-colors hover:bg-white/5 hover:text-ink-secondary',
            collapsed && 'justify-center px-0',
          )}
        >
          <ChevronsLeft
            className={cn('size-4 transition-transform duration-300', collapsed && 'rotate-180')}
            aria-hidden
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
