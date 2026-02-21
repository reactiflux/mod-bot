import type { ButtonHTMLAttributes } from "react";
import { Form } from "react-router";

interface LoginProps extends ButtonHTMLAttributes<Element> {
  errors?: Record<string, string>;
  redirectTo?: string;
}

export function Login({
  children = "Log in with Discord",
  // errors,
  redirectTo,
  ...props
}: LoginProps) {
  return (
    <Form method="post" className="space-y-6" action="/auth">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        className="bg-accent-strong w-full rounded px-4 py-2 text-white hover:bg-amber-700 focus:bg-amber-500"
        {...props}
        type="submit"
      >
        {children}
      </button>
    </Form>
  );
}
