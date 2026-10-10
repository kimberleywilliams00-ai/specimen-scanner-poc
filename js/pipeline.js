/* Requisition scan pipeline (browser + Node). Everything in memory; caller supplies an OCR function
   ocr(grayMat,{psm}) -> {conf, lines:[{text,conf,bbox:{x0,y0,x1,y1},words:[{text,conf,bbox}]}]}.
   No storage, no network. */
(function(root){
'use strict';
const isNode=typeof module!=='undefined'&&module.exports;
const P=isNode?require('./preprocess.js'):root.ReqPre;
const D=isNode?require('./dictionary.js'):root.ReqDict;
const TPL=isNode?require('./template_d2350.js'):root.ReqTplD2350;
const CHECK_THR=0.12;           // interior ink fraction above which a box counts as ticked
const OK_SCORE=0.85, VERIFY_SCORE=0.62;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};

function analyse(cv,img,allowFlip){
  const bin=P.binarize(cv,img);const clean=P.removeRules(cv,bin,img.cols*0.06);
  const boxes=P.findBoxes(cv,clean,{allowFlip});
  // OCR image: normalised gray with form rules painted white
  const rules=new cv.Mat();cv.subtract(bin,clean,rules);bin.delete();
  const ocrImg=img.clone();ocrImg.setTo(new cv.Scalar(255),rules);rules.delete();
  return {clean,boxes,ocrImg};}

async function scan(cv,src,ocr,opts){
  opts=opts||{};const T={};let t=Date.now();const lap=k=>{const n=Date.now();T[k]=n-t;t=n;};
  // pass 1: orientation + checkbox scale
  let p1=P.preprocess(cv,src,{targetLong:1600});let a1=analyse(cv,p1.img,true);
  // axis check: checkboxes with text beside them only line up when text lines are horizontal.
  // If few are found, also try the perpendicular axis and keep whichever finds more (robust to page edges/desk texture).
  const nOk=a=>{const B=a.boxes;if(!B.length)return 0;let best=0;for(const b of B){const n=B.filter(o=>Math.abs(o.x-b.x)<0.8*B.med).length;if(n>best)best=n;}return best;}; // largest vertical column of checkboxes
  if(nOk(a1)<4){const alt=p1.info.rotation+(p1.info.rotation>45?-90:90);const p1b=P.preprocess(cv,src,{targetLong:1600,rotation:alt});const a1b=analyse(cv,p1b.img,true);
    if(nOk(a1b)>nOk(a1)&&nOk(a1b)>=4){a1.clean.delete();a1.ocrImg.delete();p1.img.delete();p1=p1b;a1=a1b;}else{a1b.clean.delete();a1b.ocrImg.delete();p1b.img.delete();}}
  const rot=p1.info.rotation,flip=a1.boxes.flip,med1=a1.boxes.med||0,n1=a1.boxes.length;a1.clean.delete();a1.ocrImg.delete();p1.img.delete();lap('pass1');
  // pass 2: rescale so a checkbox is ~34 px (cap height ~25 px, good for Tesseract)
  const target=med1?clamp(1600*34/med1,1400,3800):2600;
  const p2=P.preprocess(cv,src,{targetLong:target,rotation:rot});let img=p2.img;
  if(flip){const r=P.rotate180(cv,img);img.delete();img=r;}
  let {clean,boxes,ocrImg:ocrIn}=analyse(cv,img,false);lap('pass2');
  const info={rotation:rot+(flip?180:0),pageQuad:p2.info.pageQuad,workSize:[img.cols,img.rows],boxesFound:boxes.length,boxSize:boxes.med};
  // OCR region: list forms -> only the band around detected checkboxes (skips patient/signature areas, faster)
  const grid=boxes.length>=35;let roi=null;
  if(boxes.length&&!grid){const s=boxes.med;const y0=Math.min(...boxes.map(b=>b.y)),y1=Math.max(...boxes.map(b=>b.y+b.h)),x0=Math.min(...boxes.map(b=>b.x));
    roi={x:Math.max(0,Math.round(x0-1.5*s)),y:Math.max(0,Math.round(y0-4.2*s))};roi.w=img.cols-roi.x;roi.h=Math.min(img.rows,Math.round(y1+5*s))-roi.y;}
    let sub=roi?ocrIn.roi(new cv.Rect(roi.x,roi.y,roi.w,roi.h)):ocrIn;
  let res=await ocr(sub,{psm:grid?'3':'4'});lap('ocr');
  if(!boxes.length){ // orientation not confirmed by checkboxes: try 180 and keep the better read
    const r180=P.rotate180(cv,ocrIn);const res2=await ocr(r180,{psm:'4'});
    if(score(res2)>score(res)*1.15){res=res2;const i2=P.rotate180(cv,img);img.delete();img=i2;const c2=P.rotate180(cv,clean);clean.delete();clean=c2;const o2=P.rotate180(cv,ocrIn);ocrIn.delete();ocrIn=o2;info.rotation+=180;}
    r180.delete();lap('ocr180');}
  if(roi)sub.delete();
  const lines=(res.lines||[]).map(l=>shift(l,roi)).filter(l=>l.text.trim());
  const allText=lines.map(l=>l.text).join('\n');if(typeof process!=='undefined'&&process.env&&process.env.DEBUG_TEXT)console.log(allText);
  let out=null;
  const d2350=/D\s?2\s?3\s?5\s?0/i.test(allText);
  if(grid||d2350){
    // fixed-grid form: identify layout by fitting the LifeLabs D2350 template to printed landmarks + checkboxes
    out=gridMode(cv,clean,boxes,lines,ocrIn);
    if(out.layout==='grid'){
      info.formCode='D2350';let ver=parseVer(allText);const reads=[ver];
      // re-read the tiny form code where the template says it is, magnified, digits only
      const c0=ap(out.M,559,773),c1=ap(out.M,598,784);const h=Math.abs(c1[1]-c0[1]);
      const x=Math.max(0,Math.round(c0[0])),y=Math.max(0,Math.round(c0[1])),w=Math.min(ocrIn.cols-x,Math.round(c1[0]-c0[0])),hh=Math.min(ocrIn.rows-y,Math.round(c1[1]-c0[1]));
      if(w>5&&hh>5){const sub=ocrIn.roi(new cv.Rect(x,y,w,hh));const big=P.resize(cv,sub,Math.max(1,70/Math.max(1,h)));sub.delete();const pad=new cv.Mat();cv.copyMakeBorder(big,pad,20,20,20,20,cv.BORDER_CONSTANT,new cv.Scalar(255));big.delete();
const rr=await ocr(pad,{psm:'7',whitelist:'D0123456789()/ '});pad.delete();const v2=parseVer((rr.lines||[]).map(l=>l.text).join(' '));reads.push(v2,(rr.lines||[]).map(l=>l.text).join(' '));
        if(v2&&TPL.versions.includes(v2))ver=v2;else if(!(ver&&TPL.versions.includes(ver)))ver=v2||ver;}
      info.formVersion=ver;info.versionReads=reads;
      if(ver&&!TPL.versions.includes(ver))out={layout:'unknown',reason:'LifeLabs D2350 requisition version '+ver+' has no validated template yet - please confirm tests manually.',items:[]};
      else if(!ver){out.versionUnconfirmed=true;for(const it of out.items)it.status='verify';out.warning='Layout matches LifeLabs D2350 but the version code could not be read - please verify each test.';}
      delete out.M;
    } else if(d2350){out.reason='LifeLabs D2350 requisition detected but the template could not be aligned - please confirm tests manually.';}
  }
  if(!out)out=await listMode(lines,boxes,(b,s)=>ocrBoxLine(cv,ocrIn,ocr,b,s),r=>P.inkFrac(clean,r.x,r.y,r.x+r.w,r.y+r.h));
  if(out.layout==='list'&&!out.items.length)out={layout:'unknown',reason:'No ordered-test lines with checkboxes were found.',items:[]};
  lap('parse');
  out.info=info;out.timings=T;out.timings.total=Object.values(T).reduce((a,b)=>a+b,0);
  if(opts.keepImage){out.image=img;out.boxes=boxes;}else img.delete();
  clean.delete();ocrIn.delete();return out;}
// OCR the text line to the right of a checkbox, locally deskewed (handles sloped lines from angled photos)
async function ocrBoxLine(cv,img,ocr,b,s){
  const cy=b.y+b.h/2,x0=Math.round(b.x+b.w+0.12*s),y0=Math.max(0,Math.round(cy-2.2*s));const w=Math.min(img.cols-x0,Math.round(34*s)),h=Math.min(img.rows-y0,Math.round(4.4*s));
  if(w<10||h<10)return {lines:[]};const reg=img.roi(new cv.Rect(x0,y0,w,h));const pv=[0,cy-y0];
  const bin=new cv.Mat();cv.threshold(reg,bin,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);
  let best=0,bs=-1;for(let a=-6;a<=6;a+=0.75){const M=cv.getRotationMatrix2D(new cv.Point(pv[0],pv[1]),a,1);const r=new cv.Mat();cv.warpAffine(bin,r,M,new cv.Size(w,h),cv.INTER_NEAREST,cv.BORDER_CONSTANT,new cv.Scalar(0));M.delete();
    const red=new cv.Mat();cv.reduce(r,red,1,cv.REDUCE_SUM,cv.CV_32S);r.delete();
    // energy concentrated in the band around the box centre row
    let band=0,tot=0;for(let y=0;y<red.rows;y++){const v=red.data32S[y];tot+=v;if(Math.abs(y-pv[1])<0.55*s)band+=v;}red.delete();const sc=tot?band/tot:0;if(sc>bs){bs=sc;best=a;}}
  bin.delete();
  const M=cv.getRotationMatrix2D(new cv.Point(pv[0],pv[1]),best,1);const rot=new cv.Mat();cv.warpAffine(reg,rot,M,new cv.Size(w,h),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255));M.delete();reg.delete();
  const yy=Math.max(0,Math.round(pv[1]-0.78*s)),hh=Math.min(rot.rows-yy,Math.round(1.56*s));const band=rot.roi(new cv.Rect(0,yy,rot.cols,hh));
  // pad with white margin (Tesseract prefers some border)
  const pad=new cv.Mat();cv.copyMakeBorder(band,pad,10,10,10,10,cv.BORDER_CONSTANT,new cv.Scalar(255));band.delete();rot.delete();
  const res=await ocr(pad,{psm:'7'});pad.delete();return {lines:res.lines||[],angle:best};}
