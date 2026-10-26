import type { Tile, TileKind } from '../game/types.ts';

export type RequiredReserve = 1 | 2 | 3 | 4;
export type ReserveCapacity = 0 | RequiredReserve;
export interface SurfacePort { column: number; kind: TileKind; prefix: number }
export interface PortsBarrierCertificate {
  schema: 'reserve-ports-barrier-v2';
  required: RequiredReserve;
  blockedReserve: ReserveCapacity;
  capacity: 12;
  initialHeights: number[];
  ports: SurfacePort[];
  layoutKey: string;
}
export interface SurfaceGroupReport {
  kind: TileKind;
  columns: number[];
  accessibleMass: number;
  spareTotal: number;
  portFloors: number[];
}
export type PortsBarrierVerification = {
  ok: true;
  required: RequiredReserve;
  blockedReserve: ReserveCapacity;
  minimumFloor: number;
  portFloors: number[];
  surfaceKinds: number;
  duplicatedKinds: number;
  absentKinds: TileKind[];
  groups: SurfaceGroupReport[];
  theorem: string;
} | { ok: false; reason: string };
type Columns = readonly (readonly Tile[])[];
interface ActualPort extends SurfacePort { spare: number }
const HEIGHTS = [10, 11, 11, 11, 11, 11, 11, 11, 11, 10] as const;
const invalid = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const prefix = (column: readonly Tile[]): number => { let n = 1; while (column[n]?.kind === column[0]!.kind) n++; return n; };
const layoutKey = (columns: Columns): string => columns.map(column => column.map(tile => tile.id).join(',')).join('|');

export function makePortsCertificate(columns: Columns, required: RequiredReserve): PortsBarrierCertificate {
  if (!Number.isInteger(required) || required < 1 || required > 4) throw new Error('required must be1..4');
  return { schema: 'reserve-ports-barrier-v2', required, blockedReserve: (required - 1) as ReserveCapacity, capacity: 12, initialHeights: [...HEIGHTS],
    ports: columns.map((column, index) => ({ column: index, kind: column[0]!.kind, prefix: prefix(column) })),
    layoutKey: layoutKey(columns) };
}

/** Generalized first-unlock lower proof; never a positive WIN claim. Prefixes,
 * inventory and capacities are recomputed from the actual tops-open position.
 * Every legal partial group/reserve cycle is covered by the mass inequality.
 */
export function verifyPortsBarrier(columns: Columns, certificate: unknown, claimedReserve?: number): PortsBarrierVerification {
  try {
    if (!certificate || typeof certificate !== 'object') return invalid('schema-or-required');
    const c = certificate as PortsBarrierCertificate, k = c.required;
    if (c.schema !== 'reserve-ports-barrier-v2' || !Number.isInteger(k) || k < 1 || k > 4) return invalid('schema-or-required');
    const fields = ['schema', 'required', 'blockedReserve', 'capacity', 'initialHeights', 'ports', 'layoutKey'];
    if (Object.keys(c).some(key => !fields.includes(key)) || fields.some(key => !Object.prototype.hasOwnProperty.call(c, key))) return invalid('certificate-fields');
    const q = claimedReserve === undefined ? c.blockedReserve : claimedReserve;
    if (c.capacity !== 12 || c.blockedReserve !== k - 1 || q !== k - 1) return invalid('capacity-claim');
    if (JSON.stringify(c.initialHeights) !== JSON.stringify(HEIGHTS) || !Array.isArray(columns) || columns.length !== 10 || columns.some((col, i) => !Array.isArray(col) || col.length !== HEIGHTS[i])) return invalid('initial-heights');
    const ids = new Set<number>(), counts = Array<number>(9).fill(0);
    for (const col of columns) for (let i = 0; i < col.length; i++) {
      const tile = col[i]!;
      if (!tile || tile.open !== (i === 0) || !Number.isInteger(tile.id) || tile.id < 0 || tile.id >= 108 || !Number.isInteger(tile.kind) || tile.kind < 0 || tile.kind > 8 || Math.floor(tile.id / 12) !== tile.kind || ids.has(tile.id)) return invalid('inventory-or-start-openness');
      ids.add(tile.id); counts[tile.kind]!++;
    }
    if (ids.size !== 108 || counts.some(n => n !== 12)) return invalid('inventory-counts');
    const key = layoutKey(columns);
    if (typeof c.layoutKey !== 'string' || c.layoutKey !== key) return invalid('layout-binding');
    if (!Array.isArray(c.ports) || c.ports.length !== 10) return invalid('ports');
    const seen = new Set<number>(), groups = new Map<TileKind, ActualPort[]>();
    for (const port of c.ports) {
      if (!port || Object.keys(port).sort().join(',') !== 'column,kind,prefix' || !Number.isInteger(port.column) || port.column < 0 || port.column >= 10 || seen.has(port.column)) return invalid('port-columns');
      const col = columns[port.column]!, n = prefix(col), kind = col[0]!.kind;
      if (port.kind !== kind || port.prefix !== n) return invalid('port-prefixes');
      seen.add(port.column);
      const actual: ActualPort = { column: port.column, kind, prefix: n, spare: 12 - col.length };
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind)!.push(actual);
    }
    if (seen.size !== 10) return invalid('port-coverage');
    const portFloors = Array<number>(10).fill(0), groupReports: SurfaceGroupReport[] = [];
    for (const [kind, ports] of groups) {
      const spare = ports.reduce((sum, port) => sum + port.spare, 0), mass = ports.reduce((sum, port) => sum + port.prefix, 0);
      const floors = ports.map(port => port.prefix - (spare - port.spare));
      for (let i = 0; i < ports.length; i++) portFloors[ports[i]!.column] = floors[i]!;
      if (floors.some(floor => floor < k)) return invalid('first-unlock-floor');
      groupReports.push({ kind, columns: ports.map(port => port.column), accessibleMass: mass, spareTotal: spare, portFloors: floors });
    }
    groupReports.sort((a, b) => a.kind - b.kind);
    return { ok: true, required: k, blockedReserve: q as ReserveCapacity, minimumFloor: Math.min(...portFloors), portFloors,
      surfaceKinds: groups.size, duplicatedKinds: groupReports.filter(group => group.columns.length >= 2).length,
      absentKinds: ([0, 1, 2, 3, 4, 5, 6, 7, 8] as TileKind[]).filter(kind => !groups.has(kind)), groups: groupReports,
      theorem: 'Before the first fixed-suffix exposure or empty port, all initially accessible kind-g tiles stay on kind-g ports or in reserve; clearing port i requires q >= ai - sum(other same-kind initial spare capacities).' };
  } catch { return invalid('malformed-certificate'); }
}
