declare module "archiver" {
  import { Readable, Writable } from "node:stream";

  interface ArchiverOptions {
    zlib?: { level?: number };
    store?: boolean;
  }

  interface EntryData {
    name: string;
    date?: Date | string;
    mode?: number;
    prefix?: string;
    stats?: object;
  }

  class Archiver extends Readable {
    constructor(options?: ArchiverOptions);
    pipe<T extends Writable>(destination: T, options?: { end?: boolean }): T;
    append(source: Buffer | string | NodeJS.ReadableStream, data: EntryData): this;
    finalize(): Promise<void>;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export class ZipArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  export class TarArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  export { Archiver };
}
