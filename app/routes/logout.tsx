import type { ActionFunctionArgs } from "react-router";

import { logout } from "#~/models/session.server";

export async function action({ request }: ActionFunctionArgs) {
  return await logout(request);
}

export default function Logout() {
  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md px-8">
        <Logout />
      </div>
    </div>
  );
}
