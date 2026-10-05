/**
 * An in-memory stand-in for the service-role Supabase client, for admin
 * tests: tables are arrays of rows, the filters the admin uses (eq, gte, in,
 * order, range, limit, maybeSingle, head counts) are applied for real, and a
 * table listed in `missing` answers like a database without that migration.
 */
type Row = Record<string, unknown>;

export function memoryDb(opts: {
  tables?: Record<string, Row[]>;
  missing?: string[];
  users?: Row[];
  authFails?: boolean;
}) {
  const tables = opts.tables ?? {};
  const missing = new Set(opts.missing ?? []);
  const users = opts.users ?? [];

  function query(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false;
    let single = false;
    let range: [number, number] | null = null;
    let order: { col: string; asc: boolean } | null = null;
    let columns = "*";
    const chain: Record<string, unknown> = {
      select(cols: string, o?: { head?: boolean }) {
        columns = cols;
        head = !!o?.head;
        return chain;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return chain;
      },
      gte(col: string, v: string) {
        filters.push((r) => String(r[col] ?? "") >= v);
        return chain;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return chain;
      },
      order(col: string, o?: { ascending?: boolean }) {
        order = { col, asc: o?.ascending !== false };
        return chain;
      },
      range(a: number, b: number) {
        range = [a, b];
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle() {
        single = true;
        return chain;
      },
      insert() {
        return chain;
      },
      then(resolve: (v: unknown) => void) {
        if (missing.has(table)) {
          resolve({ data: null, count: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } });
          return;
        }
        const cols = columns.split(",").map((c) => c.trim());
        const absent = cols.find((c) => c !== "*" && missing.has(`${table}.${c}`));
        if (absent) {
          resolve({ data: null, error: { code: "42703", message: `column ${table}.${absent} does not exist` } });
          return;
        }
        let out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (order) {
          const { col, asc } = order;
          out = [...out].sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        if (head) return resolve({ data: null, count: out.length, error: null });
        if (single) return resolve({ data: out[0] ?? null, error: null });
        if (range) out = out.slice(range[0], range[1] + 1);
        resolve({ data: out, error: null });
      },
    };
    return chain;
  }

  return {
    from: query,
    auth: {
      admin: {
        listUsers: async ({ page, perPage }: { page: number; perPage: number }) =>
          opts.authFails
            ? { data: null, error: { message: "auth down" } }
            : { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null },
        getUserById: async (id: string) =>
          opts.authFails ? { data: null, error: { message: "auth down" } } : { data: { user: users.find((u) => u.id === id) ?? null }, error: null },
      },
    },
  };
}
