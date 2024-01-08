import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandInput,
  type PutObjectCommandInput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { createFilter, type FilterPattern } from "@rollup/pluginutils";
import OSS from "ali-oss";
import chalk from "chalk";
import { fileTypeFromBuffer } from "file-type";
import imageminjs, { type Plugin as ImageminPlugin } from "imagemin";
import imageminGifsicle from "imagemin-gifsicle";
import imageminJpegtran from "imagemin-jpegtran";
import imageminMozjpeg from "imagemin-mozjpeg";
import imageminOptipng from "imagemin-optipng";
import imageminPngquant, {
  type Options as ImageminPngquantOptions,
} from "imagemin-pngquant";
import imageminSvgo, {
  type Options as ImageminSvgoOptions,
} from "imagemin-svgo";
import imageminWebp, {
  type Options as ImageminWebpOptions,
} from "imagemin-webp";
import { defaultsDeep } from "lodash-es";
import { basename } from "node:path";
import postcss from "postcss";
import { type Plugin } from "vite";
import webpInCssPlugin from "webp-in-css/plugin.js";

interface LosslessOptions {
  type?: "asset" | "public";

  include?: FilterPattern;
  exclude?: FilterPattern;

  progressive?: boolean;
  interlaced?: boolean;

  gifsicle?: boolean | imageminGifsicle.Options;
  jpegtran?: boolean | imageminJpegtran.Options;
  optipng?: boolean | imageminOptipng.Options;
  svgo?: boolean | ImageminSvgoOptions;
  webp?: boolean | ImageminWebpOptions;
}

interface LossyOptions {
  type?: "asset" | "public";

  include?: FilterPattern;
  exclude?: FilterPattern;

  quality?: number;
  progressive?: boolean;
  interlaced?: boolean;

  gifsicle?: boolean | imageminGifsicle.Options;
  mozjpeg?: boolean | imageminMozjpeg.Options;
  pngquant?: boolean | ImageminPngquantOptions;
  svgo?: boolean | ImageminSvgoOptions;
  webp?: boolean | ImageminWebpOptions;
}

interface S3Options {
  baseURL?: string;
  dir: string;
  client: S3ClientConfig;
  head: Omit<HeadObjectCommandInput, "Key">;
  put: Omit<PutObjectCommandInput, "Key" | "Body">;
}

interface OSSOptions {
  baseURL?: string;
  dir: string;
  client: OSS.Options;
  head?: OSS.HeadObjectOptions;
  put?: OSS.PutObjectOptions;
}

interface Options {
  mode?: string;

  lossless?: LosslessOptions;
  lossy?: LossyOptions;

  s3?: S3Options;
  oss?: OSSOptions;
}

const getDefaultOptions = (): Options => ({
  mode: "production",
  lossless: {
    type: "public",
    include: /\.(jpe?g|png|gif|svg)$/i,
    progressive: true,
    interlaced: true,
    gifsicle: true,
    jpegtran: true,
    optipng: true,
    svgo: true,
    webp: true,
  },
  lossy: {
    type: "asset",
    include: /\.(jpe?g|png|gif|svg)$/i,
    quality: 80,
    progressive: true,
    interlaced: true,
    gifsicle: true,
    mozjpeg: true,
    pngquant: true,
    svgo: true,
    webp: true,
  },
});

const urlRE = /^(https?:)?\/\/.+/i;
function isURL(url: string) {
  return urlRE.test(url);
}

