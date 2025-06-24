import type { Route } from "./+types/auth";
import { redirect } from "react-router";

import { initOauthLogin } from "#~/models/session.server";
import { Login } from "#~/basics/login";

// eslint-disable-next-line no-empty-pattern
export async function loader({}: Route.LoaderArgs) {
  return redirect("/");
}

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md px-8">
        <Login redirectTo="/dashboard" />;
      </div>
    </div>
  );
}

export async function action({ request }: Route.ActionArgs) {
  // fetch user from db
  // if doesn't exist, create it with discord ID + email
  const form = await request.formData();

  return initOauthLogin({
    request,
    redirectTo: form.get("redirectTo")?.toString() ?? undefined,
  });
}
