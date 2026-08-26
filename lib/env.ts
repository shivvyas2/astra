import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),

  // Set by Vercel on scheduled invocations as `Authorization: Bearer <secret>`.
  cronSecret: () => optional("CRON_SECRET"),

  // APNs. Absent in local development, where pushes are skipped and alerts are
  // still written to the database.
  apnsKeyId: () => optional("APNS_KEY_ID"),
  apnsTeamId: () => optional("APNS_TEAM_ID"),
  apnsBundleId: () => optional("APNS_BUNDLE_ID"),
  /** Contents of the `.p8` key. Newlines may be escaped when set via the CLI. */
  apnsPrivateKey: () => optional("APNS_PRIVATE_KEY")?.replace(/\\n/g, "\n"),
};
