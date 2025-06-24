import type { Route } from "./+types/__auth";
import { Outlet, useLocation, type LoaderFunctionArgs } from "react-router";
import { Login } from "#~/basics/login";
import { isProd } from "#~/helpers/env.server";
import { getUser } from "#~/models/session.server";
import { useOptionalUser } from "#~/utils";

export async function loader({ request }: LoaderFunctionArgs) {
  return { user: await getUser(request), isProd: isProd() };
}

export default function Auth({ loaderData }: Route.ComponentProps) {
  const user = useOptionalUser();
  const location = useLocation();

  if (loaderData.isProd) {
    return <div>nope</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-full flex-col justify-center">
        <div className="mx-auto w-full max-w-md px-8">
          <Login redirectTo={location.pathname} />
        </div>
      </div>
    );
  }

  return <Outlet />;
}