async function ocrStrip(cv,img,ocr,r,psm){const x=Math.max(0,Math.round(r.x)),y=Math.max(0,Math.round(r.y));const w=Math.min(img.cols-x,Math.round(r.w)),h=Math.min(img.rows-y,Math.round(r.h));if(w<8||h<8)return {lines:[]};
  const sub=img.roi(new cv.Rect(x,y,w,h));const res=await ocr(sub,{psm:psm||'7'});sub.delete();return {lines:(res.lines||[]).map(l=>shift(l,{x,y}))};}

function parseVer(t){const m=(t||'').match(/[D0O]\s?2\s?3\s?5\s?0\s*[\(\[{]?\s*([0-9OoIl|\/ ]{4,7})/i);if(!m)return null;
  const s=m[1].replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/\s/g,'');let k=s.match(/^(\d\d)\/(\d\d)/);if(k)return k[1]+'/'+k[2];
  k=s.match(/^(\d\d)[17](\d\d)/);if(k)return k[1]+'/'+k[2];k=s.match(/^(\d\d)(\d\d)$/);if(k)return k[1]+'/'+k[2];return null;}
function score(r){return (r.lines||[]).reduce((a,l)=>a+(l.conf||0)*l.text.replace(/[^A-Za-z]/g,'').length,0);}
function shift(l,roi){if(!roi)return l;const sb=b=>({x0:b.x0+roi.x,x1:b.x1+roi.x,y0:b.y0+roi.y,y1:b.y1+roi.y});
  return {text:l.text,conf:l.conf,bbox:sb(l.bbox),words:(l.words||[]).map(w=>({text:w.text,conf:w.conf,bbox:sb(w.bbox)}))};}

const GLYPH=/^[\[\(|{]?[MmWwNn&©®@✓✔☑☐☒OoDBEe™Z4Y¥vVxX\]\|}]{1,3}[\]\)|}]?$/;
function segments(words,gap){const segs=[];let cur=[];for(const w of words){if(cur.length&&w.bbox.x0-cur[cur.length-1].bbox.x1>gap){segs.push(cur);cur=[];}cur.push(w);}if(cur.length)segs.push(cur);return segs;}
const segText=ws=>ws.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();

