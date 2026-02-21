import type { ButtonHTMLAttributes } from "react";
import { Form } from "react-router";

type LoginProps = ButtonHTMLAttributes<Element>;

export function Logout({ children = "Log out", ...props }: LoginProps) {
  return (
    <Form method="post" action="/logout" className="space-y-6">
      <button
        type="submit"
        {...props}
        className="bg-accent-strong w-full rounded px-4 py-2 text-white hover:bg-amber-700 focus:bg-amber-500"
      >
        {children}
      </button>
    </Form>
  );
}
