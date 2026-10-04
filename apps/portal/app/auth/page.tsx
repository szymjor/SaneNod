import Link from "next/link";
import { AuthForm } from "../../components/auth-form";
import { configured } from "../../lib/auth";
import { safeNext } from "@sanenod/auth";
export default async function Auth({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
}) {
  const query = await searchParams;
  const register = query.mode === "register";
  const next = safeNext(query.next);
  return (
    <div className="narrow">
      <span className="eyebrow">Konto SaneNod</span>
      <h1>
        {register
          ? "Twoja przestrzeń zaczyna się tutaj."
          : "Dobrze Cię widzieć."}
      </h1>
      <p>Jedno konto dla wszystkich Twoich aplikacji i urządzeń.</p>
      {!configured() ? (
        <p className="notice" role="status">
          Konta będą dostępne po podłączeniu usługi logowania.
        </p>
      ) : (
        <AuthForm register={register} next={next} />
      )}
      {query.error && (
        <p role="alert" className="notice error">
          Link logowania wygasł lub jest nieprawidłowy.
        </p>
      )}
      <p className="muted">
        <Link
          href={`/auth?mode=${register ? "login" : "register"}&next=${encodeURIComponent(next)}`}
        >
          {register
            ? "Masz już konto? Zaloguj się"
            : "Nie masz konta? Zarejestruj się"}
        </Link>
      </p>
    </div>
  );
}
