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

app.listen(process.env.PORT || "3000", async () => {});
