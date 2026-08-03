import { isSimulated } from '@/data';
import type { RealtimeDriver } from './driver';
import { SimulatedDriver } from './simulated-driver';
import { SocketIoDriver } from './socket-driver';

/**
 * Realtime driver selection.
 *
 * Follows the data source: a simulated data source with a real socket (or the
 * reverse) would put two different worlds on one screen — the vehicle list from
 * one and its positions from the other. They must move together, so one flag
 * decides both.
 */
export const realtimeDriver: RealtimeDriver = isSimulated
  ? new SimulatedDriver()
  : new SocketIoDriver();

export type { ConnectionState, RealtimeDriver, RealtimeHandlers } from './driver';
