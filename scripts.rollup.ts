import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";

export default defineConfig({
  input: ["scripts/deploy-commands.ts"],
  output: {
    dir: "scripts-dist",
    format: "cjs",
  },

  plugins: [typescript({ tsconfig: "scripts-tsconfig.json" })],
});
