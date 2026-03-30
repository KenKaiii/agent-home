export interface Env {
  Bindings: {
    DB: D1Database;
    RELAY_ROOM: DurableObjectNamespace;
    JWT_SECRET: string;
    /** Set via `wrangler secret put PROVISIONING_SECRET` — never commit an actual value */
    PROVISIONING_SECRET: string;
  };
}
