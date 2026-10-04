export function safeNext(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\x00-\x20]/.test(value)
  )
    return "/dashboard";
  return value;
}
export function pairingUrl(origin: string, token: string): string {
  const url = new URL("/pair/claim", origin);
  url.hash = token;
  return url.toString();
}
