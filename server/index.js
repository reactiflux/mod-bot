const express = require("express");
const { createRequestHandler } = require("@remix-run/express");
const path = require("path");

const app = express();

app.use(express.static(path.join(__dirname, "..", "public")));

// needs to handle all verbs (GET, POST, etc.)
app.all(
  "*",
  createRequestHandler({
    // `remix build` and `remix dev` output files to a build directory, you need
    // to pass that build to the request handler
    build: require("../build/index.js"),

    // return anything you want here to be available as `context` in your
    // loaders and actions. This is where you can bridge the gap between Remix
    // and your server
    getLoadContext(req, res) {
      return {};
    },
  }),
);

app.listen(process.env.PORT || "3000");
