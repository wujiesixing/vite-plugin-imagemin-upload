# Vite Plugin: vite-plugin-imagemin-upload

`vite-plugin-imagemin-upload` is a Vite plugin that facilitates image compression and upload to cloud storage services such as AWS S3 or Alibaba Cloud OSS during the build process. It leverages various image optimization plugins like imagemin to compress images and then uploads the optimized images to the specified cloud storage.

## Installation

```bash
npm install vite-plugin-imagemin-upload --save-dev
```

## Usage

```javascript
// vite.config.js or vite.config.ts
import imageminUpload from "vite-plugin-imagemin-upload";

export default {
  plugins: [
    imageminUpload({
      // Options here
    }),
  ],
};
```

## Options

### `mode` (optional, default: 'production')

- Specifies the build mode. The plugin will only run in the specified mode.

### `lossless` (optional)

- Configuration for lossless compression.

#### Lossless Options:

- `type`: 'asset' or 'public' (default: 'public')
- `include`: A filter pattern for files to include in compression (default: `/\.(jpe?g|png|gif|svg)$/i`).
- `exclude`: A filter pattern for files to exclude from compression.
- `progressive`: Enable progressive compression for JPEGs (default: true).
- `interlaced`: Enable interlaced compression for GIFs and PNGs (default: true).
- `gifsicle`: Configuration for imagemin-gifsicle (default: true).
- `jpegtran`: Configuration for imagemin-jpegtran (default: true).
- `optipng`: Configuration for imagemin-optipng (default: true).
- `svgo`: Configuration for imagemin-svgo (default: true).
- `webp`: Configuration for imagemin-webp (default: true).

### `lossy` (optional)

- Configuration for lossy compression.

#### Lossy Options:

- `type`: 'asset' or 'public' (default: 'asset')
- `include`: A filter pattern for files to include in compression (default: `/\.(jpe?g|png|gif|svg)$/i`).
- `exclude`: A filter pattern for files to exclude from compression.
- `quality`: Quality setting for compression (default: 80).
- `progressive`: Enable progressive compression for JPEGs (default: true).
- `interlaced`: Enable interlaced compression for GIFs and PNGs (default: true).
- `gifsicle`: Configuration for imagemin-gifsicle (default: true).
- `mozjpeg`: Configuration for imagemin-mozjpeg (default: true).
- `pngquant`: Configuration for imagemin-pngquant (default: true).
- `svgo`: Configuration for imagemin-svgo (default: true).
- `webp`: Configuration for imagemin-webp (default: true).

### `s3` (optional)

- Configuration for AWS S3 storage.

#### S3 Options:

- `baseURL`: The base URL for accessing S3.
- `dir`: The directory in S3 to upload files to.
- `client`: Configuration for the S3 client.
- `head`: Configuration for the S3 `HeadObjectCommand`.
- `put`: Configuration for the S3 `PutObjectCommand`.

### `oss` (optional)

- Configuration for Alibaba Cloud OSS storage.

#### OSS Options:

- `baseURL`: The base URL for accessing OSS.
- `dir`: The directory in OSS to upload files to.
- `client`: Configuration for the OSS client.
- `head`: Configuration for the OSS `head` method.
- `put`: Configuration for the OSS `put` method.

## Example

### Example for Compression Only (No Upload):

```javascript
// vite.config.js or vite.config.ts
import imageminUpload from "vite-plugin-imagemin-upload";

export default {
  plugins: [imageminUpload()],
};
```

### Example for S3 Configuration:

```javascript
// vite.config.js or vite.config.ts
import imageminUpload from "vite-plugin-imagemin-upload";
import { name } from "./package.json";

export default {
  plugins: [
    imageminUpload({
      s3: {
        baseURL: "https://your-s3-bucket.s3.amazonaws.com",
        dir: name + "/images",
        client: {
          region: "your-s3-region",
          credentials: {
            accessKeyId: "your-s3-id",
            secretAccessKey: "your-s3-key",
          },
        },
        head: {
          Bucket: "your-s3-bucket",
        },
        put: {
          Bucket: "your-s3-bucket",
          ACL: "public-read",
        },
      },
    }),
  ],
};
```

### Example for OSS Configuration:

```javascript
// vite.config.js or vite.config.ts
import imageminUpload from "vite-plugin-imagemin-upload";
import { name } from "./package.json";

export default {
  plugins: [
    imageminUpload({
      oss: {
        baseURL: "https://your-oss-bucket.oss-cn-hangzhou.aliyuncs.com",
        dir: name + "/images",
        client: {
          region: "your-oss-region",
          bucket: "your-oss-bucket",
          accessKeyId: "your-oss-id",
          accessKeySecret: "your-oss-key",
        },
      },
    }),
  ],
};
```

## License

This plugin is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
