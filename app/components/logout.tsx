import { Form } from "@remix-run/react";
import type { ButtonHTMLAttributes } from "react";

interface LoginProps extends ButtonHTMLAttributes<Element> {
  errors?: { [k: string]: string };
  redirectTo?: string;
}

export function Logout({
  children = "Log out",
  errors,
  redirectTo,
  ...props
}: LoginProps) {
  return (
    <Form method="post" action="/logout" className="space-y-6">
      <button
        type="submit"
        {...props}
        className="w-full rounded bg-blue-500  px-4 py-2 text-white hover:bg-blue-600 focus:bg-blue-400"
      >
        {children}
      </button>
    </Form>
  );
}
