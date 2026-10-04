import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function Panel({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`panel ${className}`} {...props} />;
}
