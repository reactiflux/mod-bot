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
        className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:bg-blue-400"
        {...props}
        type="submit"
      >
        {children}
      </button>
    </Form>
  );
}
