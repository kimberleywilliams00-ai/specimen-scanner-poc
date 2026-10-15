/* UI glue. Images live only in memory (ImageBitmap -> cv.Mat) and are released on finish/discard.
   No localStorage / IndexedDB / cookies; no network requests except loading this app's own static files. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let cvReady=null,ocrWorker=null,current=null;
const D=window.ReqDict;
const APP_VERSION='v3.8.9'; // must match version.json and VERSION in sw.js
const APP_DATE='2026-10-15';

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
  finally{$('cam').value='';$('cam2').value='';$('pick').value='';}}

function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}for(const k of kids)if(k)e.appendChild(typeof k==='string'?document.createTextNode(k):k);return e;}

/* ui2: Step 1 'Confirm tests' - compact list; flagged lines (red possible missed line / not recognised, amber check) first and expanded;
   what the scan read, section and form notes sit behind a small tap on each row. Same item states and selection logic as v3.7. */
function render(r){
  const L=$('layout');L.innerHTML='';
  const line=(cls,text)=>L.appendChild(el('div',{class:'stat '+cls,text}));
  const warn=r.items.filter(i=>i.warn);const tests=r.items.filter(i=>!i.warn);
  const nv=tests.filter(i=>i.status!=='ok'&&i.checked!==false).length;
  if(warn.length)line('stop',`${warn.length} possible missed line${warn.length>1?'s':''} – a ticked box was seen but not read. Check the paper.`);
  if(r.layout!=='list'&&r.layout!=='grid'&&!r.manual){line('check','Form layout not recognised – tick the tests by hand.');if(r.reason)L.appendChild(el('div',{class:'small stat-sub',text:r.reason}));}
  if(r.warning)line('check',r.warning);
  if(r.lowRes)line('check','Low-resolution photo – results are less reliable. Use the full camera and fill the frame.');
  if(r.standingOrder){const so=r.standingOrder;line('neutral so-banner','Standing order ('+(so.all?'all tests':so.count+' of '+so.total+' tests')+'): '+so.text);}
  const nt=tests.filter(i=>i.checked!==false).length;
  const form=r.layout==='list'?'Printed test list':r.layout==='grid'?'LifeLabs D2350'+(r.info.formVersion?' ('+r.info.formVersion+')':''):'';
  $('stepsub1').textContent=r.manual?'Add each test from the requisition':`${nt} read${nv+warn.length?` · ${nv+warn.length} to check`:''} · tick each against the paper${form?' · '+form:''}`; // turn 48 (Confirm A)
  const list=$('list');list.innerHTML='';
  const frank=i=>i.warn?0:i.status==='unrecognized'?1:2; // red first (possible missed line, not recognised), then amber
  const flagged=r.items.filter(i=>i.warn||(i.checked!==false&&i.status!=='ok')).sort((a,b)=>frank(a)-frank(b));
  const ok=r.items.filter(i=>!i.warn&&i.checked!==false&&i.status==='ok');
  const unt=r.items.filter(i=>!i.warn&&i.checked===false);
  r.items.forEach((it,i)=>{it._i=i;});
  /* turn 48 (Confirm A): each flagged line is its own card (red: possible missed / not recognised, amber: check); confirmed lines share one green-edged card */
  for(const it of flagged)list.appendChild(el('div',{class:'ccard '+(it.warn||it.status==='unrecognized'?'red':'amb')},itemEl(it,r)));
  const g=el('div',{class:'ccard ok',id:'grpTests'});for(const it of ok)g.appendChild(itemEl(it,r));list.appendChild(g);
  if(unt.length){const d=el('details',{class:'dx grp-unt'},el('summary',{text:unt.length+' line'+(unt.length>1?'s':'')+' not ticked on the form'}));const b=el('div',{class:'dx-body'});for(const it of unt)b.appendChild(itemEl(it,r));d.appendChild(b);list.appendChild(d);}
  const nb=(r.info.columnBoxes!=null?r.info.columnBoxes:(r.info.boxesFound||0))+(r.info.looseMarks||0);
  $('timing').textContent=r.manual?'Manual entry (no photo) · app '+APP_VERSION:`Processed on device in ${(r.ms/1000).toFixed(1)} s · rotation ${Math.round(r.info.rotation||0)}° · ${nb} checkbox(es) seen${r.info.looseMarks?` (${r.info.looseMarks} faint)`:''} · ${tests.length} test line(s) read${warn.length?` · ${warn.length} unread`:''} · app ${APP_VERSION}`;
  updConfirm();
  const ov=$('overlay');if(r.image){drawOverlay(r);ov.classList.remove('hidden');}else ov.classList.add('hidden');}

