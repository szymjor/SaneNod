"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, configured } from "../../lib/auth";
export async function signOut() {
  if (configured()) await auth().api.signOut({ headers: await headers() });
  redirect("/auth");
}
