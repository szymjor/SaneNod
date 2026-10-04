"use client";
import { useEffect } from "react";
import Link from "next/link";
import { authClient } from "@sanenod/auth/client";
import { Pairing } from "./pairing";
export function ClaimGate() {
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    if (location.hash) {
      sessionStorage.setItem("sanenod-pair-token", location.hash.slice(1));
      history.replaceState(null, "", location.pathname);
    }
  }, []);
  if (isPending) return <p role="status">Sprawdzanie konta…</p>;
  if (!session)
    return (
      <>
        <p>
          Zaloguj się na to samo konto co komputer. Kod połączenia zostanie
          zachowany na tym urządzeniu.
        </p>
        <Link className="button" href="/auth?next=/pair/claim">
          Zaloguj telefon
        </Link>
      </>
    );
  return <Pairing claim />;
}
