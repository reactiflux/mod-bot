import type { ButtonHTMLAttributes } from "react";
import { Form } from "react-router";

type LoginProps = ButtonHTMLAttributes<Element>;

export function Logout({ children = "Log out", ...props }: LoginProps) {
  return (
    <Form method="post" action="/logout" className="space-y-6">
      <button
        type="submit"
        {...props}
        className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:bg-blue-400"
      >
        {children}
      </button>
    </Form>
  );
}
