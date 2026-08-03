import type { CommandCentreClient } from './data-source';
import { LiveDataSource } from './live-source';
import { MockDataSource } from '@/mocks/mock-source';
import { webEnv } from '@/config/env';

/**
 * The swap point.
 *
 * This is the *only* module that knows both implementations exist. Widgets
 * import `dataSource` and depend on the interface, so moving the command centre
 * onto real endpoints means changing `VITE_DATA_SOURCE` — not touching a single
 * widget.
 *
 * The mock is refused outright in a production build. A demo-mode flag that can
 * be switched on in production is how a control room ends up dispatching against
 * fabricated positions, so this is a hard failure rather than a warning.
 */
function resolveDataSource(): CommandCentreClient {
  const requested = webEnv.dataSource;

  if (requested === 'mock') {
    if (webEnv.isProduction) {
      throw new Error(
        'VITE_DATA_SOURCE=mock is not permitted in a production build. The command centre would render fabricated vehicles, threats and positions indistinguishable from live operations.',
      );
    }
    return new MockDataSource();
  }

  return new LiveDataSource();
}

export const dataSource: CommandCentreClient = resolveDataSource();

/** True when the UI must warn that it is showing simulated data. */
export const isSimulated = dataSource.kind === 'mock';

export type { CommandCentreClient, CommandCentreDataSource } from './data-source';
