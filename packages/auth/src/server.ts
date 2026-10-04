import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
let instance: ReturnType<typeof createAuth> | undefined;
let connectionPool: Pool | undefined;
export function testAccountsEnabled(): boolean {
  return process.env.AUTH_TEST_MODE === "true";
}
export function authOrigin(): string | undefined {
  return (
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  );
}
export function configured(): boolean {
  return Boolean(
    process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && authOrigin(),
  );
}
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!connectionPool) {
    // TLS is configured in the provider-issued URL; never disable certificate validation.
    connectionPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    if (process.env.VERCEL) attachDatabasePool(connectionPool);
  }
  return connectionPool;
}
export function auth() {
  if (!configured()) throw new Error("Account service is not configured");
  if (process.env.BETTER_AUTH_SECRET!.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  if (!instance) instance = createAuth();
  return instance;
}
function createAuth() {
  return betterAuth({
    database: pool(),
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: authOrigin()!,
    trustedOrigins: [authOrigin()!],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification:
        process.env.NODE_ENV === "production" && !testAccountsEnabled(),
    },
    emailVerification: {
      sendOnSignUp: !testAccountsEnabled(),
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        if (process.env.NODE_ENV !== "production" || testAccountsEnabled())
          return;
        if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM)
          throw new Error("Production email delivery is not configured");
        const result = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.AUTH_EMAIL_FROM,
            to: [user.email],
            subject: "Potwierdź konto SaneNod",
            text: `Potwierdź swój adres e-mail: ${url}`,
          }),
        });
        if (!result.ok)
          throw new Error(`Email delivery failed (${result.status})`);
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: {
      cookiePrefix: "sanenod",
      useSecureCookies: authOrigin()!.startsWith("https://"),
    },
    plugins: [nextCookies()],
  });
}
