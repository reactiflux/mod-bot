import type { RouteConfig } from "@react-router/dev/routes";
import { route, layout } from "@react-router/dev/routes";

export default [
  layout("routes/__auth.tsx", [
    route(":guildId/sh", "routes/__auth/dashboard.tsx"),
    route(":guildId/sh/:userId", "routes/sh-user.tsx"),
    route("login", "routes/__auth/login.tsx"),
    route("test", "routes/__auth/test.tsx"),
  ]),
  route("auth", "routes/auth.tsx"),
  route("discord-oauth", "routes/discord-oauth.tsx"),
  route("healthcheck", "routes/healthcheck.tsx"),
  route("/", "routes/index.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
