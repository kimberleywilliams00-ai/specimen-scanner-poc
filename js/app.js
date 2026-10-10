/* UI glue. Images live only in memory (ImageBitmap -> cv.Mat) and are released on finish/discard.
   No localStorage / IndexedDB / cookies; no network requests except loading this app's own static files. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let cvReady=null,ocrWorker=null,current=null;
const D=window.ReqDict;
const APP_VERSION='v3 2026-10-10';

function waitCv(){if(cvReady)return cvReady;cvReady=new Promise(res=>{
  const check=()=>{const c=window.cv;if(!c){setTimeout(check,100);return;}
    if(typeof c.then==='function'){c.then(m=>{window.cv=m;res(m);});return;}
    if(c.Mat){res(c);return;}c.onRuntimeInitialized=()=>res(window.cv);};check();});return cvReady;}
async function getOcr(){
  if(ocrWorker)return ocrWorker;const base=new URL('.',location.href).href;
  const w=await Tesseract.createWorker('eng',1,{workerPath:base+'vendor/tesseract/worker.min.js',corePath:base+'vendor/tesseract',langPath:base+'vendor/lang',
    gzip:true,cacheMethod:'none',workerBlobURL:false,logger:m=>{if(m.status&&/load|init/i.test(m.status))stage('Loading text engine… '+Math.round((m.progress||0)*100)+'%');}});
  let cur=null;const cnv=document.createElement('canvas');
  const ocr=async(mat,opts)=>{const psm=(opts&&opts.psm)||'4',wl=(opts&&opts.whitelist)||'';const key=psm+'|'+wl;
    if(key!==cur){await w.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',tessedit_char_whitelist:wl});cur=key;}
    window.cv.imshow(cnv,mat);const r=await w.recognize(cnv,{},{blocks:true,text:false});cnv.width=cnv.height=0;return toLines(r.data);};
  ocrWorker=ocr;return ocr;}
function toLines(d){const lines=[];for(const b of d.blocks||[])for(const p of b.paragraphs)for(const l of p.lines)
  lines.push({text:l.text.replace(/\n/g,' ').trim(),conf:l.confidence,bbox:l.bbox,words:l.words.map(w=>({text:w.text,conf:w.confidence,bbox:w.bbox}))});return {conf:d.confidence,lines};}
function stage(t){$('stage').textContent=t;}
const MAX_SIDE=2500;
function decodeViaImg(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const im=new Image();im.decoding='async';
  im.onload=()=>{im._url=u;res(im);};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('this photo format is not supported by the browser'));};im.src=u;});}
async function decodeImage(file){
  if(window.createImageBitmap){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch(e){}}
  return decodeViaImg(file);}
function show(id){for(const s of ['start','busy','result','done'])$(s).classList.toggle('hidden',s!==id);}

async function handleFile(file){
  if(!file)return;show('busy');stage('Loading image engine…');
  const t0=performance.now();let src=null;
  try{
    const cv=await waitCv();
    stage('Reading photo…');
    // iOS-safe decode: createImageBitmap (EXIF-aware) with <img> fallback (Safari decodes HEIC/JPEG and applies EXIF orientation).
    // Downscale to <=2500 px long side before any processing to stay well inside iOS canvas/WASM memory limits (12 MP photos).
    const bmp=await decodeImage(file);const bw=bmp.width||bmp.naturalWidth,bh=bmp.height||bmp.naturalHeight;
    if(!bw||!bh)throw new Error('image could not be decoded (try a JPEG, or set Camera > Formats > Most Compatible)');
    const s=Math.min(1,MAX_SIDE/Math.max(bw,bh));const c=document.createElement('canvas');c.width=Math.round(bw*s);c.height=Math.round(bh*s);
    const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();else if(bmp._url)URL.revokeObjectURL(bmp._url);
    const id=g.getImageData(0,0,c.width,c.height);c.width=c.height=0;src=cv.matFromImageData(id);
    const lowRes=Math.max(src.cols,src.rows)<1200;
    stage('Loading text engine…');const ocr=await getOcr();
    stage('Straightening page and finding checkboxes…');await new Promise(r=>setTimeout(r,30));
    const wrapped=async(m,o)=>{stage('Reading printed text…');return ocr(m,o);};
    const res=await ReqPipeline.scan(cv,src,wrapped,{keepImage:$('dbg').checked,crops:true});
    src.delete();src=null;res.ms=Math.round(performance.now()-t0);res.lowRes=lowRes;current=res;render(res);show('result');
  }catch(e){console.error(e);if(src)src.delete();alert('Could not process this photo: '+e.message);reset();}
  finally{$('cam').value='';$('pick').value='';}}

function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}for(const k of kids)if(k)e.appendChild(typeof k==='string'?document.createTextNode(k):k);return e;}

function render(r){
  const L=$('layout');L.innerHTML='';
  if(r.layout==='list')L.appendChild(el('div',{class:'layout-ok',text:'✔ Printed test list recognised'}));
  else if(r.layout==='grid')L.appendChild(el('div',{class:'layout-ok',text:'✔ LifeLabs standard requisition D2350'+(r.info.formVersion?' ('+r.info.formVersion+')':'')}));
  else{L.appendChild(el('div',{class:'layout-bad',text:'⚠ Layout not recognised – please confirm tests manually'}));if(r.reason)L.appendChild(el('div',{class:'small',text:r.reason}));}
  if(r.warning)L.appendChild(el('div',{class:'small',text:'⚠ '+r.warning}));
  if(r.lowRes)L.appendChild(el('div',{class:'small',text:'⚠ Low-resolution photo: results are less reliable. Use the full camera resolution and fill the frame.'}));
  const warn=r.items.filter(i=>i.warn);const tests=r.items.filter(i=>!i.warn);
  if(warn.length)L.appendChild(el('div',{class:'alert-bad',text:`⚠ ${warn.length} possible missed line${warn.length>1?'s':''}: a checkbox was seen but its test could not be read. Check the paper (see red card${warn.length>1?'s':''} below).`}));
  const nv=tests.filter(i=>i.status!=='ok'&&i.checked!==false).length;
  if(r.items.length)L.appendChild(el('div',{class:'small',text:`${tests.filter(i=>i.checked!==false).length} ticked line(s) read${nv?`, ${nv} need checking (amber/red)`:''}. Compare with the paper before confirming.`}));
  if(r.standingOrder){const so=r.standingOrder;L.appendChild(el('div',{class:'note so so-banner',text:'🔁 Standing order ('+(so.all?'all tests':so.count+' of '+so.total+' tests')+'): '+so.text}));}
  const list=$('list');list.innerHTML='';
  const groups={};const order=[];
  const MISSED='⚠ Possible missed lines – check paper';
  for(const [i,it] of r.items.entries()){it._i=i;const g=it.warn?MISSED:it.checked===false?'Unticked on form (not ordered)':(it.id?(it.category||'Other'):'Needs review');if(!groups[g]){groups[g]=[];order.push(g);}groups[g].push(it);}
  const rank=g=>g===MISSED?-2:g==='Needs review'?-1:g.startsWith('Unticked')?1:0;order.sort((a,b)=>rank(a)-rank(b));
  for(const g of order){const box=el('div',{class:'grp'+(g===MISSED?' missed':'')},el('h3',{text:g}));for(const it of groups[g])box.appendChild(itemEl(it,r));list.appendChild(box);}
  const dl=$('dict');dl.innerHTML='';for(const t of D.TESTS)dl.appendChild(el('option',{value:t[1]}));
  const nb=(r.info.columnBoxes!=null?r.info.columnBoxes:(r.info.boxesFound||0))+(r.info.looseMarks||0);
  $('timing').textContent=`Processed on device in ${(r.ms/1000).toFixed(1)} s · rotation ${Math.round(r.info.rotation||0)}° · ${nb} checkbox(es) seen${r.info.looseMarks?` (${r.info.looseMarks} faint)`:''} · ${tests.length} test line(s) read${warn.length?` · ${warn.length} unread`:''} · app ${APP_VERSION}`;
  const ov=$('overlay');if(r.image){drawOverlay(r);ov.classList.remove('hidden');}else ov.classList.add('hidden');}

function itemEl(it,r){
  const cls='item '+(it.warn?'missed':it.checked===false?'unticked':it.status);const cb=el('input',{type:'checkbox'});cb.checked=it.checked!==false&&it.status!=='unrecognized'&&!it.warn;
  cb.addEventListener('change',()=>{it.selected=cb.checked;});it.selected=cb.checked;
  const body=el('div',{class:'body'});
  const title=el('div',{class:'name',text:it.warn?'Possible missed line – check paper':it.id?(it.testName):(it.name||it.raw||'(unreadable line)')});
  if(it.status==='verify')title.appendChild(el('span',{class:'badge',text:it.boxDetected===false?'check box?':'check'}));
  if(it.status==='unrecognized')title.appendChild(el('span',{class:'badge bad',text:'not recognised'}));
  if(it.checked===false)title.appendChild(el('span',{class:'badge grey',text:'unticked'}));
  body.appendChild(title);
  if(it.warn){body.appendChild(el('div',{class:'raw',text:'A ticked checkbox was found here but the test name could not be read. Find this line on the paper and choose the test below (or add it manually).'}));
    if(it.crop){const c=el('canvas',{class:'crop'});c.width=it.crop.width;c.height=it.crop.height;c.getContext('2d').putImageData(new ImageData(it.crop.data,it.crop.width,it.crop.height),0,0);body.appendChild(c);}}
  if(it.raw&&(!it.id||it.status!=='ok'||D.norm(it.name)!==D.norm(it.testName)))body.appendChild(el('div',{class:'raw',text:'Read on form: “'+(it.name||it.raw)+'”'+(it.section?' · under '+it.section:'')}));
  else if(it.section)body.appendChild(el('div',{class:'raw',text:'Under '+it.section}));
  const soAll=r&&r.standingOrder&&r.standingOrder.all;
  for(const n of it.notes||[]){if(n.common&&soAll)continue;if(n.common){body.appendChild(el('div',{class:'note so',text:'🔁 Standing order (as above)'}));continue;}body.appendChild(el('div',{class:'note'+(n.type==='standing order'?' so':''),text:(n.type==='standing order'?'🔁 Standing order: ':n.type==='frequency'?'🔁 ':'📝 '+n.type.replace(/^./,c=>c.toUpperCase())+': ')+n.text}));}
  if(!it.id||it.status==='verify'){const sel=el('select');sel.appendChild(el('option',{value:'',text:it.id?'Change test…':'Choose matching test…'}));
    for(const t of D.TESTS.slice().sort((a,b)=>a[1].localeCompare(b[1])))sel.appendChild(el('option',{value:t[0],text:t[1]}));
    sel.addEventListener('change',()=>{if(!sel.value)return;const e=D.BYID[sel.value];it.id=e.id;it.testName=e.name;it.category=e.category;it.status='ok';it.manual=true;cb.checked=true;it.selected=true;title.firstChild.textContent=e.name;});
    body.appendChild(sel);}
  return el('div',{class:cls},cb,body);}

function drawOverlay(r){const cv=window.cv;const c=$('overlay');const m=r.image;const rgba=new cv.Mat();cv.cvtColor(m,rgba,cv.COLOR_GRAY2RGBA);
  for(const it of r.items){const col=it.checked===false?[150,150,150,255]:it.status==='ok'?[0,160,0,255]:it.status==='verify'?[230,140,0,255]:[220,0,0,255];
    const b=it.bbox;if(b)cv.rectangle(rgba,new cv.Point(b.x-4,b.y-4),new cv.Point(b.x+b.w+4,b.y+b.h+4),col,4);
    const lb=it.lineBox;if(lb)cv.rectangle(rgba,new cv.Point(lb.x0,lb.y0),new cv.Point(lb.x1,lb.y1),col,2);}
  const s=Math.min(1,1400/Math.max(rgba.cols,rgba.rows));const d=new cv.Mat();cv.resize(rgba,d,new cv.Size(Math.round(rgba.cols*s),Math.round(rgba.rows*s)),0,0,cv.INTER_AREA);
  cv.imshow(c,d);rgba.delete();d.delete();m.delete();r.image=null;}

function reset(){ // wipe everything from memory and screen (incl. in-memory line crops)
  if(current&&current.image){try{current.image.delete();}catch(e){}}if(current)for(const it of current.items||[])it.crop=null;current=null;
  for(const c of document.querySelectorAll('canvas.crop')){c.width=c.height=0;}
  $('list').innerHTML='';$('layout').innerHTML='';$('final').innerHTML='';$('timing').textContent='';$('addTest').value='';
  const c=$('overlay');c.width=c.height=0;c.classList.add('hidden');$('cam').value='';$('pick').value='';show('start');}

$('cam').addEventListener('change',e=>handleFile(e.target.files[0]));
$('pick').addEventListener('change',e=>handleFile(e.target.files[0]));
$('discard').addEventListener('click',reset);$('finish').addEventListener('click',reset);
$('addBtn').addEventListener('click',()=>{const v=$('addTest').value.trim();if(!v||!current)return;const m=D.match(v);
  const exact=D.TESTS.find(t=>t[1]===v);const e=exact?D.BYID[exact[0]]:(m&&m.score>0.7?m:null);
  const it={id:e?e.id:null,testName:e?e.name:v,name:v,raw:'',category:e?e.category:'Other',status:e?'ok':'unrecognized',checked:true,notes:[],manual:true};
  current.items.push(it);const box=el('div',{class:'grp'},el('h3',{text:'Added manually'}),itemEl(it));$('list').appendChild(box);$('addTest').value='';});
$('confirm').addEventListener('click',()=>{if(!current)return;const sel=current.items.filter(i=>i.selected);const f=$('final');f.innerHTML='';
  for(const it of sel){const li=el('li',{text:(it.testName||it.name||it.raw)+(it.id?'':' (unmatched)')});for(const n of it.notes||[])li.appendChild(el('div',{class:'small',text:n.type+': '+n.text}));f.appendChild(li);}
  if(!sel.length)f.appendChild(el('li',{text:'No tests selected'}));show('done');});
// warm up engines in the background (still fully local)
window.addEventListener('load',()=>{waitCv().then(()=>{$('engine').textContent='Engine: image engine ready (on-device).';});
  $('ver').textContent='App '+APP_VERSION;
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').then(reg=>{reg.update().catch(()=>{});}).catch(()=>{});
    // a newer version took over: reload once, but only when idle on the start screen (never during a scan/review)
    let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;
      if(!current&&!$('start').classList.contains('hidden')){reloaded=true;location.reload();}else $('engine').textContent='A new version is ready – it will load next time you open the app.';});}});
})();
