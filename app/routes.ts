import type { RouteConfig } from "@remix-run/route-config";
import { route, layout } from "@remix-run/route-config";

export default [
  layout("routes/__auth.tsx", [
    route("dashboard", "routes/__auth/dashboard.tsx"),
    route("login", "routes/__auth/login.tsx"),
    route("test", "routes/__auth/test.tsx"),
  ]),
  route("auth", "routes/auth.tsx"),
  route("discord-oauth", "routes/discord-oauth.tsx"),
  route("healthcheck", "routes/healthcheck.tsx"),
  route("/", "routes/index.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
