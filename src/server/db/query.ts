import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Database } from "@/types/database";

/**
 * Constructeur de requêtes sur la base SQLite locale.
 *
 * Il reprend le sous-ensemble de l'API de requêtes utilisé par l'application
 * (from / select / insert / update / delete / eq / in / order / single...),
 * ce qui a permis de quitter Supabase sans réécrire chaque page.
 *
 * Il remplace aussi la sécurité au niveau des lignes (RLS) : chaque requête est
 * liée à un utilisateur et ne voit, ne crée, ne modifie et ne supprime que ses
 * propres lignes ; les tables rattachées à une consultation vérifient que la
 * consultation lui appartient ; le journal d'audit est en ajout seul.
 */

type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]["Row"];
export type InsertRow<T extends TableName> = Tables[T]["Insert"];
export type UpdateRow<T extends TableName> = Tables[T]["Update"];

export type DbError = { message: string; code: string };
export type DbResult<D> = { data: D; error: null; count: number | null } | { data: null; error: DbError; count: null };

type TableMeta = {
  /** Colonne qui désigne le propriétaire de la ligne. */
  owner: "id" | "user_id";
  json: readonly string[];
  /** La ligne doit appartenir à une consultation de l'utilisateur. */
  consultation: "required" | "optional" | "none";
  id: "uuid" | "integer" | "provided";
  updatedAt: boolean;
  appendOnly?: boolean;
};

const META: Record<TableName, TableMeta> = {
  profiles: { owner: "id", json: ["professional_info"], consultation: "none", id: "provided", updatedAt: true },
  user_settings: { owner: "user_id", json: ["institution_info"], consultation: "none", id: "provided", updatedAt: true },
  consultations: {
    owner: "user_id",
    json: ["patient_information", "vessel_information", "call_information"],
    consultation: "none",
    id: "uuid",
    updatedAt: true,
  },
  recordings: { owner: "user_id", json: [], consultation: "required", id: "uuid", updatedAt: false },
  transcription_segments: { owner: "user_id", json: [], consultation: "required", id: "uuid", updatedAt: true },
  transcriptions: { owner: "user_id", json: [], consultation: "required", id: "uuid", updatedAt: true },
  observation_forms: {
    owner: "user_id",
    json: ["form_data", "ai_extraction"],
    consultation: "required",
    id: "uuid",
    updatedAt: true,
  },
  prescriptions: { owner: "user_id", json: ["prescription_data"], consultation: "required", id: "uuid", updatedAt: true },
  generated_documents: { owner: "user_id", json: [], consultation: "required", id: "uuid", updatedAt: false },
  audit_logs: {
    owner: "user_id",
    json: ["metadata"],
    consultation: "optional",
    id: "integer",
    updatedAt: false,
    appendOnly: true,
  },
};

const IDENT = /^[a-z_][a-z0-9_]*$/;

const columnCache = new WeakMap<DatabaseSync, Map<string, Set<string>>>();
function columnsOf(db: DatabaseSync, table: TableName): Set<string> {
  let byTable = columnCache.get(db);
  if (!byTable) columnCache.set(db, (byTable = new Map()));
  let cols = byTable.get(table);
  if (!cols) {
    const info = db.prepare(`pragma table_info(${table})`).all() as { name: string }[];
    cols = new Set(info.map((c) => c.name));
    byTable.set(table, cols);
  }
  return cols;
}

class QueryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Codes d'erreur SQLite étendus -> codes Postgres attendus par l'application. */
function toDbError(e: unknown): DbError {
  if (e instanceof QueryError) return { code: e.code, message: e.message };
  const err = e as { errcode?: number; message?: string };
  const message = err?.message ?? String(e);
  switch (err?.errcode) {
    case 2067: // SQLITE_CONSTRAINT_UNIQUE
    case 1555: // SQLITE_CONSTRAINT_PRIMARYKEY
      return { code: "23505", message };
    case 787: // SQLITE_CONSTRAINT_FOREIGNKEY
      return { code: "23503", message };
    case 275: // SQLITE_CONSTRAINT_CHECK
      return { code: "23514", message };
    case 1299: // SQLITE_CONSTRAINT_NOTNULL
      return { code: "23502", message };
    default:
      return { code: "SQLITE_ERROR", message };
  }
}

type Filter = { sql: string; params: SQLInputValue[] };

function toParam(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string" || typeof value === "bigint") return value;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

function likePattern(raw: string) {
  // * = joker ; les % et _ saisis sont recherchés tels quels.
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "%");
}