function itemEl(it,r){
  const flag=it.warn||(it.checked!==false&&it.status!=='ok');
  const cls='item '+(it.warn?'missed':it.checked===false?'unticked':it.status);const cb=el('input',{type:'checkbox'});// ui2 (2026-10-13, K. Williams): every scanned line starts UNchecked - the nurse confirms each test against the paper. Manually added
  // tests start checked (the nurse picked them). it.selected survives Back to tests (the list DOM is kept, not rebuilt).
  if(it.selected===undefined)it.selected=!!it.manual;cb.checked=it.selected;
  cb.addEventListener('change',()=>{it.selected=cb.checked;updConfirm();});
  const nameTxt=el('span',{class:'nm',text:it.warn?'Possible missed line':it.id?(it.testName):(it.name||it.raw||'(unreadable line)')});
  const title=el('span',{class:'name'},nameTxt);
  if(it.status==='verify')title.appendChild(el('span',{class:'badge',text:it.boxDetected===false?'check box?':'check'}));
  if(it.status==='unrecognized')title.appendChild(el('span',{class:'badge bad',text:'not recognised'}));
  if(it.checked===false)title.appendChild(el('span',{class:'badge grey',text:'unticked'}));
  const lab=el('label',{class:'rowlab'},cb,title);
  // what the scan read + section + notes: behind a small tap for normal rows, shown for flagged rows
  const more=el('div',{class:'more'});
  const readTxt=it.raw&&(!it.id||it.status!=='ok'||D.norm(it.name)!==D.norm(it.testName))?'Read on form: “'+(it.name||it.raw)+'”'+(it.section?' · under '+it.section:''):it.section?'Under '+it.section:'';
  if(readTxt)more.appendChild(el('div',{class:'raw',text:readTxt}));
  const soAll=r&&r.standingOrder&&r.standingOrder.all;let nNotes=0;
  for(const n of it.notes||[]){if(n.common&&soAll)continue;nNotes++;if(n.common){more.appendChild(el('div',{class:'note so',text:'Standing order: as above'}));continue;}more.appendChild(el('div',{class:'note'+(n.type==='standing order'?' so':''),text:(n.type==='standing order'?'Standing order: ':n.type==='frequency'?'Repeats: ':n.type.replace(/^./,c=>c.toUpperCase())+': ')+n.text}));}
  if(nNotes)title.appendChild(el('span',{class:'tag',text:nNotes>1?nNotes+' notes':'note'}));
  const body=el('div',{class:'body'},lab);
  if(it.warn){body.appendChild(el('div',{class:'raw strong',text:'A ticked box was found here but the test could not be read. Find this line on the paper and choose the test below, or add it.'}));
    if(it.crop){const c=el('canvas',{class:'crop'});c.width=it.crop.width;c.height=it.crop.height;c.getContext('2d').putImageData(new ImageData(it.crop.data,it.crop.width,it.crop.height),0,0);body.appendChild(c);}}
  let tog=null;
  if(more.children.length){if(flag)body.appendChild(more);
    else{more.hidden=true;tog=el('button',{type:'button',class:'moreb','aria-expanded':'false','aria-label':'Show what the scan read',text:'⋯'});
      tog.addEventListener('click',()=>{more.hidden=!more.hidden;tog.setAttribute('aria-expanded',String(!more.hidden));});body.appendChild(more);}}
  if(!it.id||it.status==='verify'){const sel=el('select',{'aria-label':'Choose the matching test'});sel.appendChild(el('option',{value:'',text:it.id?'Change test…':'Choose matching test…'}));
    for(const t of D.TESTS.slice().sort((a,b)=>a[1].localeCompare(b[1])))sel.appendChild(el('option',{value:t[0],text:t[1]}));
    sel.addEventListener('change',()=>{if(!sel.value)return;const e=D.BYID[sel.value];it.id=e.id;it.testName=e.name;it.category=e.category;it.status='ok';it.manual=true;cb.checked=true;it.selected=true;updConfirm();nameTxt.textContent=e.name;});
    body.appendChild(sel);}
  const row=el('div',{class:cls+(flag?' flagged':'')},body,tog);
  /* turn 48: round ✕ removes the line from the list (and from the plan) */
  const x=el('button',{type:'button',class:'xrm','aria-label':'Remove '+nameTxt.textContent,text:'✕'});
  x.addEventListener('click',()=>{it.removed=true;it.selected=false;const card=row.closest('.ccard');row.remove();if(card&&card.id!=='grpTests'&&!card.querySelector('.item'))card.remove();updConfirm();});
  row.appendChild(x);return row;}

