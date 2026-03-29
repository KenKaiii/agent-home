export interface Env {
  Bindings: {
    DB: D1Database;
    RELAY_ROOM: DurableObjectNamespace;
    JWT_SECRET: string;
  };
}