export class Query<T extends TableName, D = Row<T>[]> implements PromiseLike<DbResult<D>> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private columns: string[] | null = null;
  private returning = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitCount: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private countMode: { head: boolean } | null = null;
  private values: Record<string, unknown>[] = [];
  private buildError: QueryError | null = null;

  constructor(
    private readonly db: DatabaseSync,
    private readonly table: T,
    private readonly userId: string | null,
  ) {}

  private column(name: string): string {
    const c = name.trim();
    if (!IDENT.test(c) || !columnsOf(this.db, this.table).has(c)) {
      this.buildError ??= new QueryError("42703", `Colonne inconnue : ${this.table}.${c}`);
      return "rowid";
    }
    return `"${c}"`;
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    const list = columns.trim() === "*" ? null : columns.split(",").map((c) => c.trim()).filter(Boolean);
    list?.forEach((c) => this.column(c));
    this.columns = list;
    if (this.op === "select") {
      if (options?.count) this.countMode = { head: Boolean(options.head) };
    } else {
      this.returning = true;
    }
    return this;
  }

  insert(values: InsertRow<T> | InsertRow<T>[]): this {
    this.op = "insert";
    this.values = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[];
    return this;
  }

  update(values: UpdateRow<T>): this {
    this.op = "update";
    this.values = [values as Record<string, unknown>];
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  private where(sql: string, ...params: SQLInputValue[]): this {
    this.filters.push({ sql, params });
    return this;
  }

  eq(column: keyof Row<T> & string, value: unknown) {
    return this.where(`${this.column(column)} = ?`, toParam(value));
  }
  neq(column: keyof Row<T> & string, value: unknown) {
    return this.where(`${this.column(column)} is not ?`, toParam(value));
  }
  lt(column: keyof Row<T> & string, value: unknown) {
    return this.where(`${this.column(column)} < ?`, toParam(value));
  }
  lte(column: keyof Row<T> & string, value: unknown) {
    return this.where(`${this.column(column)} <= ?`, toParam(value));
  }
  gt(column: keyof Row<T> & string, value: unknown) {
    return this.where(`${this.column(column)} > ?`, toParam(value));
  }
  gte(column: keyof Row<T> & string, value: unknown) {
    return this.where(`${this.column(column)} >= ?`, toParam(value));
  }
  in(column: keyof Row<T> & string, values: readonly unknown[]) {
    if (!values.length) return this.where("0");
    return this.where(`${this.column(column)} in (${values.map(() => "?").join(", ")})`, ...values.map(toParam));
  }
  is(column: keyof Row<T> & string, value: null) {
    void value;
    return this.where(`${this.column(column)} is null`);
  }
  not(column: keyof Row<T> & string, operator: "is", value: null) {
    void operator;
    void value;
    return this.where(`${this.column(column)} is not null`);
  }
  ilike(column: keyof Row<T> & string, pattern: string) {
    return this.where(`lower(${this.column(column)}) like lower(?) escape '\\'`, likePattern(pattern));
  }

  /** Disjonction au format « col.op.valeur,col.op.valeur » (op : eq, ilike). */
  or(expression: string): this {
    const parts: string[] = [];
    const params: SQLInputValue[] = [];
    for (const term of expression.split(",")) {
      const m = /^([a-z_]+)\.(eq|ilike)\.(.*)$/.exec(term.trim());
      if (!m) {
        this.buildError ??= new QueryError("PGRST100", `Filtre « or » invalide : ${term}`);
        continue;
      }
      const col = this.column(m[1]);
      if (m[2] === "eq") {
        parts.push(`${col} = ?`);
        params.push(m[3]);
      } else {
        parts.push(`lower(${col}) like lower(?) escape '\\'`);
        params.push(likePattern(m[3]));
      }
    }
    return parts.length ? this.where(`(${parts.join(" or ")})`, ...params) : this;
  }

  order(column: keyof Row<T> & string, options?: { ascending?: boolean }): this {
    this.orders.push(`${this.column(column)} ${options?.ascending === false ? "desc" : "asc"}`);
    return this;
  }

  limit(count: number): this {
    this.limitCount = Math.max(0, Math.floor(count));
    return this;
  }

  single(): Query<T, Row<T>> {
    this.mode = "single";
    return this as unknown as Query<T, Row<T>>;
  }

  maybeSingle(): Query<T, Row<T> | null> {
    this.mode = "maybeSingle";
    return this as unknown as Query<T, Row<T> | null>;
  }

  then<R1 = DbResult<D>, R2 = never>(
    onfulfilled?: ((value: DbResult<D>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    let result: DbResult<D>;
    try {
      result = this.execute();
    } catch (e) {
      const error = toDbError(e);
      if (error.code === "SQLITE_ERROR" || error.code === "42703") console.error(`[db] ${this.table}`, error.message);
      result = { data: null, error, count: null };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  // ---------------------------------------------------------------------------

  private get meta() {
    return META[this.table];
  }

  private ownerFilter(): Filter {
    if (!this.userId) throw new QueryError("42501", "Session absente : accès refusé.");
    return { sql: `"${this.meta.owner}" = ?`, params: [this.userId] };
  }

  private whereClause(): { sql: string; params: SQLInputValue[] } {
    const all = [this.ownerFilter(), ...this.filters];
    return { sql: ` where ${all.map((f) => f.sql).join(" and ")}`, params: all.flatMap((f) => f.params) };
  }

  private decode(raw: Record<string, unknown>): Record<string, unknown> {
    const row: Record<string, unknown> = { ...raw };
    for (const col of this.meta.json) {
      if (typeof row[col] === "string") {
        try {
          row[col] = JSON.parse(row[col] as string);
        } catch {
          // Valeur non JSON : laissée telle quelle.
        }
      }
    }
    return row;
  }

  private project(rows: Record<string, unknown>[]) {
    const cols = this.columns;
    const decoded = rows.map((r) => this.decode(r));
    if (!cols) return decoded;
    return decoded.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  }

  private shape(rows: Record<string, unknown>[] | null, count: number | null): DbResult<D> {
    if (rows === null) return { data: null as D, error: null, count };
    if (this.mode === "many") return { data: rows as D, error: null, count };
    if (rows.length > 1 || (this.mode === "single" && rows.length === 0)) {
      throw new QueryError("PGRST116", `Une seule ligne attendue, ${rows.length} trouvée(s).`);
    }
    return { data: (rows[0] ?? null) as D, error: null, count };
  }

  private assertConsultation(consultationId: unknown) {
    if (consultationId === undefined) return;
    if (consultationId === null) {
      if (this.meta.consultation === "required") throw new QueryError("23502", "consultation_id requis.");
      return;
    }
    const owned = this.db
      .prepare("select 1 from consultations where id = ? and user_id = ?")
      .get(String(consultationId), this.userId);
    if (!owned) throw new QueryError("42501", "Consultation introuvable pour cet utilisateur.");
  }

  private encodeValues(values: Record<string, unknown>) {
    const entries: [string, SQLInputValue][] = [];
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const col = this.column(key);
      const param = this.meta.json.includes(key) ? (value === null ? null : JSON.stringify(value)) : toParam(value);
      entries.push([col, param]);
    }
    return entries;
  }

  private execute(): DbResult<D> {
    if (this.buildError) throw this.buildError;
    const { meta, table } = this;
    const now = new Date().toISOString();
    const order = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
    const limit = this.limitCount !== null ? ` limit ${this.limitCount}` : "";

    if (this.op === "select") {
      const where = this.whereClause();
      let count: number | null = null;
      if (this.countMode) {
        const c = this.db.prepare(`select count(*) as n from "${table}"${where.sql}`).get(...where.params) as { n: number };
        count = Number(c.n);
        if (this.countMode.head) return { data: null as D, error: null, count };
      }
      const rows = this.db.prepare(`select * from "${table}"${where.sql}${order}${limit}`).all(...where.params);
      return this.shape(this.project(rows as Record<string, unknown>[]), count);
    }

    if (this.op === "insert") {
      this.ownerFilter();
      const inserted: Record<string, unknown>[] = [];
      this.db.exec("savepoint q_insert");
      try {
        for (const input of this.values) {
          const values: Record<string, unknown> = { ...input };
          const owner = values[meta.owner];
          if (owner !== undefined && owner !== this.userId) {
            throw new QueryError("42501", "Impossible de créer une ligne pour un autre utilisateur.");
          }
          values[meta.owner] = this.userId;
          if (meta.consultation !== "none") this.assertConsultation(values.consultation_id);
          if (meta.id === "uuid" && values.id === undefined) values.id = crypto.randomUUID();
          if (values.created_at === undefined) values.created_at = now;
          if (meta.updatedAt && values.updated_at === undefined) values.updated_at = now;
          if (table === "consultations" && values.consultation_date === undefined) values.consultation_date = now;
          const entries = this.encodeValues(values);
          if (this.buildError) throw this.buildError;
          const sql = `insert into "${table}" (${entries.map(([c]) => c).join(", ")}) values (${entries
            .map(() => "?")
            .join(", ")}) returning *`;
          inserted.push(this.db.prepare(sql).get(...entries.map(([, v]) => v)) as Record<string, unknown>);
        }
        this.db.exec("release q_insert");
      } catch (e) {
        this.db.exec("rollback to q_insert");
        this.db.exec("release q_insert");
        throw e;
      }
      return this.shape(this.returning ? this.project(inserted) : null, null);
    }

    if (meta.appendOnly) throw new QueryError("42501", `La table ${table} est en ajout seul.`);

    if (this.op === "update") {
      const values: Record<string, unknown> = { ...this.values[0] };
      if (values[meta.owner] !== undefined && values[meta.owner] !== this.userId) {
        throw new QueryError("42501", "Le propriétaire d'une ligne ne peut pas changer.");
      }
      delete values[meta.owner];
      if (meta.consultation !== "none") this.assertConsultation(values.consultation_id);
      if (meta.updatedAt) values.updated_at = now;
      const entries = this.encodeValues(values);
      if (this.buildError) throw this.buildError;
      const where = this.whereClause();
      const rows = this.db
        .prepare(`update "${table}" set ${entries.map(([c]) => `${c} = ?`).join(", ")}${where.sql} returning *`)
        .all(...entries.map(([, v]) => v), ...where.params);
      return this.shape(this.returning ? this.project(rows as Record<string, unknown>[]) : null, null);
    }

    const where = this.whereClause();
    const rows = this.db.prepare(`delete from "${table}"${where.sql} returning *`).all(...where.params);
    return this.shape(this.returning ? this.project(rows as Record<string, unknown>[]) : null, null);
  }
}
