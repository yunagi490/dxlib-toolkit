// dx-cli は @types/node を devDependencies にも含めず、外部npm依存を完全にゼロにする方針のため、
// 実際に使用するNode.js組み込みAPIのみを最小限に手書きで型付けする。
// (本来は @types/node を入れるのが楽だが、利用者がオフライン環境やネット制限下でも
//  `yarn install` なしで動かせるようにするための割り切り)

declare const process: {
  argv: string[];
  platform: string;
  arch: string;
  exitCode: number | undefined;
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
  on(event: string, listener: (...args: unknown[]) => void): void;
  stdout: { isTTY: boolean | undefined; write(s: string): boolean };
  stderr: { isTTY: boolean | undefined; write(s: string): boolean };
  stdin: { isTTY: boolean | undefined };
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
};

declare function setTimeout(callback: (...args: unknown[]) => void, ms: number): NodeTimeout;
declare function clearTimeout(handle: NodeTimeout): void;

type NodeTimeout = { __nodeTimeoutBrand: true };

declare namespace NodeJS {
  // dx dev の setTimeout 戻り値型として使用
  type Timeout = NodeTimeout;
}

interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
}

declare const Buffer: {
  from(data: ArrayBuffer | string, encodingOrOffset?: string | number): Buffer;
};

// fetch / Response はNode18+のグローバル実装を素朴に型付け(本物のlib.dom.d.tsは使わない)
interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

declare const AbortSignal: {
  timeout(ms: number): unknown;
};

declare function fetch(
  url: string,
  init?: { headers?: Record<string, string>; signal?: unknown }
): Promise<FetchResponse>;

declare module "node:fs" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export interface Stats {
    mtimeMs: number;
  }
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readFileSync(path: string, encoding: string): string;
  export function readFileSync(path: string): Buffer;
  export function writeFileSync(path: string, data: string | Buffer, encoding?: string): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function copyFileSync(src: string, dest: string): void;
  export function statSync(path: string): Stats;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function watch(
    path: string,
    options: { persistent?: boolean },
    listener: (event: string, filename: string | null) => void
  ): { close(): void };
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: Buffer | string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module "node:os" {
  export function homedir(): string;
  export function tmpdir(): string;
  export function cpus(): unknown[];
}

declare module "node:child_process" {
  export interface SpawnSyncReturns {
    status: number | null;
    stdout: Buffer | null;
    stderr: Buffer | null;
  }
  export interface ChildProcess {
    killed: boolean;
    kill(signal?: string): boolean;
    on(event: "exit", listener: (code: number | null) => void): void;
  }
  export function execSync(command: string, options?: { stdio?: unknown }): Buffer;
  export function execFileSync(file: string, args: string[], options?: { stdio?: unknown }): Buffer;
  export function spawnSync(
    command: string,
    args?: string[],
    options?: { cwd?: string; stdio?: unknown }
  ): SpawnSyncReturns;
  export function spawn(
    command: string,
    args?: string[],
    options?: { cwd?: string; stdio?: unknown }
  ): ChildProcess;
}

declare module "node:readline/promises" {
  export interface Interface {
    question(prompt: string): Promise<string>;
    close(): void;
  }
  export function createInterface(options: { input: unknown; output: unknown }): Interface;
}

declare module "node:process" {
  const stdin: { isTTY: boolean | undefined };
  const stdout: { isTTY: boolean | undefined };
  export { stdin, stdout };
}