import { Outlet, useLocation } from "@remix-run/react";

import { Login } from "~/components/login";
import { useOptionalUser } from "~/utils";

export default function Auth() {
  const user = useOptionalUser();
  const location = useLocation();

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
