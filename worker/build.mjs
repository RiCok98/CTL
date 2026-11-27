import { mkdir, readFile, writeFile } from "node:fs/promises";

const read = relative => readFile(new URL(relative, import.meta.url));
const mime = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png"
};
const files = ["index.html", "app.js", "theme.css", "install.js", "sw.js", "manifest.webmanifest",
  "icons/ctl.svg", "icons/ctl-192.png", "icons/ctl-512.png", "icons/ctl-maskable.png", "icons/ctl-touch.png"];
const assets = Object.fromEntries(await Promise.all(files.map(async path => {
  const extension = path.split(".").at(-1);
  const data = await read("../web/" + path);
  const binary = extension === "png";
  return ["/" + path, { type: mime[extension], binary, body: data.toString(binary ? "base64" : "utf8") }];
})));
const api = await read("./api.mjs");
const directory = new URL("../dist/server/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("index.js", directory), `${api}
const assets = ${JSON.stringify(assets)};
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/")) return await api(request, env, pathname);
      const path = pathname === "/" ? "/index.html" : pathname;
      if (!Object.hasOwn(assets, path)) return new Response("Not found", { status: 404 });
      const { type, binary, body } = assets[path];
      const content = binary ? Uint8Array.from(atob(body), character => character.charCodeAt(0)) : body;
      return new Response(request.method === "HEAD" ? null : content, { headers: {
        "Content-Type": type,
        "Cache-Control": "no-cache"
      }});
    } catch (error) {
      console.error(error);
      return json({ error: "공유 저장소에 연결할 수 없습니다. 잠시 후 다시 시도하세요." }, 503);
    }
  }
};
`);
