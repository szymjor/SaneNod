import { betterAuth } from "better-auth";
import { Pool } from "pg";
export async function testUser(email, password) {
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  )
    throw new Error("Test users require an isolated local database.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const auth = betterAuth({
      database: pool,
      baseURL: "http://localhost:3000",
      secret: process.env.BETTER_AUTH_SECRET,
      emailAndPassword: { enabled: true, minPasswordLength: 12 },
      rateLimit: { enabled: false },
    });
    const user = await auth.api.signUpEmail({
      body: { email, password, name: "Test user" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
      user.user.id,
    ]);
    return user.user.id;
  } finally {
    await pool.end();
  }
}
