"use client";
import { useState } from "react";
import { Button } from "@sanenod/ui";
import { authClient } from "@sanenod/auth/client";
export function AuthForm({
  register,
  next,
}: {
  register: boolean;
  next: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    try {
      const result = register
        ? await authClient.signUp.email({
            email,
            password,
            name: String(data.get("name")),
            callbackURL: next,
          })
        : await authClient.signIn.email({ email, password, callbackURL: next });
      if (result.error)
        setMessage(
          "Nie udało się zalogować lub utworzyć konta. Sprawdź dane i potwierdzenie adresu e-mail.",
        );
      else if (register && !result.data?.token)
        setMessage(
          "Sprawdź skrzynkę e-mail i potwierdź konto. Następnie zaloguj się.",
        );
      else window.location.assign(next);
    } catch {
      setMessage("Usługa kont jest chwilowo niedostępna. Spróbuj ponownie.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {register && (
        <>
          <label htmlFor="name">Twoje imię</label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            maxLength={80}
            required
          />
        </>
      )}
      <label htmlFor="email">Adres e-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
      />
      <label htmlFor="password">Hasło</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={register ? "new-password" : "current-password"}
        minLength={12}
        maxLength={128}
        required
      />
      <p className="muted">Minimum 12 znaków.</p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <Button disabled={pending}>
        {pending ? "Chwila…" : register ? "Utwórz konto" : "Zaloguj się"}
      </Button>
    </form>
  );
}