/* ui2: Build plan stays disabled until at least one test is ticked */
function updConfirm(){const n=current?current.items.filter(i=>i.selected).length:0;const b=$('confirm');b.disabled=!n;
  b.textContent='Build plan · '+n+' ticked'; // turn 48 (Confirm A)
  $('confirmHint').hidden=true;} // turn 48: hint now in the subtitle ('tick each against the paper')
function drawOverlay(r){const cv=window.cv;const c=$('overlay');const m=r.image;const rgba=new cv.Mat();cv.cvtColor(m,rgba,cv.COLOR_GRAY2RGBA);
  for(const it of r.items){const col=it.checked===false?[150,150,150,255]:it.status==='ok'?[0,160,0,255]:it.status==='verify'?[230,140,0,255]:[220,0,0,255];
    const b=it.bbox;if(b)cv.rectangle(rgba,new cv.Point(b.x-4,b.y-4),new cv.Point(b.x+b.w+4,b.y+b.h+4),col,4);
    const lb=it.lineBox;if(lb)cv.rectangle(rgba,new cv.Point(lb.x0,lb.y0),new cv.Point(lb.x1,lb.y1),col,2);}
  const s=Math.min(1,1400/Math.max(rgba.cols,rgba.rows));const d=new cv.Mat();cv.resize(rgba,d,new cv.Size(Math.round(rgba.cols*s),Math.round(rgba.rows*s)),0,0,cv.INTER_AREA);
  cv.imshow(c,d);rgba.delete();d.delete();m.delete();r.image=null;}

function reset(){ if(typeof liveStop==='function')liveStop(); // wipe everything from memory and screen (incl. in-memory line crops)
  if(current&&current.image){try{current.image.delete();}catch(e){}}if(current)for(const it of current.items||[])it.crop=null;current=null;
  for(const c of document.querySelectorAll('canvas.crop')){c.width=c.height=0;}
  $('list').innerHTML='';$('layout').innerHTML='';$('summary').innerHTML='';$('timing').textContent='';$('addTest').value='';
  const c=$('overlay');c.width=c.height=0;c.classList.add('hidden');$('cam').value='';$('cam2').value='';$('pick').value='';show('start');}

$('cam').addEventListener('change',e=>handleFile(e.target.files[0]));
$('pick').addEventListener('change',e=>handleFile(e.target.files[0]));
$('cam2').addEventListener('change',e=>handleFile(e.target.files[0]));
/* turn 52 (K. Williams, Option A): manual entry - straight to Confirm tests with an empty list; 'Add a test' is at the top (no focus/scroll code) */
$('manual').addEventListener('click',()=>{if(typeof liveStop==='function')liveStop();current={items:[],layout:'manual',manual:true,info:{},ms:0};render(current);show('result');});
/* ---- turn 51 prototype: in-app live camera (getUserMedia, rear camera) in a 1.2:1 frame ----
   Tap the viewfinder -> live preview (object-fit:cover). Shutter -> grabs ONLY the framed region of the current video frame at the
   stream's native resolution (no downscale beyond the pipeline's own 2500 px cap) and feeds handleFile(). Nothing leaves the device.
   Fallbacks: no getUserMedia / not secure / permission denied / no camera -> the viewfinder and shutter keep using the native
   camera file input (#cam / #cam2); Library (#pick) is unchanged. Stream is stopped on capture, discard, finish and when hidden. */
const LIVE={stream:null,failed:false,on:()=>!!LIVE.stream};
const liveOk=()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.isSecureContext)&&!LIVE.failed;
function liveMsg(t){const m=$('liveMsg');m.textContent=t||'';m.classList.toggle('hidden',!t);}
function liveStop(){if(LIVE.stream){for(const tr of LIVE.stream.getTracks())tr.stop();LIVE.stream=null;}const v=$('live');v.srcObject=null;v.classList.add('hidden');$('vf').classList.remove('is-live');}
async function liveStart(){
  try{const s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
    LIVE.stream=s;const v=$('live');v.srcObject=s;v.classList.remove('hidden');$('vf').classList.add('is-live');liveMsg('');await v.play().catch(()=>{});
    const tr=s.getVideoTracks()[0];const st=tr&&tr.getSettings?tr.getSettings():{};LIVE.info=(st.width||'?')+'×'+(st.height||'?');
    $('vf').setAttribute('data-res',LIVE.info);}
  catch(e){LIVE.failed=true;liveStop();liveMsg(e&&e.name==='NotAllowedError'?'Camera not allowed - tap again to use the camera app':'Live camera unavailable - tap again to use the camera app');}}
