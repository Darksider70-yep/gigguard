import { gridDisk, polygonToCells } from 'h3-js';

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type HealthBoundaryGeoJSON = GeoJsonPolygon | GeoJsonMultiPolygon;

const H3_RESOLUTION = 8;

function cellToBigInt(cell: string): bigint {
  return BigInt(`0x${cell}`);
}

function bigIntToCellId(cell: bigint): string {
  return cell.toString(16);
}

/**
 * Convert a GeoJSON Polygon or MultiPolygon into resolution-8 H3 cells.
 * The return format uses decimal bigint values to match PostgreSQL BIGINT[] storage.
 */
export function geojsonToHexIds(geojson: HealthBoundaryGeoJSON): bigint[] {
  if (geojson.type === 'Polygon') {
    const cells = polygonToCells(geojson.coordinates, H3_RESOLUTION, true);
    return cells.map(cellToBigInt);
  }

  if (geojson.type === 'MultiPolygon') {
    const unique = new Set<string>();
    for (const polygon of geojson.coordinates) {
      for (const cell of polygonToCells(polygon, H3_RESOLUTION, true)) {
        unique.add(cell);
      }
    }
    return Array.from(unique).map(cellToBigInt);
  }

  throw new Error(`Unsupported GeoJSON type: ${(geojson as any)?.type}`);
}

export function isWorkerInContainmentZone(workerHexId: bigint, affectedHexIds: bigint[]): boolean {
  const lookup = new Set(affectedHexIds.map((cell) => cell.toString()));
  return lookup.has(workerHexId.toString());
}

/**
 * Compute interior + k=1 buffer cells around a containment boundary.
 */
export function computeAffectedHexIds(geojson: HealthBoundaryGeoJSON): bigint[] {
  const interior = geojsonToHexIds(geojson);
  const buffered = new Set<string>();

  for (const cell of interior) {
    for (const neighbor of gridDisk(bigIntToCellId(cell), 1)) {
      buffered.add(neighbor);
    }
  }

  return Array.from(buffered).map(cellToBigInt);
}
