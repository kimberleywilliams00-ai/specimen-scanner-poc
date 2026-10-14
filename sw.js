/* Offline support for the app's own static files only. Never caches anything else; never sees images.
   Update strategy (v3.1+):
   - App shell (navigations/index.html, app JS/CSS, manifest, icons, version.json): NETWORK-FIRST, fetched from the
     server bypassing the HTTP cache (cache:'reload'), cache used only as an offline / slow-network fallback. A new deploy is picked up on next open.
   - Large immutable vendor files (opencv, tesseract js/wasm, traineddata): CACHE-FIRST in a separate cache keyed by
     VENDOR_CACHE. Bump VENDOR_CACHE whenever any file under vendor/ changes. App version bumps do NOT re-download them. */
const VERSION='v3.8.4';
const APP_CACHE='req-scanner-app-'+VERSION;
const VENDOR_CACHE='req-scanner-vendor-1';
const Q='?v=3.8.4'; // must match the ?v= query strings in index.html
const APP_FILES=['./','index.html','version.json','css/app.css'+Q,'css/ui2.css'+Q,'js/app.js'+Q,'js/dictionary.js'+Q,'js/template_d2350.js'+Q,'js/preprocess.js'+Q,'js/pipeline.js'+Q,'js/collection_data.js'+Q,'js/tube_rules.js'+Q,'js/local_rules.js'+Q,'js/requisition_forms.js'+Q,'js/elab_data.js'+Q,'js/guide_data.js'+Q,'js/summary.js'+Q,'js/plan_view.js'+Q,'img/containers/urine_container_orange_cap.webp','img/containers/sst_gold_5ml.webp','img/containers/edta_lavender_6ml.webp','img/containers/sst_gold_3_5ml.webp','img/containers/acd_a_yellow_8_5ml.webp','img/containers/citrate_light_blue_2_7ml.webp','img/containers/edta_lavender_4ml.webp','img/containers/aptima_multitest_swab.webp','img/containers/starplex_stool_container_spoon.webp','img/containers/eswab_green_cap.webp','img/containers/aptima_unisex_swab.webp','img/containers/copan_fecalswab_orange_cap.webp','img/containers/copan_floqswab_red_cap_dry.webp','img/containers/copan_blue_cap_swab_medium.webp','img/containers/eiken_fit_tube_teal_cap.webp','img/containers/red_top_serum_6ml.webp',
 'manifest.json','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
const VENDOR_FILES=['vendor/opencv.js','vendor/tesseract/tesseract.min.js','vendor/tesseract/worker.min.js',
 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js','vendor/tesseract/tesseract-core-lstm.wasm.js','vendor/lang/eng.traineddata.gz'];
const NET_TIMEOUT_MS=5000; // when a cached copy exists, don't hang longer than this on a dead/slow connection

self.addEventListener('install',e=>e.waitUntil((async()=>{
  const app=await caches.open(APP_CACHE);
  await app.addAll(APP_FILES.map(f=>new Request(f,{cache:'reload'})));
  // vendor: reuse copies already on the device (from this or an older cache) instead of re-downloading ~25 MB
  const ven=await caches.open(VENDOR_CACHE);
  for(const f of VENDOR_FILES){const req=new Request(f);if(await ven.match(req))continue;
    const old=await caches.match(req);
    if(old&&old.ok)await ven.put(req,old);else await ven.add(new Request(f,{cache:'reload'}));}
  await self.skipWaiting();
})()));

self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keep=[APP_CACHE,VENDOR_CACHE];
  for(const k of await caches.keys())if(!keep.includes(k))await caches.delete(k);
  await self.clients.claim();
})()));

const scopePath=new URL(self.registration.scope).pathname;
function isVendor(u){return u.pathname.startsWith(scopePath+'vendor/');}

async function cacheFirst(req){
  const hit=await caches.match(req,{ignoreSearch:true,cacheName:VENDOR_CACHE})||await caches.match(req,{ignoreSearch:true});
  if(hit)return hit;
  const res=await fetch(req);
  if(res.ok&&res.type==='basic'){const c=await caches.open(VENDOR_CACHE);c.put(req,res.clone()).catch(()=>{});}
  return res;
}

async function networkFirst(e){
  const req=e.request,nav=req.mode==='navigate';
  // always go to the server, never the browser HTTP cache (GitHub Pages sends max-age=600); keep 'no-store' if asked
  const net=nav?fetch(req.url,{cache:'reload',credentials:'same-origin'})
               :fetch(new Request(req,{cache:req.cache==='no-store'?'no-store':'reload'}));
  const save=net.then(async res=>{
    if(res.ok&&res.type==='basic'&&!res.redirected){const c=await caches.open(APP_CACHE);
      await c.put(nav?new Request(new URL(req.url).pathname.endsWith('/')?'./':'index.html'):req,res.clone());
      // keep './' and 'index.html' in sync so either entry point works offline
      if(nav)await c.put(new Request(new URL(req.url).pathname.endsWith('/')?'index.html':'./'),res.clone());}
    return res;});
  e.waitUntil(save.catch(()=>{}));
  const fallback=async()=>{const o={ignoreSearch:true};
    return await caches.match(req,o)||(nav?(await caches.match('index.html',o)||await caches.match('./',o)):undefined);};
  const cached=await fallback();
  if(!cached){try{return await save;}catch(err){return Response.error();}}
  let timer;const timeout=new Promise(r=>{timer=setTimeout(()=>r(null),NET_TIMEOUT_MS);});
  try{const res=await Promise.race([save,timeout]);clearTimeout(timer);
    if(res&&(res.ok||res.status===304||!nav))return res;return cached;}
  catch(err){clearTimeout(timer);return cached;}
}

self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  if(isVendor(u)){e.respondWith(cacheFirst(e.request));return;}
  e.respondWith(networkFirst(e));});
