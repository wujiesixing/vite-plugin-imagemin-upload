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
    if (/\.svg$/i.test(filename) && opts?.svgo) {
        plugins.push(imageminSvgo(lodashEs.defaultsDeep({}, opts.svgo)));
    }
    if (/\.gif$/i.test(filename) && opts?.gifsicle) {
        plugins.push(imageminGifsicle(lodashEs.defaultsDeep({}, opts.gifsicle, {
            optimizationLevel: 3,
            interlaced: !!opts.interlaced,
        })));
    }
    if (compressionType === "lossless") {
        const losslessOptions = options.lossless;
        if (/\.jpe?g$/i.test(filename) && losslessOptions?.jpegtran) {
            plugins.push(imageminJpegtran(lodashEs.defaultsDeep({}, losslessOptions.jpegtran, {
                progressive: !!losslessOptions.progressive,
            })));
        }
        if (/\.png$/i.test(filename) && losslessOptions?.optipng) {
            plugins.push(imageminOptipng(lodashEs.defaultsDeep({}, losslessOptions.optipng, {
                optimizationLevel: 7,
                interlaced: !!losslessOptions.interlaced,
            })));
        }
        if (losslessOptions?.webp) {
            plugins.push(imageminWebp(lodashEs.defaultsDeep({}, losslessOptions.webp, {
                lossless: 9,
            })));
        }
    }
    if (compressionType === "lossy") {
        const lossyOptions = options.lossy;
        if (/\.jpe?g$/i.test(filename) && lossyOptions?.mozjpeg) {
            plugins.push(imageminMozjpeg(lodashEs.defaultsDeep({}, lossyOptions.mozjpeg, { progressive: !!lossyOptions.progressive }, lossyOptions.quality ? { quality: lossyOptions.quality } : {})));
        }
        if (/\.png$/i.test(filename) && lossyOptions?.pngquant) {
            plugins.push(imageminPngquant(lodashEs.defaultsDeep({}, lossyOptions.pngquant, { speed: 1 }, lossyOptions.quality
                ? { quality: [lossyOptions.quality / 100, 1] }
                : {})));
        }
        if (lossyOptions?.webp) {
            plugins.push(imageminWebp(lodashEs.defaultsDeep({}, lossyOptions.webp, { method: 6 }, lossyOptions.quality ? { quality: lossyOptions.quality } : {})));
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
    let enabled = false;
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
                        enabled = true;
                        assets[compressionType].add(filepath);
                        let url = baseURL
                            ? joinURL(baseURL, dir, node_path.basename(filename))
                            : filename;
                        if (options[compressionType]?.webp && !/\.webp$/.test(filepath)) {
                            return url.replace(/^([^#?]+\.)(jpe?g|png|gif|svg)(\?[^#]*)?(#.*)?$/i, (match, p1, p2, p3, p4) => {
                                if (hostType === "js") {
                                    return `${p1}webp${p3?.length > 1 ? p3 + "&" : "?"}from-format=${p2}${p4 || ""}`;
                                }
                                return `${p1}${p2}${p3?.length > 1 ? p3 + "&" : "?"}to-format=webp${p4 || ""}`;
                            });
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
                if (!enabled)
                    return;
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
                                    check: (decl) => /^url\(['"]?[^#?]+\.(jpe?g|png|gif|svg)\?([^#]*&)?to-format=webp([&#].*)?['"]?\)$/i.test(decl.value),
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
                            source: file.source.replace(/<\/head>/i, `<script>!function(){"use strict";document.addEventListener("DOMContentLoaded",(function(){document.body.classList.remove("no-js");var e=new Image;e.onload=e.onerror=function(){var t=1===e.height;if(document.body.classList.add(t?"webp":"no-webp"),!t){var n=function(e){if(e instanceof HTMLImageElement)try{var t="[^#?]+\\.)webp(\\?([^#]*&)?from-format=(jpe?g|png|gif|svg)([&#].*)?",n=e.srcset,c=new RegExp("^(\\s*".concat(t,"(\\s+\\S+)?\\s*)$"),"i");n&&c.test(n)&&(e.srcset=n.split(",").map((function(e){return e.replace(c,(function(e,t,n,c,o){return"".concat(t).concat(o).concat(n)}))})).join(","));var o=e.src,a=new RegExp("^(".concat(t,")$"),"i");o&&a.test(o)&&(e.src=o.replace(a,(function(e,t,n,c,o){return"".concat(t).concat(o).concat(n)})))}catch(e){console.log("[vite:imagemin-upload] "+(null==e?void 0:e.message))}};document.body.querySelectorAll("img").forEach(n),new MutationObserver((function(e){try{for(var t=0,c=e;t<c.length;t++){var o=c[t];"attributes"===o.type&&["src","srcset"].includes(o.attributeName||"")?n(o.target):"childList"===o.type&&o.addedNodes.forEach((function(e){e instanceof HTMLImageElement?n(e):e instanceof Element&&e.querySelectorAll("img").forEach(n)}))}}catch(e){console.log("[vite:imagemin-upload] "+(null==e?void 0:e.message))}})).observe(document.body,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["src","srcset"],characterData:!1})}},e.src="data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="}))}();
</script></head>`.replaceAll("\\", "\\\\")),
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
                                if (filename.replace(/\.jpeg$/i, ".jpg") ===
                                    newFilename.replace(/\.jpeg$/i, ".jpg")) {
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
