'use strict';

var clientS3 = require('@aws-sdk/client-s3');
var pluginutils = require('@rollup/pluginutils');
var OSS = require('ali-oss');
var chalk = require('chalk');
var fileType = require('file-type');
var imageminjs = require('imagemin');
var imageminGifsicle = require('imagemin-gifsicle');
var imageminJpegtran = require('imagemin-jpegtran');
var imageminMozjpeg = require('imagemin-mozjpeg');
var imageminOptipng = require('imagemin-optipng');
var imageminPngquant = require('imagemin-pngquant');
var imageminSvgo = require('imagemin-svgo');
var imageminWebp = require('imagemin-webp');
var lodashEs = require('lodash-es');
var node_path = require('node:path');
var postcss = require('postcss');
var webpInCssPlugin = require('webp-in-css/plugin.js');

const getDefaultOptions = () => ({
    mode: "production",
    lossless: {
        type: "public",
        include: /\.(jpe?g|png|gif|svg)$/i,
        progressive: true,
        interlaced: true,
    },
    lossy: {
        type: "asset",
        include: /\.(jpe?g|png|gif|svg)$/i,
        quality: 80,
        progressive: true,
        interlaced: true,
    },
});
const urlRE = /^(https?:)?\/\/.+/i;
function isURL(url) {
    return urlRE.test(url);
}
const postfixRE = /[?#].*$/s;
function cleanUrl(url) {
    return url.replace(postfixRE, "");
}
function joinURL(base, ...paths) {
    return paths.reduce((url, path) => {
        if (!path)
            return url;
        return url.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
    }, base);
}
function getPlugins(filename, options, compressionType) {
    const plugins = [];
    const opts = options[compressionType];
    if (/\.svg$/i.test(filename) && opts?.svgo !== false) {
        plugins.push(imageminSvgo(lodashEs.defaultsDeep({}, opts?.svgo)));
    }
    if (/\.gif$/i.test(filename) && opts?.gifsicle !== false) {
        plugins.push(imageminGifsicle(lodashEs.defaultsDeep({}, opts?.gifsicle, {
            optimizationLevel: 3,
            interlaced: !!opts?.interlaced,
        })));
    }
    if (compressionType === "lossless") {
        const losslessOptions = options.lossless;
        if (/\.jpe?g$/i.test(filename) && losslessOptions?.jpegtran !== false) {
            plugins.push(imageminJpegtran(lodashEs.defaultsDeep({}, losslessOptions?.jpegtran, {
                progressive: !!losslessOptions?.progressive,
            })));
        }
        if (/\.png$/i.test(filename) && losslessOptions?.optipng !== false) {
            plugins.push(imageminOptipng(lodashEs.defaultsDeep({}, losslessOptions?.optipng, {
                optimizationLevel: 7,
                interlaced: !!losslessOptions?.interlaced,
            })));
        }
        if (losslessOptions?.webp) {
            plugins.push(imageminWebp(lodashEs.defaultsDeep({}, losslessOptions?.webp, {
                lossless: 9,
            })));
        }
    }
    if (compressionType === "lossy") {
        const lossyOptions = options.lossy;
        if (/\.jpe?g$/i.test(filename) && lossyOptions?.mozjpeg !== false) {
            plugins.push(imageminMozjpeg(lodashEs.defaultsDeep({}, lossyOptions?.mozjpeg, {
                progressive: !!lossyOptions?.progressive,
            }, lossyOptions?.quality ? { quality: lossyOptions?.quality } : {})));
        }
        if (/\.png$/i.test(filename) && lossyOptions?.pngquant !== false) {
            plugins.push(imageminPngquant(lodashEs.defaultsDeep({}, lossyOptions?.pngquant, {
                speed: 1,
            }, lossyOptions?.quality
                ? {
                    quality: [lossyOptions?.quality / 100, 1],
                }
                : {})));
        }
        if (lossyOptions?.webp) {
            plugins.push(imageminWebp(lodashEs.defaultsDeep({}, lossyOptions?.webp, {
                method: 6,
            }, lossyOptions?.quality ? { quality: lossyOptions?.quality } : {})));
        }
    }
    return plugins;
}
let s3Client;
let ossClient;
function upload(filebasename, buffer, options) {
    if (options.s3) {
        const opts = options.s3;
        if (!s3Client) {
            s3Client = new clientS3.S3Client(opts.client);
        }
        const filename = joinURL(opts.dir, filebasename);
        s3Client
            .send(new clientS3.HeadObjectCommand({
            ...opts.head,
            Key: filename,
        }))
            .catch((error) => {
            if (error.name === "NotFound") {
                s3Client
                    .send(new clientS3.PutObjectCommand({
                    ...opts.put,
                    Key: filename,
                    Body: buffer,
                }))
                    .then(() => {
                    console.log("\n[vite:imagemin-upload] " +
                        chalk.green(`${filebasename} has been successfully uploaded to S3.`));
                })
                    .catch((error) => {
                    console.log("\n[vite:imagemin-upload] " +
                        chalk.red(`${filebasename} failed to upload to S3.`) +
                        "\n[vite:imagemin-upload] " +
                        chalk.red(error.message));
                });
            }
            else {
                console.log("\n[vite:imagemin-upload] " +
                    chalk.red(`Failed to query the existence of ${filebasename} from S3.`) +
                    "\n[vite:imagemin-upload] " +
                    chalk.red(error.message));
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
                    console.log("\n[vite:imagemin-upload] " +
                        chalk.green(`${filebasename} has been successfully uploaded to OSS.`));
                })
                    .catch((error) => {
                    console.log("\n[vite:imagemin-upload] " +
                        chalk.red(`${filebasename} failed to upload to OSS.`) +
                        "\n[vite:imagemin-upload] " +
                        chalk.red(error.message));
                });
            }
            else {
                console.log("\n[vite:imagemin-upload] " +
                    chalk.red(`Failed to query the existence of ${filebasename} from OSS.`) +
                    "\n[vite:imagemin-upload] " +
                    chalk.red(error.message));
            }
        });
    }
}
const assets = {
    lossless: new Set(),
    lossy: new Set(),
};
function imageminUpload(userOptions = {}) {
    const options = lodashEs.defaultsDeep({}, userOptions, getDefaultOptions());
    if (options.s3?.baseURL && options.oss?.baseURL) {
        throw new Error("When setting up S3 and OSS simultaneously, only one baseURL is allowed!");
    }
    const { baseURL, dir } = options.s3?.baseURL ? options.s3 : options.oss || {};
    if (baseURL && !isURL(baseURL)) {
        throw new Error(`The format of baseURL is incorrect.`);
    }
    const filter = {
        lossless: pluginutils.createFilter(options.lossless?.include, options.lossless?.exclude),
        lossy: pluginutils.createFilter(options.lossy?.include, options.lossy?.exclude),
    };
    return {
        name: "vite:imagemin-upload",
        apply: "build",
        config(config, { mode }) {
            if (mode === options.mode) {
                if (!config.experimental)
                    config.experimental = {};
                const renderBuiltUrl = config.experimental.renderBuiltUrl;
                config.experimental.renderBuiltUrl = function (filename, { type, hostId, hostType, ssr }) {
                    const filepath = cleanUrl(filename);
                    const compressionType = ["lossless", "lossy"].find((compressionType) => type === options[compressionType]?.type &&
                        filter[compressionType](filepath));
                    if (compressionType) {
                        assets[compressionType].add(filepath);
                        let url = baseURL ? joinURL(baseURL, dir, filename) : filename;
                        if (options[compressionType]?.webp) {
                            const query = "imagemin-upload-format=webp";
                            return [url, query].join(url.includes("?") ? "&" : "?");
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
                for (const [filename, file] of Object.entries(bundle)) {
                    if (file.type !== "asset")
                        continue;
                    if (/\.css$/.test(filename)) {
                        delete bundle[filename];
                        this.emitFile({
                            type: "asset",
                            fileName: filename,
                            source: postcss([
                                webpInCssPlugin({
                                    check: (decl) => /\.(jpe?g|png|gif|svg)\?(.*&)?imagemin-upload-format=webp/i.test(decl.value),
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
                            source: file.source.replace(/<\/head>/i, `<script>document.body.classList.remove('no-js');var i=new Image;i.onload=i.onerror=function(){document.body.classList.add(i.height==1?"webp":"no-webp")};i.src="data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";</script></head>`),
                        });
                        continue;
                    }
                    for (const compressionType of ["lossless", "lossy"]) {
                        if (!assets[compressionType].has(filename)) {
                            continue;
                        }
                        if (!(file.source instanceof Uint8Array)) {
                            console.log("\n[vite:imagemin-upload] " +
                                chalk.red(`Compression of ${filename} failed.`) +
                                "\n[vite:imagemin-upload] " +
                                chalk.red(`${filename} is not a Uint8Array`));
                        }
                        const buffer = Buffer.from(file.source);
                        const size = buffer.byteLength;
                        await Promise.all(getPlugins(filename, options, compressionType).map(async (plugin) => {
                            try {
                                const newBuffer = await imageminjs.buffer(buffer, {
                                    plugins: [plugin],
                                });
                                const newSize = newBuffer.byteLength;
                                const fileTypeResult = await fileType.fileTypeFromBuffer(newBuffer);
                                if (!fileTypeResult)
                                    throw new Error(`Cannot retrieve the file type of ${filename}.`);
                                const newFilename = filename.replace(/\.[^.]+$/g, "." + fileTypeResult.ext);
                                const filebasename = node_path.basename(filename);
                                const newFilebasename = node_path.basename(newFilename);
                                console.log("\n[vite:imagemin-upload] " + filebasename, size, newFilebasename, size <= newSize ? chalk.red(newSize) : newSize);
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
                            }
                            catch (error) {
                                console.log("\n[vite:imagemin-upload] " +
                                    chalk.red(`Compression of ${filename} failed.`) +
                                    "\n[vite:imagemin-upload] " +
                                    chalk.red(error.message));
                            }
                        }));
                    }
                }
            },
        },
    };
}

exports.imageminUpload = imageminUpload;
