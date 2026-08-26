// 本地预览用的极简静态服务器：node serve.mjs（仅开发用，与背景实现无关）
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error("forbidden");

    const { size, mtimeMs } = await stat(file);
    const ext = extname(file);
    // 媒体走 Range 请求（206）。没有验证器的话浏览器没法复用缓存里的
    // 分段，视频每次换页都会整个重下一遍，所以这里补上 ETag/Last-Modified
    const etag = '"' + size.toString(36) + "-" + Math.floor(mtimeMs).toString(36) + '"';
    const lastModified = new Date(mtimeMs).toUTCString();
    const contentType = types[ext] || "application/octet-stream";

    // 代码文件（html/css/js）不缓存，改完刷新就能看到。
    // 媒体素材用 no-cache——注意它不是「不缓存」，而是「可以缓存，
    // 但每次都必须回服务器校验」：文件没变就回 304（不带 body），
    // 那个 11MB 的 hero.mp4 不会被重复下载，进场动画照样不卡；
    // 文件一旦被替换，ETag 变了就立刻拿到新的。
    // 之前用的是 max-age=3600，浏览器在一小时内根本不来问，
    // 换了图也还是显示旧的——就是「1.png 换了但页面还是老图」那个问题
    const isMedia = [".mp4", ".webm", ".mov", ".png", ".jpg", ".gif", ".svg"].includes(ext);
    const cacheControl = isMedia ? "no-cache" : "no-store";

    // 条件请求：浏览器带着上次的 ETag/时间戳来问，没变就回 304。
    // 没有这一步的话 no-cache 会退化成每次全量重传
    const inm = req.headers["if-none-match"];
    const ims = req.headers["if-modified-since"];
    const fresh =
      (inm && inm.split(/,\s*/).includes(etag)) ||
      (!inm && ims && Math.floor(mtimeMs / 1000) * 1000 <= Date.parse(ims));
    if (fresh) {
      res.writeHead(304, { ETag: etag, "Last-Modified": lastModified, "Cache-Control": cacheControl });
      res.end();
      return;
    }

    // 支持 Range 请求：video.currentTime 的 seek（比如 Experience
    // section 的滚动驱动播放）需要浏览器能按字节区间取数据，没有
    // Accept-Ranges/206 的话 seek 会静默失败，只能停在已缓冲的位置
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Cache-Control": cacheControl,
        ETag: etag,
        "Last-Modified": lastModified,
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": size,
      "Cache-Control": cacheControl,
      ETag: etag,
      "Last-Modified": lastModified,
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(4173, "127.0.0.1", () => console.log("http://127.0.0.1:4173"));
