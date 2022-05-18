import { Outlet } from "@remix-run/react";

import { Login } from "~/components/login";
import { useOptionalUser } from "~/utils";

export default function Auth() {
  const user = useOptionalUser();
  if (!user) {
    return <Login />;
  }

  return <Outlet />;
}
