import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { initOauthLogin } from "~/models/session.server";
import { Login } from "~/components/login";

export const loader: LoaderFunction = async ({ request }) => {
  return redirect("/");
};

export const action: ActionFunction = async ({ request }) => {
  // fetch user from db
  // if doesn't exist, create it with discord ID + email
  const form = await request.formData();

  return initOauthLogin({
    request,
    redirectTo: form.get("redirectTo")?.toString() ?? undefined,
  });
};

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md px-8">
        <Login redirectTo="/dashboard" />;
      </div>
    </div>
  );
}