function liveGrab(){const v=$('live'),vf=$('vf');const vw=v.videoWidth,vh=v.videoHeight;if(!vw||!vh)return null;
  // object-fit:cover mapping: the visible frame (vf box) is the centred crop of the video with the frame's aspect ratio
  const r=vf.getBoundingClientRect();const fa=r.width/r.height;let cw=vw,ch=vh;if(vw/vh>fa)cw=Math.round(vh*fa);else ch=Math.round(vw/fa);
  const c=document.createElement('canvas');c.width=cw;c.height=ch;c.getContext('2d').drawImage(v,(vw-cw)/2,(vh-ch)/2,cw,ch,0,0,cw,ch);
  return new Promise(res=>c.toBlob(b=>{c.width=c.height=0;res(b);},'image/jpeg',0.95));}
$('vf').addEventListener('click',e=>{if(!liveOk())return; /* native input fallback */ e.preventDefault();if(!LIVE.on())liveStart();});
/* turn 53 (K. Williams iPhone bug, v3.8.9): the shutter was a <label> wrapping the camera file input, so a tap before the live camera ran
   opened the native camera. Now a <button>: not live -> start the in-app camera (same as the viewfinder); live -> capture; only after the
   in-app camera failed (or is unsupported) does it open the native camera, synchronously inside the tap so iOS allows the file picker. */