const postfixRE = /[?#].*$/s;
function cleanUrl(url: string) {
  return url.replace(postfixRE, "");
}

function joinURL(base: string, ...paths: Array<string | undefined | null>) {
  return paths.reduce((url: string, path) => {
    if (!path) return url;
    return url.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
  }, base);
}

function getPlugins(
  filename: string,
  options: Options,
  compressionType: "lossless" | "lossy"
) {
  const plugins: ImageminPlugin[] = [];

  const opts = options[compressionType];

  if (/\.svg$/i.test(filename) && opts?.svgo) {
    plugins.push(imageminSvgo(defaultsDeep({}, opts.svgo)));
  }

  if (/\.gif$/i.test(filename) && opts?.gifsicle) {
    plugins.push(
      imageminGifsicle(
        defaultsDeep({}, opts.gifsicle, {
          optimizationLevel: 3,
          interlaced: !!opts.interlaced,
        })
      )
    );
  }

  if (compressionType === "lossless") {
    const losslessOptions = options.lossless;

    if (/\.jpe?g$/i.test(filename) && losslessOptions?.jpegtran) {
      plugins.push(
        imageminJpegtran(
          defaultsDeep({}, losslessOptions.jpegtran, {
            progressive: !!losslessOptions.progressive,
          })
        )
      );
    }

    if (/\.png$/i.test(filename) && losslessOptions?.optipng) {
      plugins.push(
        imageminOptipng(
          defaultsDeep({}, losslessOptions.optipng, {
            optimizationLevel: 7,
            interlaced: !!losslessOptions.interlaced,
          })
        )
      );
    }

    if (losslessOptions?.webp) {
      plugins.push(
        imageminWebp(
          defaultsDeep({}, losslessOptions.webp, {
            lossless: 9,
          })
        )
      );
    }
  }

  if (compressionType === "lossy") {
    const lossyOptions = options.lossy;

    if (/\.jpe?g$/i.test(filename) && lossyOptions?.mozjpeg) {
      plugins.push(
        imageminMozjpeg(
          defaultsDeep(
            {},
            lossyOptions.mozjpeg,
            { progressive: !!lossyOptions.progressive },
            lossyOptions.quality ? { quality: lossyOptions.quality } : {}
          )
        )
      );
    }

    if (/\.png$/i.test(filename) && lossyOptions?.pngquant) {
      plugins.push(
        imageminPngquant(
          defaultsDeep(
            {},
            lossyOptions.pngquant,
            { speed: 1 },
            lossyOptions.quality
              ? { quality: [lossyOptions.quality / 100, 1] }
              : {}
          )
        )
      );
    }

    if (lossyOptions?.webp) {
      plugins.push(
        imageminWebp(
          defaultsDeep(
            {},
            lossyOptions.webp,
            { method: 6 },
            lossyOptions.quality ? { quality: lossyOptions.quality } : {}
          )
        )
      );
    }
  }
  return plugins;
}

let s3Client: S3Client;
let ossClient: OSS;
function upload(filebasename: string, buffer: Buffer, options: Options) {
  if (options.s3) {
    const opts = options.s3;

    if (!s3Client) {
      s3Client = new S3Client(opts.client);
    }

    const filename = joinURL(opts.dir, filebasename);

    s3Client
      .send(
        new HeadObjectCommand({
          ...opts.head,
          Key: filename,
        })
      )
      .catch((error) => {
        if (error.name === "NotFound") {
          s3Client
            .send(
              new PutObjectCommand({
                ...opts.put,
                Key: filename,
                Body: buffer,
              })
            )
            .then(() => {
              console.log(
                "\n[vite:imagemin-upload] " +
                  chalk.green(
                    `${filebasename} has been successfully uploaded to S3.`
                  )
              );
            })
            .catch((error) => {
              console.log(
                "\n[vite:imagemin-upload] " +
                  chalk.red(`${filebasename} failed to upload to S3.`) +
                  "\n[vite:imagemin-upload] " +
                  chalk.red(error.message)
              );
            });
        } else {
          console.log(
            "\n[vite:imagemin-upload] " +
              chalk.red(
                `Failed to query the existence of ${filebasename} from S3.`
              ) +
              "\n[vite:imagemin-upload] " +
              chalk.red(error.message)
          );
        }
      });
  }

  if (options.oss) {
    const opts = options.oss;

    if (!ossClient) {
      ossClient = new OSS(opts.client);
    }

    const filename = joinURL(opts.dir, filebasename);

    ossClient.head(filename, opts.head).catch((error) => {
      if (error.code === "NoSuchKey") {
        ossClient
          .put(filename, buffer, opts.put)
          .then(() => {
            console.log(
              "\n[vite:imagemin-upload] " +
                chalk.green(
                  `${filebasename} has been successfully uploaded to OSS.`
                )
            );
          })
          .catch((error) => {
            console.log(
              "\n[vite:imagemin-upload] " +
                chalk.red(`${filebasename} failed to upload to OSS.`) +
                "\n[vite:imagemin-upload] " +
                chalk.red(error.message)
            );
          });
      } else {
        console.log(
          "\n[vite:imagemin-upload] " +
            chalk.red(
              `Failed to query the existence of ${filebasename} from OSS.`
            ) +
            "\n[vite:imagemin-upload] " +
            chalk.red(error.message)
        );
      }
    });
  }
}

const assets = {
  lossless: new Set<string>(),
  lossy: new Set<string>(),
};

export function imageminUpload(userOptions: Options = {}): Plugin {
  const options: Options = defaultsDeep({}, userOptions, getDefaultOptions());

  if (options.s3?.baseURL && options.oss?.baseURL) {
    throw new Error(
      "When setting up S3 and OSS simultaneously, only one baseURL is allowed!"
    );
  }

  const { baseURL, dir } = options.s3?.baseURL ? options.s3 : options.oss || {};
  if (baseURL && !isURL(baseURL)) {
    throw new Error(`The format of baseURL is incorrect.`);
  }

  const filter = {
    lossless: createFilter(
      options.lossless?.include,
      options.lossless?.exclude
    ),
    lossy: createFilter(options.lossy?.include, options.lossy?.exclude),
  };

  let enabled = false;

  return {
    name: "vite:imagemin-upload",
    apply: "build",
    config(config, { mode }) {
      if (mode === options.mode) {
        if (!config.experimental) config.experimental = {};

        const renderBuiltUrl = config.experimental.renderBuiltUrl;

        config.experimental.renderBuiltUrl = function (
          filename,
          { type, hostId, hostType, ssr }
        ) {
          const filepath = cleanUrl(filename);

          const compressionType = (["lossless", "lossy"] as const).find(
            (compressionType) =>
              type === options[compressionType]?.type &&
              filter[compressionType](filepath)
          );

          if (compressionType) {
            enabled = true;

            assets[compressionType].add(filepath);

            let url = baseURL ? joinURL(baseURL, dir, filename) : filename;

            if (options[compressionType]?.webp && !/\.webp$/.test(filepath)) {
              return url.replace(
                /^([^#?]+\.)(jpe?g|png|gif|svg)(\?[^#]*)?(#.*)?$/i,
                (match, p1, p2, p3, p4) => {
                  if (hostType === "js") {
                    return `${p1}webp${
                      p3?.length > 1 ? p3 + "&" : "?"
                    }from-format=${p2}${p4 || ""}`;
                  }
                  return `${p1}${p2}${
                    p3?.length > 1 ? p3 + "&" : "?"
                  }to-format=webp${p4 || ""}`;
                }
              );
            }

            if (baseURL) {
              return url;
            }
          }

          if (renderBuiltUrl) {
            return renderBuiltUrl(filename, {
              type,
              hostId,
              hostType,
              ssr,
            });
          }
        };
      }
    },
    generateBundle: {
      order: "post",
      async handler(outputOptions, bundle) {
        if (!enabled) return;

        for (const [filename, file] of Object.entries(bundle)) {
          if (file.type !== "asset") continue;

          if (/\.css$/.test(filename)) {
            delete bundle[filename];

            this.emitFile({
              type: "asset",
              fileName: filename,
              source: postcss([
                webpInCssPlugin({
                  check: (decl) =>
                    /^[^#?]+\.(jpe?g|png|gif|svg)\?([^#]*&)?to-format=webp([&#].*)?$/i.test(
                      decl.value
                    ),
                }),
              ]).process(file.source).css,
            });

            continue;
          }

          if (/\.html?$/.test(filename)) {
            delete bundle[filename];

            this.emitFile({
              type: "asset",
              fileName: filename,
              source: (file.source as string).replace(
                /<\/head>/i,
                `<script>replace-polyfill</script></head>`
              ),
            });

            continue;
          }

          for (const compressionType of ["lossless", "lossy"] as const) {
            if (!assets[compressionType].has(filename)) {
              continue;
            }

            if (!(file.source instanceof Uint8Array)) {
              console.log(
                "\n[vite:imagemin-upload] " +
                  chalk.red(`Compression of ${filename} failed.`) +
                  "\n[vite:imagemin-upload] " +
                  chalk.red(`${filename} is not a Uint8Array`)
              );
            }

            const buffer = Buffer.from(file.source);
            const size = buffer.byteLength;

            await Promise.all(
              getPlugins(filename, options, compressionType).map(
                async (plugin) => {
                  try {
                    const newBuffer = await imageminjs.buffer(buffer, {
                      plugins: [plugin],
                    });
                    const newSize = newBuffer.byteLength;

                    const fileTypeResult = await fileTypeFromBuffer(newBuffer);

                    if (!fileTypeResult)
                      throw new Error(
                        `Cannot retrieve the file type of ${filename}.`
                      );

                    const newFilename = filename.replace(
                      /\.[^.]+$/g,
                      "." + fileTypeResult.ext
                    );

                    const filebasename = basename(filename);
                    const newFilebasename = basename(newFilename);

                    console.log(
                      "\n[vite:imagemin-upload] " + filebasename,
                      size,
                      newFilebasename,
                      size <= newSize ? chalk.red(newSize) : newSize
                    );

                    upload(newFilebasename, newBuffer, options);

                    if (filename === newFilename) {
                      delete bundle[filename];
                    }

                    if (!baseURL) {
                      this.emitFile({
                        type: "asset",
                        fileName: newFilename,
                        source: newBuffer,
                      });
                    }
                  } catch (error) {
                    console.log(
                      "\n[vite:imagemin-upload] " +
                        chalk.red(`Compression of ${filename} failed.`) +
                        "\n[vite:imagemin-upload] " +
                        chalk.red(error.message)
                    );
                  }
                }
              )
            );
          }
        }
      },
    },
  };
}
