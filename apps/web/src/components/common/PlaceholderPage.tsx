import type { ReactNode } from 'react';
import { PageHeader, Panel, Surface } from '@aegisdrive/ui';

export interface PlannedCapability {
  title: string;
  description: string;
  /** The API endpoint that already backs this capability, when one exists. */
  endpoint?: string;
}

interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
  /**
   * What this screen will do, and which endpoint already serves it. Stating the
   * contract here is what makes these pages a specification rather than a
   * lorem-ipsum shell — the next engineer builds against a named endpoint.
   */
  capabilities: PlannedCapability[];
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Structured placeholder for screens whose backend exists but whose UI is a
 * later milestone.
 *
 * Deliberately not filled with fabricated rows. Placeholder data in a security
 * product trains operators to trust numbers that mean nothing.
 */
export function PlaceholderPage({
  eyebrow,
  title,
  description,
  capabilities,
  actions,
  children,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />

      {children}

      <Panel
        title="Planned capability"
        description="Each item below is already served by the API listed beside it."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {capabilities.map((capability) => (
            <li key={capability.title}>
              <Surface elevation="flat" padding="sm" className="h-full">
                <p className="text-xs font-semibold text-ink-primary">{capability.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-tertiary">
                  {capability.description}
                </p>
                {capability.endpoint && (
                  <code className="mt-3 block rounded-control bg-black/30 px-2 py-1 font-mono text-[11px] text-aegis-200">
                    {capability.endpoint}
                  </code>
                )}
              </Surface>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
