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

  // Web push (VAPID). The public key is also read by the browser, hence the
  // NEXT_PUBLIC_ name. Absent, browsers simply get no notifications.
  vapidPublicKey: () => optional("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  vapidPrivateKey: () => optional("VAPID_PRIVATE_KEY"),
  /** A mailto: or https: contact that push services can reach. */
  vapidSubject: () => optional("VAPID_SUBJECT") ?? "mailto:shivvyas0209@gmail.com",
};
