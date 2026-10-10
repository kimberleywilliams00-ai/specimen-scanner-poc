/* Offline support: precache the app's own static files. Never caches anything else; never sees images. */
const V='req-scanner-v2';
const FILES=['./','index.html','css/app.css','js/app.js','js/dictionary.js','js/template_d2350.js','js/preprocess.js','js/pipeline.js','manifest.json','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png',
 'vendor/opencv.js','vendor/tesseract/tesseract.min.js','vendor/tesseract/worker.min.js','vendor/tesseract/tesseract-core-simd-lstm.wasm.js','vendor/tesseract/tesseract-core-lstm.wasm.js','vendor/lang/eng.traineddata.gz'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));});
