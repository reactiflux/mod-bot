import type { Route } from "./+types/logout";

import { logout } from "#~/models/session.server";

export default function Logout() {
  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md px-8">
        <Logout />
      </div>
    </div>
  );
}

export async function action({ request }: Route.ActionArgs) {
  return await logout(request);
}
