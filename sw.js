const CACHE='fiquet-player-4b7b3a5a051f';
const CORE=["./", "./styles.css?v=7c8a06543512", "./config.js?v=9dfda38d7f1d", "./app.js?v=b54e47c3fce8", "./core.mjs?v=706c7b2e8c4b", "./manifest.webmanifest", "./assets/icon.svg", "./assets/artist.webp", "./data/catalog.json"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('fiquet-player-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/media/')||request.headers.has('range'))return;
  event.respondWith(fetch(request,{cache:'no-cache'}).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(request,clone))}return response}).catch(()=>caches.match(request).then(cached=>cached||(request.mode==='navigate'?caches.match('./'):Response.error()))));
});
