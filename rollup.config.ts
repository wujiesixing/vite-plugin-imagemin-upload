import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { rollup } from "rollup";

export default {
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
    typescript({
      tsconfig: "tsconfig.node.json",
    }),
    {
      name: "replace-polyfill",
      async generateBundle(outputOptions, bun) {
        let polyfill;

        for (const file of Object.values(bun)) {
          if (file.type !== "chunk") continue;
          if (file.code.includes("replace-polyfill")) {
            if (!polyfill) {
              const bundle = await rollup({
                input: "src/polyfill.ts",
                plugins: [
                  typescript({
                    tsconfig: "tsconfig.dom.json",
                  }),
                  terser(),
                ],
              });

              const { output } = await bundle.generate({
                format: "iife",
              });

              polyfill = output[0].code;
            }

            file.code = file.code.replace("replace-polyfill", polyfill);
          }
        }
      },
    },
  ],
};
