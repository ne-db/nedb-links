/**
 * The single NEDB touchpoint. Every byte of state in NEDB Links flows
 * through an embedded, durable NEDB DAG.
 *
 * NEDB stores knowledge. Portal renders experiences. Links publishes identity.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { NedbCore } from "nedb-engine";
import { config } from "./config";

type Document = Record<string, unknown>;

interface PutOptions {
  clientId?: string;
  nonce?: string | number | bigint;
  idem?: string;
  causedBy?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
  evidence?: unknown;
  confidence?: unknown;
}

interface PutResult {
  ok: boolean;
  doc: Document;
  seq: number;
  head: string;
}

interface DeleteOptions {
  clientId?: string;
  nonce?: string | number | bigint;
  idem?: string;
}

interface DeleteResult {
  ok: boolean;
  seq: number;
  head: string;
}

interface QueryOptions {
  [key: string]: unknown;
}

type HistoryEntry = Document;

type BatchOperation =
  | {
      op: "put";
      collection: string;
      id: string;
      doc: object;
      options?: PutOptions;
    }
  | {
      op: "delete";
      collection: string;
      id: string;
      options?: DeleteOptions;
    };

interface BatchResult {
  ok: boolean;
  results: Array<PutResult | DeleteResult>;
  seq: number;
  head: string;
}

function parseDocument(
  value: string | null,
): Document | null {
  if (value === null) {
    return null;
  }

  return JSON.parse(value) as Document;
}

function parseDocuments(values: string[]): Document[] {
  return values.map(
    (value) => JSON.parse(value) as Document,
  );
}

function embeddedPath(): string {
  const configured = process.env.NEDB_PATH?.trim();

  if (configured) {
    return resolve(configured);
  }

  return resolve(
    process.cwd(),
    ".data",
    config.nedbDb,
  );
}

/**
 * Async compatibility adapter around NEDB's synchronous native binding.
 *
 * Keeping this surface asynchronous means server modules do not care whether
 * NEDB runs embedded or behind nedbd. Writes still enter the content-addressed
 * DAG and retain the engine's hashes, sequence numbers, and history.
 */
class EmbeddedNedb {
  private readonly engine: NedbCore;

  constructor(path: string) {
    mkdirSync(path, { recursive: true });
    this.engine = NedbCore.open(path);
  }

  /**
   * Compatibility with the former HTTP client. Opening NedbCore creates or
   * loads the durable database, so no separate database provisioning exists.
   */
  async createDatabase(): Promise<void> {
    return;
  }

  async health(): Promise<{
    ok: boolean;
    version: string;
  }> {
    return {
      ok: true,
      version: "embedded",
    };
  }

  /**
   * Compatibility with NedbClient.ping(). Embedded mode is reachable once
   * this instance has opened successfully, so verify the local DAG and return
   * the boolean shape expected by the live API test harness.
   */
  async ping(): Promise<boolean> {
    return this.engine.verify();
  }

  /**
   * Compatibility with NedbClient.dropDatabase(). Live test files use unique
   * scratch NEDB_DB names and run in isolated Node processes; flushing is
   * sufficient here and the ephemeral runner cleans the scratch directory.
   */
  async dropDatabase(): Promise<void> {
    this.engine.flush();
  }

  async put<T extends object>(
    collection: string,
    id: string,
    document: T,
    options: PutOptions = {},
  ): Promise<PutResult> {
    const stored = parseDocument(
      this.engine.putEx(
        collection,
        id,
        JSON.stringify({
          ...document,
          ...(options.causedBy
            ? { causedBy: options.causedBy }
            : {}),
          ...(options.validFrom
            ? { validFrom: options.validFrom }
            : {}),
          ...(options.validTo
            ? { validTo: options.validTo }
            : {}),
          ...(options.evidence
            ? { evidence: options.evidence }
            : {}),
          ...(options.confidence !== undefined
            ? { confidence: options.confidence }
            : {}),
        }),
        options.clientId,
        options.nonce === undefined
          ? undefined
          : BigInt(options.nonce),
        options.idem,
      ),
    );

    if (!stored) {
      throw new Error(
        `NEDB failed to store ${collection}/${id}`,
      );
    }

    return {
      ok: true,
      doc: stored,
      seq: Number(this.engine.seq()),
      head: this.engine.head(),
    };
  }

  async get(
    collection: string,
    id: string,
    asOf?: number,
  ): Promise<Document | null> {
    return parseDocument(
      asOf === undefined
        ? this.engine.get(collection, id)
        : this.engine.getAsOf(
            collection,
            id,
            BigInt(asOf),
          ),
    );
  }

  async query(
    statement: string,
    _options?: QueryOptions,
  ): Promise<Document[]> {
    return parseDocuments(
      this.engine.query(statement),
    );
  }

  async delete(
    collection: string,
    id: string,
    options: DeleteOptions = {},
  ): Promise<DeleteResult> {
    this.engine.deleteEx(
      collection,
      id,
      options.clientId,
      options.nonce === undefined
        ? undefined
        : BigInt(options.nonce),
      options.idem,
    );

    return {
      ok: true,
      seq: Number(this.engine.seq()),
      head: this.engine.head(),
    };
  }

  async batch(
    operations: BatchOperation[],
  ): Promise<BatchResult> {
    const results: Array<PutResult | DeleteResult> = [];

    for (const operation of operations) {
      if (operation.op === "put") {
        results.push(
          await this.put(
            operation.collection,
            operation.id,
            operation.doc,
            operation.options,
          ),
        );
      } else {
        results.push(
          await this.delete(
            operation.collection,
            operation.id,
            operation.options,
          ),
        );
      }
    }

    return {
      ok: true,
      results,
      seq: Number(this.engine.seq()),
      head: this.engine.head(),
    };
  }

  async history(
    collection: string,
    id: string,
  ): Promise<HistoryEntry[]> {
    const rows = this.engine.query(
      `FROM ${collection} HISTORY WHERE _id = ${JSON.stringify(
        id,
      )}`,
    );

    return parseDocuments(rows) as HistoryEntry[];
  }

  async head(): Promise<{
    head: string;
    seq: number;
  }> {
    return {
      head: this.engine.head(),
      seq: Number(this.engine.seq()),
    };
  }

  async verify(): Promise<{
    ok: boolean;
    head: string;
    seq: number;
  }> {
    return {
      ok: this.engine.verify(),
      head: this.engine.head(),
      seq: Number(this.engine.seq()),
    };
  }

  flush(): void {
    this.engine.flush();
  }
}

export const db = new EmbeddedNedb(
  embeddedPath(),
);

let flushed = false;

function flushEmbeddedDatabase(): void {
  if (flushed) {
    return;
  }

  flushed = true;
  db.flush();
}

process.once("beforeExit", flushEmbeddedDatabase);
process.once("SIGINT", flushEmbeddedDatabase);
process.once("SIGTERM", flushEmbeddedDatabase);

/** Provenance helper: the _hash of a document's current version, so the
 *  next put can chain causedBy to it. Returns [] for new documents. */
export function causalParent(
  doc: Record<string, unknown> | null,
): string[] {
  const h = doc && typeof doc._hash === "string" ? (doc._hash as string) : null;
  return h ? [h] : [];
}
