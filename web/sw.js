self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || new URL(event.request.url).pathname !== "/") return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CTL 운영관리</title><body style="font:1rem system-ui;margin:2rem;color:#123d35"><h1>CTL 운영관리</h1><p>인터넷에 연결한 뒤 다시 열어주세요.</p><a href="/">다시 시도</a></body></html>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  )));
});
