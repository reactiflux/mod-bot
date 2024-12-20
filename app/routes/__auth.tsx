import { Outlet, useLocation } from "@remix-run/react";

import { Login } from "~/components/login";
import { isProd } from "~/helpers/env";
import { getUser } from "~/models/session.server";
import { useOptionalUser } from "~/utils";

export function loader({ request }: { request: Request }) {
  return getUser(request);
}

export default function Auth() {
  const user = useOptionalUser();
  const location = useLocation();

  if (isProd()) {
    return <div>nope</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-full flex-col justify-center">
        <div className="mx-auto w-full max-w-md px-8">
          <Login redirectTo={location.pathname} />;
        </div>
      </div>
    );
  }

  return <Outlet />;
}
