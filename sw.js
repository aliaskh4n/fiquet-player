const CACHE='fiquet-player-862c69e8dd16';
const CORE=["./", "./styles.css?v=50c226eeea74", "./config.js?v=9dfda38d7f1d", "./app.js?v=dd3dc45f7a81", "./core.mjs?v=22419c8678fd", "./manifest.webmanifest", "./assets/icon.svg", "./assets/artist.webp", "./data/catalog.json"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('fiquet-player-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/media/')||request.headers.has('range'))return;
  event.respondWith(fetch(request,{cache:'no-cache'}).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(request,clone))}return response}).catch(()=>caches.match(request).then(cached=>cached||(request.mode==='navigate'?caches.match('./'):Response.error()))));
});
