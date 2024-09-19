import json from "@rollup/plugin-json";
import typescript from "@rollup/plugin-typescript";

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: "index.js",
        format: "es",
      },
      {
        file: "index.cjs",
        format: "cjs",
      },
    ],
    plugins: [
      json(),
      typescript({
        tsconfig: "tsconfig.node.json",
      }),
    ],
  },
  {
    input: "src/polyfill.ts",
    output: [
      {
        file: "polyfill.js",
        format: "es",
      },
      {
        file: "polyfill.cjs",
        format: "cjs",
      },
    ],
    plugins: [
      typescript({
        tsconfig: "tsconfig.dom.json",
      }),
    ],
  },
];
