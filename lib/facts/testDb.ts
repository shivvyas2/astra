/**
 * A stand-in for a Supabase client in tests: every query builder method
 * chains, and awaiting the chain yields whatever `respond` returns for that
 * call. Records each chain so a test can assert what was written.
 */
export type Call = { table: string; ops: { op: string; args: unknown[] }[] };

export function fakeDb(respond: (call: Call) => { data?: unknown; error?: unknown } | Promise<never>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              try {
                Promise.resolve(respond(call)).then(
                  (r) => resolve({ data: null, error: null, ...(r as object) }),
                  reject,
                );
              } catch (err) {
                reject(err);
              }
            };
          }
          return (...args: unknown[]) => {
            call.ops.push({ op: String(prop), args });
            return proxy;
          };
        },
      };
      const proxy = new Proxy(chain, handler);
      return proxy;
    },
  };
  return { db: db as never, calls };
}
