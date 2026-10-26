// Wire shapes of the suba management API, as the server serializes them.

export type PatternKind = "name" | "keyword" | "regex";

/** One filter pattern: a single-key object naming how the text is matched. */
export type Pattern = { name: string } | { keyword: string } | { regex: string };

interface ProviderShared {
  disabled?: boolean;
  includes?: Pattern[];
  excludes?: Pattern[];
}

export interface RemoteProvider extends ProviderShared {
  type: "remote";
  url: string;
  interval?: number;
  /** A header sent more than once is a list of its values. */
  headers?: Record<string, string | string[]>;
  /** Milliseconds. */
  timeout?: number;
}

export interface LocalProvider extends ProviderShared {
  type: "local";
  path: string;
  interval?: number;
}

export interface InlineProvider extends ProviderShared {
  type: "inline";
  payload: string;
}

export type Provider = RemoteProvider | LocalProvider | InlineProvider;
export type ProviderType = Provider["type"];
export type ProviderSummary = Provider & {
  /** Last successful sync, including unchanged payloads, in epoch seconds. */
  updated_at: number | null;
};

export type RefreshStatus = "fetched" | "unchanged" | "not-modified";

export interface Refresh {
  name: string;
  status: RefreshStatus;
  bytes: number;
  nodes: number;
  unreadable?: string;
}

export interface SourceView {
  provider: string;
  name: string;
}

export interface NodeView {
  id: string;
  name: string;
  protocol: string;
  endpoint: string;
  sources: SourceView[];
}

export interface ProviderNodes {
  name: string;
  nodes: NodeView[];
  passed_over: number;
  updated_at: number | null;
  unreadable?: string;
}

export interface Collection {
  providers?: string[];
  includes?: Pattern[];
  excludes?: Pattern[];
  /** Token name to the token. */
  tokens?: Record<string, string>;
}

/** A collection as the list answers it: the definition and what it serves now. */
export interface CollectionSummary extends Collection {
  nodes: number;
  unresolved: string[];
  links: DeliveryToken[];
}

export interface Metrics {
  host: {
    name: string | null;
    os: string | null;
    kernel: string | null;
    arch: string;
    uptime: number;
  };
  cpu: { cores: number; usage: number | null; load: [number, number, number] };
  memory: {
    total: number;
    used: number;
    swap_total: number;
    swap_used: number;
  };
  disk: { total: number; available: number } | null;
  network: {
    received: number;
    transmitted: number;
    receive_rate: number | null;
    transmit_rate: number | null;
  };
}

export interface CollectionNodes {
  name: string;
  nodes: NodeView[];
  passed_over: number;
  unresolved: string[];
}

export interface DeliveryToken {
  name: string;
  token: string;
  path: string;
}

export interface Artifact {
  body: string;
  format: string | null;
  nodes: number | null;
  skipped: number | null;
}

export interface SystemStatus {
  version: string;
  administrator_configured: boolean;
}

export interface FormatView {
  name: string;
  intents: string[];
  protocols: { support: "everything" } | { support: "only"; kinds: string[] };
}

export interface SystemInfo extends SystemStatus {
  formats: FormatView[];
}

export interface Core {
  version: string | null;
  config: string;
  privilege: Privilege;
  collections: string[];
  installed: boolean;
  assembled: boolean;
  running: boolean;
  note?: string;
}

/**
 * Whether the core runs with this instance's privileges, which is the server's
 * to say: a `tun` inbound needs root, and whether the server was started as
 * root is not something a configuration can reveal.
 */
export type Privilege = "operator" | "root";

export interface ConfigView {
  name: string;
  current: boolean;
}

export interface Exit {
  at: number;
  code: number | null;
  signal: number | null;
}

export interface Running {
  running: boolean;
  pid: number | null;
  started_at: number | null;
  exits: Exit[];
  log: string[];
}

export type CoreAction = "start" | "stop" | "restart";

export type Installation =
  | { status: "not-installed" }
  | {
      status: "downloading";
      progress: {
        downloaded: number;
        total: number | null;
        percentage: number | null;
      };
    }
  | { status: "installed"; installed_at: number }
  | { status: "failed"; error: string };

export type Runtime =
  | { status: "stopped" }
  | { status: "starting" }
  | { status: "running"; pid: number }
  | { status: "stopping" }
  | { status: "failed"; error: string };

export interface VersionView {
  version: string;
  tag: string;
  asset?: string;
  platform?: string;
  asset_sha256?: string;
  binary_sha256?: string;
  schema_sha256?: string;
  installation: Installation;
  runtime: Runtime;
  current: boolean;
}

export interface Releases {
  stable: string | null;
  latest: string | null;
  versions: { version: string; tag: string; page: string | null }[];
}

export interface Saved {
  unchecked: { what: string; fix: string }[];
  warnings: string[];
}

export interface Versioned<T> {
  value: T;
  etag: string | null;
}

export interface Tag {
  tag: string;
  space: string;
  kind: string | null;
  path: string;
  source: "config" | "collection";
  collections: string[];
  value: Record<string, unknown>;
}

export interface References {
  tags: Tag[];
  unchecked: { what: string; reason: string }[];
  /** Conversion omissions do not invalidate the remaining reference catalog. */
  skipped?: { path: string; reason: string }[];
}

/** How far a pool user's credential has got on the core. */
export type GrantState = "applied" | "pending" | "stopped" | "unused";

/** A client node for one user of one inbound, or why there is none. */
export interface Export {
  link?: string;
  /** Absent also when this build cannot write sing-box outbounds. */
  outbound?: Record<string, unknown>;
  reason?: string;
}

export interface GrantView extends Export {
  config: string;
  inbound: string;
  via: string[];
  /** Absent when the grant reaches no inbound a pool can give. */
  state?: GrantState;
}

/** A proxy identity, not a SubA login. */
export interface UserView {
  name: string;
  pools: string[];
  collections: string[];
  missing_pools: string[];
  missing_collections: string[];
  links: DeliveryToken[];
  grants: GrantView[];
}

/** One inbound a pool grants: its tag, in one named configuration. */
export interface PoolEntry {
  config: string;
  inbound: string;
}

export interface PoolView {
  name: string;
  /** `reason` says why the entry gives nobody anything. */
  entries: (PoolEntry & { reason?: string })[];
  members: string[];
}

/** A user written into the configuration by hand, by its array index. */
export interface HandWrittenUser extends Export {
  index: number;
  /** Why the core refuses to start with it beside the pool users. */
  conflict?: string;
}

export interface ManagedUser extends Export {
  user: string;
  via: string[];
  state: GrantState;
}

export interface InboundUsers {
  /** The inbound's position in the saved document. */
  index: number;
  tag: string | null;
  /** Why pools cannot grant this inbound. */
  refused?: string;
  flow?: string;
  users: HandWrittenUser[];
  managed: ManagedUser[];
  /** Names the running core still serves here that the configuration no longer has. */
  departing?: string[];
}

export interface ConfigExports {
  public_host?: string;
  inbounds: InboundUsers[];
}

export type GenerateCommand =
  | "uuid"
  | "rand"
  | "reality-keypair"
  | "tls-keypair"
  | "ech-keypair"
  | "wg-keypair"
  | "vapid-keypair";

export interface Generated {
  command: string;
  output: string;
}
