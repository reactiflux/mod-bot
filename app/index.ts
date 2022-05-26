import express from "express";
import { createRequestHandler } from "@remix-run/express";
import path from "path";
import * as build from "@remix-run/dev/server-build";
import discordBot from "~/discord/gateway";

const app = express();

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/butts", (req, res) => {
  res.send("butts");
});

// needs to handle all verbs (GET, POST, etc.)
app.all(
  "*",
  createRequestHandler({
    // `remix build` and `remix dev` output files to a build directory, you need
    // to pass that build to the request handler
    build,

    // return anything you want here to be available as `context` in your
    // loaders and actions. This is where you can bridge the gap between Remix
    // and your server
    getLoadContext(req, res) {
      return {};
    },
  }),
);

app.listen(process.env.PORT || "3000");

discordBot();
