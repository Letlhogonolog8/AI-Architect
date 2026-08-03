import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Shell chrome state.
 *
 * Kept out of `auth.store` so that a layout preference change does not
 * re-render anything subscribed to the session.
 */
interface UiState {
  sidebarCollapsed: boolean;
  /** Right-hand live alert rail. Operators keep it open; analysts rarely do. */
  alertRailOpen: boolean;
  commandPaletteOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleAlertRail: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      alertRailOpen: true,
      commandPaletteOpen: false,

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleAlertRail: () => set((state) => ({ alertRailOpen: !state.alertRailOpen })),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    }),
    {
      name: 'aegisdrive.ui',
      storage: createJSONStorage(() => localStorage),
      // The palette is transient: restoring it open on load would be surprising.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        alertRailOpen: state.alertRailOpen,
      }),
    },
  ),
);