$('shut').addEventListener('click',async e=>{e.preventDefault();
  if(LIVE.on()){const b=await liveGrab();liveStop();if(b){b.name='live.jpg';handleFile(b);}return;}
  if(liveOk()){liveStart();return;}
  $('cam2').click();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')liveStop();});
$('discard').addEventListener('click',reset);$('finish').addEventListener('click',()=>{if(history.state&&history.state.ui2==='plan')history.replaceState(null,'');reset();});
function addManual(v,pickId){if(!v||!current)return;const m=pickId?null:D.match(v);
  const exact=pickId?D.TESTS.find(t=>t[0]===pickId):D.TESTS.find(t=>t[1]===v);const e=exact?D.BYID[exact[0]]:(m&&m.score>0.7?m:null);
  const it={id:e?e.id:null,testName:e?e.name:v,name:e&&pickId?e.name:v,raw:'',category:e?e.category:'Other',status:e?'ok':'unrecognized',checked:true,notes:[],manual:true};
  it.selected=true;current.items.push(it);const g=$('grpTests');if(g)g.appendChild(itemEl(it));else $('list').appendChild(el('div',{class:'ccard ok',id:'grpTests'},itemEl(it)));$('addTest').value='';taClose();updConfirm();}
$('addBtn').addEventListener('click',()=>addManual($('addTest').value.trim()));
/* ui2 turn 30: Add-test type-ahead (on-device; names + all aliases incl. held-back ones via ReqDict.suggest). Keyboard: arrows, Enter, Esc. */
/* ui2 turn 40 (K. Williams iPhone recording, v3.8.5): the field now sits at the TOP of Confirm tests, so there is NO scroll/resize logic
   (no scrollIntoView/scrollTo/visualViewport, nothing runs on input except rebuilding the list). Selection logic unchanged (it works). */
let taItems=[],taAct=-1;const taIn=$('addTest'),taList=$('addList');
function taClose(){taList.classList.add('hidden');taList.innerHTML='';taItems=[];taAct=-1;taIn.setAttribute('aria-expanded','false');taIn.removeAttribute('aria-activedescendant');}
function taMark(i){taAct=i;[...taList.children].forEach((li,k)=>{li.classList.toggle('act',k===i);li.setAttribute('aria-selected',String(k===i));});
  if(i>=0)taIn.setAttribute('aria-activedescendant','ta'+i);else taIn.removeAttribute('aria-activedescendant');}
function taOpen(){const q=taIn.value.trim();if(!q){taClose();return;}taItems=D.suggest(q,8);taList.innerHTML='';taAct=-1;
  if(!taItems.length){taClose();return;}
  taItems.forEach((s,i)=>{const li=el('li',{id:'ta'+i,role:'option','aria-selected':'false',class:'ta-item'},el('span',{class:'ta-name',text:s.name}),s.matched?el('span',{class:'ta-aka',text:'also called '+s.matched}):null);
    li.addEventListener('mousedown',e=>e.preventDefault());li.addEventListener('click',()=>addManual(s.name,s.id)); // selection unchanged from turn 30 (works on iPhone)
    taList.appendChild(li);});
  taList.classList.remove('hidden');taIn.setAttribute('aria-expanded','true');}
taIn.addEventListener('input',taOpen);
taIn.addEventListener('focus',()=>{if(taIn.value.trim())taOpen();});
taIn.addEventListener('keydown',e=>{const open=!taList.classList.contains('hidden');
  if(e.key==='ArrowDown'){e.preventDefault();if(!open)taOpen();else taMark(Math.min(taAct+1,taItems.length-1));}
  else if(e.key==='ArrowUp'){e.preventDefault();if(open)taMark(Math.max(taAct-1,0));}
  else if(e.key==='Enter'){e.preventDefault();if(open&&taAct>=0)addManual(taItems[taAct].name,taItems[taAct].id);else if(open&&taItems.length===1)addManual(taItems[0].name,taItems[0].id);else addManual(taIn.value.trim());}
  else if(e.key==='Escape'){taClose();}});
document.addEventListener('pointerdown',e=>{if(!taList.classList.contains('hidden')&&!e.target.closest('.ta-wrap'))taClose();});
let listY=0;
$('confirm').addEventListener('click',()=>{if(!current)return;listY=window.scrollY;const sel=current.items.filter(i=>i.selected);
  // v3.2: Collection Summary from the on-device LifeLabs data file (js/collection_data.js); in memory only
  const items=sel.map(it=>({id:it.id||null,name:it.testName||it.name||it.raw,notes:(it.notes||[]).filter(n=>n.text).map(n=>({type:n.type,text:n.text}))}));
  window.CollectionSummary.render($('summary'),items);show('done');window.scrollTo(0,0);
  // ui2: a history entry for the plan, so the phone/browser back gesture returns to Confirm tests (scan + ticks kept)
  if(!(history.state&&history.state.ui2==='plan'))history.pushState({ui2:'plan'},'');});
/* ui2 (2026-10-13): Back to tests - the Confirm tests screen is only hidden while the plan shows, so the scan, crops and ticks are intact */
function backToTests(){if(!current||$('done').classList.contains('hidden'))return;show('result');updConfirm();window.scrollTo(0,listY);}
$('back').addEventListener('click',()=>{if(history.state&&history.state.ui2==='plan')history.back();else backToTests();});
window.addEventListener('popstate',()=>backToTests());
$('print').addEventListener('click',()=>window.print());
// warm up engines in the background (still fully local)
window.addEventListener('load',()=>{waitCv().then(()=>{$('engine').textContent='Engine: image engine ready (on-device).';});
  $('ver').textContent='App '+APP_VERSION+' ('+APP_DATE+')';
  setupUpdates();});

/* ---- Reliable updates ----
   sw.js is never served from the HTTP cache (updateViaCache:'none'); we ask for an update on load and whenever the app comes
   back to the foreground (iOS home-screen apps are often resumed, not relaunched). The SW is network-first for the app shell,
   so a reload always gets the latest deploy. version.json is compared with the running code to offer a manual reload. */
function idle(){return !current&&!$('start').classList.contains('hidden');}
function showUpdateBanner(){
  if($('updBanner'))return;const b=document.createElement('button');b.id='updBanner';b.className='upd-banner';b.type='button';
  b.textContent='Update available - tap to reload';
  b.addEventListener('click',()=>{if(!idle()&&!confirm('Reload now? The current scan will be cleared.'))return;
    b.textContent='Updating…';const go=()=>location.reload();
    (swReg?swReg.update().catch(()=>{}):Promise.resolve()).then(go,go);setTimeout(go,4000);});
  document.body.appendChild(b);}
async function checkVersion(){
  try{const r=await fetch('version.json',{cache:'no-store'});if(!r.ok)return;const j=await r.json();
    if(j&&j.version&&j.version!==APP_VERSION)showUpdateBanner();}catch(e){/* offline: nothing to do */}}
let swReg=null,lastCheck=0;
function checkForUpdates(){const now=Date.now();if(now-lastCheck<15000)return;lastCheck=now;
  if(swReg)swReg.update().catch(()=>{});checkVersion();}
function setupUpdates(){
  if(!('serviceWorker' in navigator)){checkVersion();return;}
  const sw=navigator.serviceWorker;let hadController=!!sw.controller,reloading=false;
  sw.register('sw.js',{updateViaCache:'none'}).then(reg=>{swReg=reg;lastCheck=0;checkForUpdates();}).catch(()=>{checkVersion();});
  // a newer version took over: reload once (guarded), but only when idle on the start screen (never during a scan/review)
  sw.addEventListener('controllerchange',()=>{
    if(!hadController){hadController=true;return;} // first install claiming this page: nothing new to load
    if(reloading)return;
    if(idle()){reloading=true;location.reload();}else showUpdateBanner();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdates();});
  window.addEventListener('pageshow',ev=>{if(ev.persisted)checkForUpdates();});
}
})();
