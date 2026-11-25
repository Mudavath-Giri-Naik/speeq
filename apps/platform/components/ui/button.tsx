import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
/** Accessible form submit button. */
export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="submit" className={cn("button", className)} {...props} />;
}
