import { type HeadObjectCommandInput, type PutObjectCommandInput, type S3ClientConfig } from "@aws-sdk/client-s3";
import { type FilterPattern } from "@rollup/pluginutils";
import OSS from "ali-oss";
import imageminGifsicle from "imagemin-gifsicle";
import imageminJpegtran from "imagemin-jpegtran";
import imageminMozjpeg from "imagemin-mozjpeg";
import imageminOptipng from "imagemin-optipng";
import { type Options as ImageminPngquantOptions } from "imagemin-pngquant";
import { type Options as ImageminSvgoOptions } from "imagemin-svgo";
import { type Options as ImageminWebpOptions } from "imagemin-webp";
import { type Plugin } from "vite";
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
export declare function imageminUpload(userOptions?: Options): Plugin;
export {};
