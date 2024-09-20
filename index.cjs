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
var node_crypto = require('node:crypto');
var node_fs = require('node:fs');
var promises = require('node:fs/promises');
var node_path = require('node:path');
var postcss = require('postcss');
var webpInCssPlugin = require('webp-in-css/plugin.js');

var name = "vite-plugin-imagemin-upload";

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
function createMD5(data) {
    return node_crypto.createHash("md5").update(data).digest("hex");
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
        if (!noWebpAssets.has(filename) && losslessOptions?.webp) {
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
        if (!noWebpAssets.has(filename) && lossyOptions?.webp) {
            plugins.push(imageminWebp(lodashEs.defaultsDeep({}, lossyOptions.webp, { method: 6 }, lossyOptions.quality ? { quality: lossyOptions.quality } : {})));
        }
    }
    return plugins;
}
async function compression(filename, buffer, options, compressionType) {
    const filebasename = node_path.basename(filename);
    const fileextname = node_path.extname(filename);
    const size = buffer.byteLength;
    const fileTypeResult = await fileType.fileTypeFromBuffer(buffer);
    if (!fileTypeResult)
        throw new Error(`Cannot retrieve the file type of ${filename}.`);
    return await Promise.all(getPlugins(filename, options, compressionType).map(async (plugin) => {
        const newBuffer = await imageminjs.buffer(buffer, {
            plugins: [plugin],
        });
        const newSize = newBuffer.byteLength;
        const newFileTypeResult = await fileType.fileTypeFromBuffer(newBuffer);
        if (!newFileTypeResult)
            throw new Error(`Cannot retrieve the file type of ${filename}.`);
        const isOriginExt = fileTypeResult.ext === newFileTypeResult.ext;
        const newFilename = filename.replace(/\.[^.]+$/g, isOriginExt ? fileextname : "." + newFileTypeResult.ext);
        const newFilebasename = node_path.basename(newFilename);
        console.log("\n[vite:imagemin-upload] " + filebasename, size, newFilebasename, size <= newSize ? chalk.red(newSize) : newSize);
        if (size <= newSize) {
            if (isOriginExt) {
                console.log("\n[vite:imagemin-upload] " +
                    chalk.yellow(`${filebasename} still uses the original file.`));
            }
            else {
                console.log("\n[vite:imagemin-upload] " +
                    chalk.red(`The volume of ${filebasename} has increased after being compressed into webp!`) +
                    "\n[vite:imagemin-upload] " +
                    chalk.yellow(`You can add the parameter ${chalk.red(`no-webp`)} at the end of the image path to prevent conversion to webp.`));
            }
        }
        return {
            filename: newFilename,
            filebasename: newFilebasename,
            buffer: size <= newSize && isOriginExt ? buffer : newBuffer,
        };
    }));
}
const rootDir = process.cwd();
const cacheDir = node_path.join(rootDir, "node_modules/.cache", name);
const cacheUploadedFile = node_path.join(cacheDir, "uploaded.json");
let uploaded = [];
let s3Client;
let ossClient;
async function upload(filebasename, buffer, options) {
    const md5 = createMD5(buffer);
    const optionsStr = JSON.stringify(options);
    if (uploaded.some((file) => file.md5 === md5 &&
        file.filename === filebasename &&
        file.options === optionsStr))
        return;
    if (options.s3) {
        const opts = options.s3;
        if (!s3Client) {
            s3Client = new clientS3.S3Client(opts.client);
        }
        const filename = joinURL(opts.dir, filebasename);
        await s3Client
            .send(new clientS3.HeadObjectCommand({
            ...opts.head,
            Key: filename,
        }))
            .catch(async (error) => {
            if (error.name === "NotFound") {
                await s3Client
                    .send(new clientS3.PutObjectCommand({
                    ...opts.put,
                    Key: filename,
                    Body: buffer,
                }))
                    .then(() => {
                    uploaded.push({
                        md5,
                        filename: filebasename,
                        options: optionsStr,
                    });
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
        await ossClient.head(filename, opts.head).catch(async (error) => {
            if (error.code === "NoSuchKey") {
                await ossClient
                    .put(filename, buffer, opts.put)
                    .then(() => {
                    uploaded.push({
                        md5,
                        filename: filebasename,
                        options: optionsStr,
                    });
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
let outDir;
let publicDir;
const assets = {
    lossless: new Set(),
    lossy: new Set(),
};
const publicAssets = {
    lossless: new Set(),
    lossy: new Set(),
};
const noWebpAssets = new Set();
function imageminUpload(userOptions = {}) {
    if (node_fs.existsSync(cacheUploadedFile)) {
        uploaded = JSON.parse(node_fs.readFileSync(cacheUploadedFile, "utf-8"));
    }
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
    let polyfill = false;
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
                        const noWebp = /^['"]?[^#?]+\.(jpe?g|png|gif|svg)\?([^#]*&)?no-webp([&#].*)?['"]?$/i.test(filename);
                        if (noWebp)
                            noWebpAssets.add(filepath);
                        if (type === "public") {
                            publicAssets[compressionType].add(filepath);
                            return;
                        }
                        polyfill = true;
                        assets[compressionType].add(filepath);
                        let url = baseURL
                            ? joinURL(baseURL, dir, node_path.basename(filename))
                            : filename;
                        if (options[compressionType]?.webp &&
                            !/\.webp$/.test(filepath) &&
                            !noWebp) {
                            return url.replace(/^([^#?]+\.)(jpe?g|png|gif|svg)(\?[^#]*)?(#.*)?$/i, (match, p1, p2, p3, p4) => {
                                if (hostType === "css") {
                                    return `${p1}${p2}${p3?.length > 1 ? p3 + "&" : "?"}to-format=webp${p4 || ""}`;
                                }
                                return `${p1}webp${p3?.length > 1 ? p3 + "&" : "?"}from-format=${p2}${p4 || ""}`;
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
        configResolved(resolvedConfig) {
            if (resolvedConfig.mode === options.mode) {
                outDir = node_path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
                publicDir = resolvedConfig.publicDir;
            }
        },
        generateBundle: {
            order: null,
            async handler(outputOptions, bundle) {
                for (const compressionType of ["lossless", "lossy"]) {
                    for (let filename of publicAssets[compressionType]) {
                        const buffer = await promises.readFile(node_path.resolve(publicDir, filename));
                        const dir = node_path.resolve(outDir, node_path.dirname(filename));
                        try {
                            for (let { filebasename: newFilebasename, buffer: newBuffer, } of await compression(filename, buffer, options, compressionType)) {
                                if (!node_fs.existsSync(dir)) {
                                    await promises.mkdir(dir, { recursive: true });
                                }
                                await promises.writeFile(node_path.resolve(dir, newFilebasename), newBuffer);
                            }
                        }
                        catch (error) {
                            console.log("\n[vite:imagemin-upload] " +
                                chalk.red(`Compression of ${filename} failed.`) +
                                "\n[vite:imagemin-upload] " +
                                chalk.red(error.message));
                        }
                    }
                }
                if (!polyfill)
                    return;
                const deleteFiles = [];
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
                        try {
                            const uploads = [];
                            for (let { filename: newFilename, filebasename: newFilebasename, buffer: newBuffer, } of await compression(filename, buffer, options, compressionType)) {
                                uploads.push(upload(newFilebasename, newBuffer, options));
                                if (filename === newFilename) {
                                    delete bundle[filename];
                                    if (baseURL)
                                        deleteFiles.push(filename);
                                }
                                if (!baseURL) {
                                    this.emitFile({
                                        type: "asset",
                                        fileName: newFilename,
                                        source: newBuffer,
                                    });
                                }
                            }
                            await Promise.all(uploads);
                        }
                        catch (error) {
                            console.log("\n[vite:imagemin-upload] " +
                                chalk.red(`Compression of ${filename} failed.`) +
                                "\n[vite:imagemin-upload] " +
                                chalk.red(error.message));
                        }
                    }
                }
                if (!node_fs.existsSync(cacheDir)) {
                    await promises.mkdir(cacheDir, { recursive: true });
                }
                await promises.writeFile(cacheUploadedFile, JSON.stringify(uploaded, null, 2));
                for (const [, file] of Object.entries(bundle)) {
                    if (file.type !== "chunk")
                        continue;
                    deleteFiles.forEach((filename) => {
                        file.viteMetadata?.importedAssets.delete(cleanUrl(filename));
                    });
                }
            },
        },
    };
}

exports.imageminUpload = imageminUpload;
