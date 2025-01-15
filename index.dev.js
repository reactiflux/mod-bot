import "dotenv/config";
import * as vite from "vite";
import express from "express";

const app = express();

/**
Route handlers and static hosting
*/

console.log("Starting development server");
const viteDevServer = await vite.createServer({
  server: { middlewareMode: true },
});
app.use(viteDevServer.middlewares);
viteDevServer
  .ssrLoadModule("./app/server.ts")
  .then((source) => {
    app.use(source.app);
  })
  .catch((error) => {
    if (typeof error === "object" && error instanceof Error) {
      viteDevServer.ssrFixStacktrace(error);
    }
    console.log({ error });
  });

const PORT = process.env.PORT || "3000";
app.listen(PORT, async () => {
  console.log("INI", "Now listening on port", PORT);
});
