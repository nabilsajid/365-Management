// A minimal stand-in for the Supabase query builder. Every chained call is
// recorded, and awaiting the chain resolves with the next queued result.

export type Call = [method: string, ...args: unknown[]];
export type Result = { data: unknown; error: { code?: string; message: string } | null };

export function fakeSupabase(results: Result[] = []) {
  const calls: Call[] = [];
  const queue = [...results];

  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (resolve: (value: Result) => void) => resolve(queue.shift() ?? { data: null, error: null });
        }
        return (...args: unknown[]) => {
          calls.push([String(property), ...args]);
          return builder;
        };
      },
    },
  );

  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return builder;
    },
    rpc(name: string, args: unknown) {
      calls.push(['rpc', name, args]);
      return builder;
    },
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: client as any,
    calls,
    called: (method: string) => calls.filter(([name]) => name === method),
  };
}