async function listMode(lines,boxes,boxOcr,fillAt){
  const s=boxes.med||median(lines.flatMap(l=>l.words.map(w=>w.bbox.y1-w.bbox.y0)))||30;
  const L=lines.map((l,i)=>({i,text:l.text.trim(),bbox:l.bbox,words:l.words.slice().sort((a,b)=>a.bbox.x0-b.bbox.x0),cy:(l.bbox.y0+l.bbox.y1)/2,used:false}));
  const headers=[];const items=[];
  // stop line (signature/date block) – ignore everything below it
  const firstY=boxes.length?Math.min(...boxes.map(b=>b.y)):0;
  let stopY=Infinity;for(const l of L){if(l.cy>firstY&&D.isStop(l.text)&&l.cy<stopY)stopY=l.cy;}
  // 1) box-anchored lines
  const bs=boxes.slice().sort((a,b)=>a.y-b.y);
  for(const b of bs){if(b.y>stopY)continue;const by=b.y+b.h/2;let best=null,bd=1e9;
    for(const l of L){if(l.bbox.y0>b.y+b.h+0.35*s||l.bbox.y1<b.y-0.35*s)continue;if(l.bbox.x1<b.x+b.w||l.bbox.x0>b.x+b.w+3*s)continue;
      const d=Math.abs(l.cy-by)+0.4*Math.max(0,l.bbox.x0-(b.x+b.w+1.5*s))+(l.owner?0.6*s:0);if(d<bd){bd=d;best=l;}}
    if(best&&best.owner){ // a line can belong to only one box: keep the closer one
      const o=best.owner;if(Math.abs(best.cy-(o.y+o.h/2))<=Math.abs(best.cy-by))best=null;else{const it=items.find(x=>x.box===o);if(it){it.line=null;it.raw='';it.needsReocr=true;}}}
    let words=[];if(best){best.used=true;best.owner=b;words=best.words.filter(w=>w.bbox.x0>=b.x+b.w-0.1*s||(w.bbox.x1>b.x+b.w+0.6*s));
      // drop checkbox glyph remnants that overlap the box
      while(words.length&&words[0].bbox.x0<b.x+b.w+0.25*s&&GLYPH.test(words[0].text))words.shift();
      if(words.length&&words[0].bbox.x0<b.x+b.w-0.1*s&&/^[MmNnWw&]/.test(words[0].text)&&words[0].text.length>1)words[0]=Object.assign({},words[0],{text:words[0].text.slice(1)});}
    const segs=segments(words,2.2*s);let main=segs.length?segs[0]:[];
    for(const sg of segs.slice(1)){const h=D.headerOf(segText(sg));if(h)headers.push({h,y:by});else main=main.concat(sg);}
    items.push({box:b,line:best,y:by,x:b.x+b.w,raw:segText(main),checked:b.fill>=CHECK_THR,fill:+b.fill.toFixed(3),boxDetected:true});}
  const textX=median(items.map(it=>it.line?it.line.bbox.x0:it.x))||0;const boxX=median(bs.map(b=>b.x));
  // 2) remaining lines: headers, continuation of the line above, or test lines whose box was not detected
  const top=Math.min(firstY||Infinity,...L.filter(l=>D.headerOf(l.text)).map(l=>l.bbox.y0))-0.5*s;
  for(const l of L){if(l.used||l.cy>=stopY||l.cy<top-3*s)continue;
    const h=D.headerOf(l.text);if(h){headers.push({h,y:l.cy});continue;}
    if(l.cy<top)continue;
    let ws=l.words.slice();let glyph=false;if(ws.length>1&&GLYPH.test(ws[0].text)&&ws[1].bbox.x0-ws[0].bbox.x1<1.2*s){ws.shift();glyph=true;}
    const segs=segments(ws,2.2*s);let txt=segs.length?segText(segs[0]):'';for(const sg of segs.slice(1)){const hh=D.headerOf(segText(sg));if(hh)headers.push({h:hh,y:l.cy});else txt+=' '+segText(sg);}
    if(txt.replace(/[^A-Za-z0-9]/g,'').length<3)continue;           // stray marks, e.g. a lone 'c'
    const m=D.match(D.splitNotes(txt).name);
    const above=items.filter(it=>it.y<l.cy&&l.bbox.y0-(it.line?it.line.bbox.y1:it.y)<1.3*s).sort((a,b)=>b.y-a.y)[0];
    // local checkbox column: interpolate from the nearest detected boxes above/below (photos are skewed)
    const nb=bs.slice().sort((a,b)=>Math.abs(a.y-l.cy)-Math.abs(b.y-l.cy)).slice(0,2);const locX=nb.length?nb.reduce((a,b)=>a+b.x,0)/nb.length:boxX;
    const atBox=boxes.length?Math.abs(l.bbox.x0-locX)<0.9*s:false;const atText=Math.abs(l.bbox.x0-(locX+1.4*s))<1.5*s;
    const cont=above&&continuationLikely(above.raw,txt,l,above,s)&&!atBox&&!glyph&&(above.cont||0)<2;
    if(m&&((m.score>=0.8&&(glyph||atBox||atText))||(m.score>=0.9&&!cont))){
      // checkbox glyph seen by OCR but not by the box detector: measure its ink directly
      let fill=null;const g=l.words[0];if(glyph&&fillAt){const gw=g.bbox.x1-g.bbox.x0,gh=g.bbox.y1-g.bbox.y0;if(gw>0.5*s&&gh>0.5*s&&gw<1.6*s){const ins=0.25*Math.min(gw,gh);fill=fillAt({x:g.bbox.x0+ins,y:g.bbox.y0+ins,w:gw-2*ins,h:gh-2*ins});}}
      items.push({box:null,line:l,y:l.cy,x:l.bbox.x0,raw:txt,checked:fill==null?null:fill>=CHECK_THR,fill:fill==null?null:+fill.toFixed(3),boxDetected:false});l.used=true;continue;}
    if(above&&(above.cont||0)<2&&l.bbox.x0>(above.box?above.box.x+above.box.w:above.x)-0.5*s){above.raw+=' '+txt;above.cont=(above.cont||0)+1;above.contText=(above.contText?above.contText+' ':'')+txt;l.used=true;}
  }
  // second chance: re-read weak box lines as a single-line strip (PSM 7)
  if(boxOcr){for(const it of items){if(!it.box)continue;const sp=D.splitNotes(it.raw);const m=D.match(sp.name);
      const merged=it.line&&bs.some(o=>o!==it.box&&o.y+o.h/2>it.line.bbox.y0+0.15*s&&o.y+o.h/2<it.line.bbox.y1-0.15*s);
      const weak=!it.raw||!m||m.score<OK_SCORE||merged||(it.line&&(it.line.bbox.y1-it.line.bbox.y0)>1.9*s);
      if(!weak)continue;const b=it.box;
      const r=await boxOcr(b,s);
      const txt=r.lines.map(l=>l.text).join(' ').replace(/\s+/g,' ').trim().replace(/^[|\[\]{}()]+\s*/,'');
      if(!txt)continue;const sp2=D.splitNotes(txt);const m2=D.match(sp2.name);
      if(m2&&(!m||merged||m2.score>m.score+0.02)){it.raw=txt+(it.cont&&it.contText?' '+it.contText:'');it.reocr=true;}}}
  // an unboxed line on the same row as a checkbox line is a duplicate read of that row
  for(let k=items.length-1;k>=0;k--){const it=items[k];if(it.box)continue;if(items.some(o=>o.box&&Math.abs(o.y-it.y)<0.75*s))items.splice(k,1);}
  items.sort((a,b)=>a.y-b.y);headers.sort((a,b)=>a.y-b.y);
  const outItems=[];
  for(const it of items){it.raw=stripHeader(it.raw);const sp=D.splitNotes(it.raw);const m=D.match(sp.name);
    const sec=headers.filter(h=>h.y<it.y+0.3*s).pop();
    const o={raw:it.raw,name:sp.name,notes:sp.notes,section:sec?sec.h:null,checked:it.checked,fill:it.fill,boxDetected:it.boxDetected,
      bbox:it.box?{x:it.box.x,y:it.box.y,w:it.box.w,h:it.box.h}:null,lineBox:it.line?it.line.bbox:null};
    if(m&&m.score>=VERIFY_SCORE){o.id=m.id;o.testName=m.name;o.category=m.category;o.score=m.score;o.runnerUp=m.runnerUp;}else{o.id=null;o.testName=null;o.score=m?m.score:0;}
    o.status=!o.id?'unrecognized':(o.score>=OK_SCORE&&o.boxDetected&&!(o.runnerUp&&o.runnerUp.score>o.score-0.04&&o.score<0.97)?'ok':'verify');o.reocr=!!it.reocr;
    if(!sp.name&&!it.raw){o.status='unrecognized';}
    outItems.push(o);}
  return {layout:'list',items:outItems,headers};}
