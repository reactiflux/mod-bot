import { layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/__auth.tsx", [
    route("app/", "routes/__auth/app.tsx"),
    route("app/:guildId/onboard", "routes/onboard.tsx"),
    route("app/:guildId/settings", "routes/__auth/settings.tsx"),
    route("app/:guildId/sh", "routes/__auth/dashboard.tsx"),
    route("app/:guildId/sh/:userId", "routes/__auth/sh-user.tsx"),
    route("login", "routes/__auth/login.tsx"),
  ]),
  route("auth", "routes/auth.tsx"),
  route("discord-oauth", "routes/discord-oauth.tsx"),
  route("healthcheck", "routes/healthcheck.tsx"),
  route("/", "routes/index.tsx"),
  route("logout", "routes/logout.tsx"),
  route("upgrade", "routes/upgrade.tsx"),
  route("payment/success", "routes/payment.success.tsx"),
  route("payment/cancel", "routes/payment.cancel.tsx"),
] satisfies RouteConfig;
