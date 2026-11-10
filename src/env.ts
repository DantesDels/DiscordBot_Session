// Cloudflare bindings (see config/wrangler.toml).
export interface Env {
  DISCORD_PUBLIC_KEY: string;
  CATALOGUE_KV: KVNamespace;
}
