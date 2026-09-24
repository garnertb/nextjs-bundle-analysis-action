export type RouterName = 'app' | 'pages';

export type CompressionAlgorithm = 'gzip' | 'brotli' | 'none';

/**
 * Bumped whenever the collection algorithm changes in a way that could shift
 * measured sizes (e.g. a different file set for a given route). Combined with
 * `schemaVersion` and `compression`, this lets a comparison detect an
 * incompatible baseline instead of silently diffing non-comparable numbers.
 */
export const COLLECTOR_VERSION = '1';

export const SCHEMA_VERSION = 1 as const;

export interface BundleFingerprint {
  schemaVersion: typeof SCHEMA_VERSION;
  collectorVersion: string;
  compression: CompressionAlgorithm;
}

export interface RouteMeasurement {
  route: string;
  router: RouterName;
  /** Compressed bytes of the route's unique required file set. */
  firstLoad: number;
  /** `firstLoad` minus this router's shared bytes. */
  own: number;
  /** Chunk paths (relative to the Next.js build output directory), kept for future root-cause diffing. */
  files: string[];
}

export interface RouterSummary {
  /** Compressed bytes of the files common to every route in this router. */
  shared: number;
}

export interface BundleReport {
  fingerprint: BundleFingerprint;
  nextVersion: string | undefined;
  bundler: string | undefined;
  /** Compressed bytes of the union of every client file across every route. */
  total: number;
  routers: Partial<Record<RouterName, RouterSummary>>;
  routes: RouteMeasurement[];
}
