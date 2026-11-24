import { mkdir, readFile, writeFile } from "node:fs/promises";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");
const [html, script, api] = await Promise.all([read("../web/index.html"), read("../web/app.js"), read("./api.mjs")]);
const directory = new URL("../dist/server/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("index.js", directory), `${api}
const assets = {
  "/": ${JSON.stringify(html)},
  "/index.html": ${JSON.stringify(html)},
  "/app.js": ${JSON.stringify(script)}
};
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/")) return await api(request, env, pathname);
      if (!Object.hasOwn(assets, pathname)) return new Response("Not found", { status: 404 });
      return new Response(assets[pathname], { headers: {
        "Content-Type": pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
      }});
    } catch (error) {
      console.error(error);
      return json({ error: "공유 저장소에 연결할 수 없습니다. 잠시 후 다시 시도하세요." }, 503);
    }
  }
};
`);