function stripHeader(raw){const w=(raw||'').split(' ');for(let k=Math.min(3,w.length-1);k>=1;k--){const tail=w.slice(-k).join(' ');if(D.headerOf(tail)&&tail.replace(/[^A-Za-z]/g,'').length>=5)return w.slice(0,-k).join(' ').replace(/[\s\-—_=]+$/,'');}return raw;}
function continuationLikely(prevRaw,txt,l,above,s){
  if(/INSTRUCTION|NOTE TO|\[Repeat[^\]]*$|[,&(\-]\s*$/i.test(prevRaw))return true;return false;}

// ---------- fixed template (LifeLabs D2350) ----------
function solveAffine(src,dst){ // least squares, src/dst arrays of [x,y]; returns [a,b,c,d,e,f]: x'=a x+b y+c, y'=d x+e y+f
  const n=src.length;if(n<3)return null;const A=[[0,0,0],[0,0,0],[0,0,0]],bx=[0,0,0],by=[0,0,0];
  for(let i=0;i<n;i++){const v=[src[i][0],src[i][1],1];for(let r=0;r<3;r++){for(let c=0;c<3;c++)A[r][c]+=v[r]*v[c];bx[r]+=v[r]*dst[i][0];by[r]+=v[r]*dst[i][1];}}
  const sol=b=>{const M=A.map((r,i)=>r.concat([b[i]]));for(let i=0;i<3;i++){let p=i;for(let r=i+1;r<3;r++)if(Math.abs(M[r][i])>Math.abs(M[p][i]))p=r;[M[i],M[p]]=[M[p],M[i]];if(Math.abs(M[i][i])<1e-9)return null;
      for(let r=0;r<3;r++)if(r!==i){const f=M[r][i]/M[i][i];for(let c=i;c<4;c++)M[r][c]-=f*M[i][c];}}return [M[0][3]/M[0][0],M[1][3]/M[1][1],M[2][3]/M[2][2]];};
  const X=sol(bx),Y=sol(by);if(!X||!Y)return null;return X.concat(Y);}
const ap=(M,x,y)=>[M[0]*x+M[1]*y+M[2],M[3]*x+M[4]*y+M[5]];
function gridMode(cv,clean,boxes,lines,gray){
  const dark=(x0,y0,x1,y1)=>{x0=Math.max(0,Math.round(x0));y0=Math.max(0,Math.round(y0));x1=Math.min(gray.cols,Math.round(x1));y1=Math.min(gray.rows,Math.round(y1));if(x1<=x0||y1<=y0)return 0;let n=0;for(let y=y0;y<y1;y++){const o=y*gray.cols;for(let x=x0;x<x1;x++)if(gray.data[o+x]<120)n++;}return n/((x1-x0)*(y1-y0));};
  const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  const words=lines.flatMap(l=>l.words);const cnt={};for(const w of words){const k=norm(w.text);cnt[k]=(cnt[k]||0)+1;}
  const amap={};for(const a of TPL.anchors)amap[a.t]=a;
  const pairs=[];for(const w of words){const k=norm(w.text);if(k.length>=5&&cnt[k]===1&&amap[k]){const a=amap[k];pairs.push([[(a.x+a.x1)/2,(a.y+a.y1)/2],[(w.bbox.x0+w.bbox.x1)/2,(w.bbox.y0+w.bbox.y1)/2]]);}}
  if(pairs.length<6)return {layout:'unknown',reason:'D2350 form detected but too few landmarks could be read to align the template.',items:[]};
  // RANSAC affine
  let best=null,bestIn=[];const thr=clean.cols*0.012;let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  for(let it=0;it<400;it++){const idx=new Set();while(idx.size<3)idx.add(Math.floor(rnd()*pairs.length));const sm=[...idx].map(i=>pairs[i]);
    const M=solveAffine(sm.map(p=>p[0]),sm.map(p=>p[1]));if(!M)continue;const inl=pairs.filter(p=>{const q=ap(M,p[0][0],p[0][1]);return Math.hypot(q[0]-p[1][0],q[1]-p[1][1])<thr;});
    if(inl.length>bestIn.length){bestIn=inl;best=M;}}
  if(bestIn.length<6)return {layout:'unknown',reason:'Template alignment failed (landmarks inconsistent).',items:[]};
  let M=solveAffine(bestIn.map(p=>p[0]),bestIn.map(p=>p[1]));
  // refine with detected checkboxes (ICP, 2 rounds)
  const s=boxes.med||Math.abs(M[0])*6;
  for(let r=0;r<2;r++){const src=[],dst=[];for(const tb of TPL.boxes){const c=ap(M,tb.x+tb.w/2,tb.y+tb.h/2);let bd=1e9,bb=null;for(const b of boxes){const d=Math.hypot(b.x+b.w/2-c[0],b.y+b.h/2-c[1]);if(d<bd){bd=d;bb=b;}}
      if(bb&&bd<0.8*s){src.push([tb.x+tb.w/2,tb.y+tb.h/2]);dst.push([bb.x+bb.w/2,bb.y+bb.h/2]);}}
    if(src.length>=8){const M2=solveAffine(src,dst);if(M2)M=M2;}}
  const items=[];let visible=0;
  for(const tb of TPL.boxes){if(!tb.id)continue;const c=ap(M,tb.x+tb.w/2,tb.y+tb.h/2);const half=Math.abs(M[0])*tb.w/2;
    if(c[0]-half<0||c[1]-half<0||c[0]+half>clean.cols||c[1]+half>clean.rows)continue;visible++;
    let bd=1e9,bb=null;for(const b of boxes){const d=Math.hypot(b.x+b.w/2-c[0],b.y+b.h/2-c[1]);if(d<bd){bd=d;bb=b;}}
    let fill,bbox;if(bb&&bd<0.6*s){const ins=0.24*bb.s;fill=dark(bb.x+ins,bb.y+ins,bb.x+bb.w-ins,bb.y+bb.h-ins);bbox={x:bb.x,y:bb.y,w:bb.w,h:bb.h};}
    else{const ins=half*0.5;fill=dark(c[0]-half+ins,c[1]-half+ins,c[0]+half-ins,c[1]+half-ins);bbox={x:c[0]-half,y:c[1]-half,w:2*half,h:2*half};}
    if(fill>=CHECK_THR){const e=D.BYID[tb.id];items.push({id:tb.id,testName:e?e.name:tb.name,category:e?e.category:'LifeLabs D2350',raw:tb.name,name:tb.name,notes:[],section:null,checked:true,fill:+fill.toFixed(3),boxDetected:!!(bb&&bd<0.6*s),bbox,score:1,status:'ok'});}}
  return {layout:'grid',form:'D2350',items,visibleTemplateBoxes:visible,landmarks:bestIn.length,M};}

const api={scan,listMode,gridMode,CHECK_THR};
if(isNode)module.exports=api;else root.ReqPipeline=api;
})(typeof self!=='undefined'?self:this);
