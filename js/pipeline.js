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
  let bin=P.binarize(cv,img);let clean=P.removeRules(cv,bin,img.cols*0.06);
  let boxes=P.findBoxes(cv,clean,{allowFlip});
  if(!boxes.length){ // fallback for strong shadows / uneven light: local (adaptive) threshold instead of one global Otsu threshold
    const b2=new cv.Mat();const bs=(Math.round(Math.max(img.cols,img.rows)/40)|1);cv.adaptiveThreshold(img,b2,255,cv.ADAPTIVE_THRESH_MEAN_C,cv.THRESH_BINARY_INV,Math.max(15,bs),12);
    const c2=P.removeRules(cv,b2,img.cols*0.06);const bx2=P.findBoxes(cv,c2,{allowFlip});
    if(bx2.length){bin.delete();clean.delete();bin=b2;clean=c2;boxes=bx2;boxes.adaptive=true;}else{b2.delete();c2.delete();}}
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
  const nOk=a=>{const B=a.boxes.filter(b=>!b.refined);if(!B.length)return 0;let best=0;for(const b of B){const n=B.filter(o=>Math.abs(o.x-b.x)<0.8*a.boxes.med).length;if(n>best)best=n;}return best;}; // refit boxes do not vote on orientation // largest vertical column of checkboxes
  if(nOk(a1)<4){const alt=p1.info.rotation+(p1.info.rotation>45?-90:90);const p1b=P.preprocess(cv,src,{targetLong:1600,rotation:alt});const a1b=analyse(cv,p1b.img,true);
    if(nOk(a1b)>nOk(a1)&&nOk(a1b)>=4){a1.clean.delete();a1.ocrImg.delete();p1.img.delete();p1=p1b;a1=a1b;}else{a1b.clean.delete();a1b.ocrImg.delete();p1b.img.delete();}}
  // never trust a page crop that loses the checkboxes: retry without the page-outline warp and keep whichever finds more
  let noQuad=false;if(p1.info.pageQuad&&nOk(a1)<2){const p1c=P.preprocess(cv,src,{targetLong:1600,noQuad:true});const a1c=analyse(cv,p1c.img,true);
    if(nOk(a1c)>nOk(a1)){a1.clean.delete();a1.ocrImg.delete();p1.img.delete();p1=p1c;a1=a1c;noQuad=true;}else{a1c.clean.delete();a1c.ocrImg.delete();p1c.img.delete();}}
  const rot=p1.info.rotation,flip=a1.boxes.flip,med1=a1.boxes.med||0,n1=a1.boxes.length;a1.clean.delete();a1.ocrImg.delete();p1.img.delete();lap('pass1');
  // pass 2: rescale so a checkbox is ~34 px (cap height ~25 px, good for Tesseract)
  const target=med1?clamp(1600*34/med1,1400,3800):2600;
  const p2=P.preprocess(cv,src,{targetLong:target,rotation:rot,noQuad});let img=p2.img;
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
  if(!out){const ctx={along:(xa,xb,yc,half,s)=>ocrAlong(cv,ocrIn,ocr,xa,xb,yc,half,s),trace:(x0,cy,s,o)=>ocrTrace(cv,ocrIn,ocr,x0,cy,s,o),margin:(s,yTop,yBot)=>marginScan(clean,boxes,s,yTop,yBot)};
    out=await listMode(lines,boxes,(b,s)=>ocrBoxLine(cv,ocrIn,ocr,b,s),r=>P.inkFrac(clean,r.x,r.y,r.x+r.w,r.y+r.h),ctx);
    info.looseMarks=out.looseMarks||0;info.columnBoxes=out.columnBoxes;info.markRows=boxes.length+(out.looseMarks||0);
    // in-memory crop of each possibly-missed line so the nurse can see which line on the paper to check (never stored)
    if(opts.crops)for(const it of out.items)if(it.warn&&it.bbox)it.crop=cropLine(cv,img,it.bbox,boxes.med||34);}
  info.warnings=(out.items||[]).filter(i=>i.warn).length;
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
/* Follow ONE printed text line from (x0,cy) rightwards by chaining glyph components whose centres stay on the line
   (local slope re-estimated as we go), so a curled or tilted line is tracked without drifting onto its neighbours.
   Returns the line geometry and a dewarped strip containing only that line's glyphs (everything else white). */
function traceLine(cv,gray,x0,cy,s,o){o=o||{};
  const rx0=clamp(Math.round(x0),0,gray.cols-2),rx1=Math.min(gray.cols,Math.round(x0+(o.maxW||80)*s));
  const ry0=Math.max(0,Math.round(cy-6*s)),ry1=Math.min(gray.rows,Math.round(cy+6*s));const W=rx1-rx0,H=ry1-ry0;if(W<2*s||H<1.5*s)return null;
  const reg=gray.roi(new cv.Rect(rx0,ry0,W,H));const bin=new cv.Mat();cv.threshold(reg,bin,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);
  const lab=new cv.Mat(),st=new cv.Mat(),ce=new cv.Mat();const n=cv.connectedComponentsWithStats(bin,lab,st,ce,8,cv.CV_32S);ce.delete();bin.delete();
  const S=st.data32S;const comps=[];for(let i=1;i<n;i++){const x=S[i*5],y=S[i*5+1],w=S[i*5+2],h=S[i*5+3],a=S[i*5+4];if(a<3)continue;comps.push({i,x,y,w,h,cx:x+w/2,cy:y+h/2});}st.delete();
  comps.sort((a,b)=>a.x-b.x);
  const y0=cy-ry0;const acc=[];let lastX1=0,first=null;const maxGap=(o.maxGap||3)*s,firstGap=(o.firstGap||3)*s;
  const pred=x=>{const k=acc.slice(-8);if(k.length<3){return k.length?(k.reduce((a,c)=>a+c.cy,0)/k.length*0.5+y0*0.5):y0;}
    let mx=0,my=0;for(const c of k){mx+=c.cx;my+=c.cy;}mx/=k.length;my/=k.length;let sxy=0,sxx=0;for(const c of k){sxy+=(c.cx-mx)*(c.cy-my);sxx+=(c.cx-mx)*(c.cx-mx);}
    const sl=sxx>1e-6?clamp(sxy/sxx,-0.2,0.2):0;return my+sl*(x-mx);};
  const tall=[],small=[];
  for(const c of comps){if(c.w>6*s)continue;if(o.skipEdge&&c.x<=1)continue; // remnant of the checkbox/tick cut by the crop
    if(c.h<0.3*s){small.push(c);continue;}
    if(c.h>1.3*s){if(c.h<3.2*s)tall.push(c);continue;}
    const p=pred(c.cx);const on=Math.abs(c.cy-p)<=0.38*s;if(!on)continue;
    if(c.x-lastX1>(first?maxGap:firstGap))break;
    acc.push(c);if(!first)first=c;lastX1=Math.max(lastX1,c.x+c.w);}
  if(acc.length<2){lab.delete();reg.delete();return null;}
  // smooth centre line yc(x) from accepted glyph centres (triangular window), sampled per column
  const xs=Math.max(0,Math.round(first.x-0.35*s)),xe=Math.min(W,Math.round(lastX1+0.35*s));
  const knots=[];const step=Math.max(4,Math.round(s/2));for(let x=xs;x<=xe;x+=step){let sw=0,sy=0;for(const c of acc){const d=Math.abs(c.cx-x);const wgt=Math.max(0,2.5*s-d);if(wgt>0){sw+=wgt;sy+=wgt*c.cy;}}
    knots.push([x,sw>0?sy/sw:null]);}
  for(let k=0;k<knots.length;k++)if(knots[k][1]===null){let nb=null,bd=1e9;for(const q of knots)if(q[1]!==null&&Math.abs(q[0]-knots[k][0])<bd){bd=Math.abs(q[0]-knots[k][0]);nb=q;}knots[k][1]=nb?nb[1]:y0;}
  const yc=x=>{if(x<=knots[0][0])return knots[0][1];for(let k=1;k<knots.length;k++)if(x<=knots[k][0]){const [xa,ya]=knots[k-1],[xb,yb]=knots[k];return ya+(yb-ya)*(x-xa)/((xb-xa)||1);}return knots[knots.length-1][1];};
  // glyph mask: accepted components, plus small marks (punctuation, i-dots) and clipped tall components inside the line band
  const keep=new Uint8Array(n);for(const c of acc)keep[c.i]=1;
  for(const c of small)if(c.cx>=xs&&c.cx<=xe&&Math.abs(c.cy-yc(c.cx))<0.5*s)keep[c.i]=1;
  const clip=new Uint8Array(n);for(const c of tall)if(c.cx>=xs&&c.cx<=xe){const p=yc(c.cx);if(p>c.y+0.15*s&&p<c.y+c.h-0.15*s)clip[c.i]=1;}
  const mask=new cv.Mat(H,W,cv.CV_8UC1,new cv.Scalar(0));const L=lab.data32S,M=mask.data;const band=0.72*s;
  for(let y=0;y<H;y++){const o2=y*W;for(let x=xs;x<xe;x++){const l=L[o2+x];if(!l)continue;if(keep[l]||(clip[l]&&Math.abs(y-yc(x))<band))M[o2+x]=255;}}
  lab.delete();const k3=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));cv.dilate(mask,mask,k3);k3.delete();
  const masked=new cv.Mat(H,W,cv.CV_8UC1,new cv.Scalar(255));reg.copyTo(masked,mask);mask.delete();reg.delete();
  // dewarp: straighten the centre line
  const Ho=Math.round(1.9*s),Wo=xe-xs;const mx=new cv.Mat(Ho,Wo,cv.CV_32FC1),my=new cv.Mat(Ho,Wo,cv.CV_32FC1);const MX=mx.data32F,MY=my.data32F;
  for(let x=0;x<Wo;x++){const c=yc(xs+x)-Ho/2;for(let y=0;y<Ho;y++){MX[y*Wo+x]=xs+x;MY[y*Wo+x]=c+y;}}
  const strip=new cv.Mat();cv.remap(masked,strip,mx,my,cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255));mx.delete();my.delete();masked.delete();
  const pad=new cv.Mat();cv.copyMakeBorder(strip,pad,12,12,12,12,cv.BORDER_CONSTANT,new cv.Scalar(255));strip.delete();
  // seed of a possible wrapped continuation line: glyphs just below, starting under this line's first glyph
  let next=null;for(const c of comps){if(c.h<0.4*s||c.h>1.3*s||c.cx<first.x-1.2*s||c.x>first.x+2*s)continue;const d=c.cy-yc(c.cx);if(d>0.8*s&&d<2.1*s&&(!next||c.x<next.x))next=c;}
  return {strip:pad,x0:rx0+xs,x1:rx0+xe,firstX:rx0+first.x,yAt:x=>ry0+yc(x-rx0),n:acc.length,next:next?{x:rx0+next.x,cy:ry0+next.cy}:null};}
/* Dewarped strip along a given centre curve yc(x) (global coords), keeping only glyphs whose centre lies within +-half of it
   (used to read section headers that sit between two traced lines). */
function stripAlong(cv,gray,xa,xb,yc,half,s){xa=clamp(Math.round(xa),0,gray.cols-2);xb=clamp(Math.round(xb),xa+2,gray.cols);let lo=1e9,hi=-1e9;
  for(let x=xa;x<xb;x+=4){const v=yc(x);if(v<lo)lo=v;if(v>hi)hi=v;}const ry0=Math.max(0,Math.round(lo-half-1.5*s)),ry1=Math.min(gray.rows,Math.round(hi+half+1.5*s));
  const W=xb-xa,H=ry1-ry0;if(W<2*s||H<s)return null;const reg=gray.roi(new cv.Rect(xa,ry0,W,H));const bin=new cv.Mat();cv.threshold(reg,bin,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);
  const lab=new cv.Mat(),st=new cv.Mat(),ce=new cv.Mat();const n=cv.connectedComponentsWithStats(bin,lab,st,ce,8,cv.CV_32S);ce.delete();bin.delete();const S=st.data32S;
  const keep=new Uint8Array(n);let k=0;for(let i=1;i<n;i++){const x=S[i*5],y=S[i*5+1],w=S[i*5+2],h=S[i*5+3],a=S[i*5+4];if(a<3||h>1.4*s||w>6*s)continue;
    if(Math.abs(y+h/2+ry0-yc(xa+x+w/2))<=half){keep[i]=1;k++;}}st.delete();
  if(k<3){lab.delete();reg.delete();return null;}
  const mask=new cv.Mat(H,W,cv.CV_8UC1,new cv.Scalar(0));const L=lab.data32S,M=mask.data;for(let i=0;i<W*H;i++)if(keep[L[i]]&&L[i])M[i]=255;lab.delete();
  const k3=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));cv.dilate(mask,mask,k3);k3.delete();const masked=new cv.Mat(H,W,cv.CV_8UC1,new cv.Scalar(255));reg.copyTo(masked,mask);mask.delete();reg.delete();
  const Ho=Math.round(2*half+0.6*s);const mx=new cv.Mat(Ho,W,cv.CV_32FC1),my=new cv.Mat(Ho,W,cv.CV_32FC1);const MX=mx.data32F,MY=my.data32F;
  for(let x=0;x<W;x++){const c=yc(xa+x)-ry0-Ho/2;for(let y=0;y<Ho;y++){MX[y*W+x]=x;MY[y*W+x]=c+y;}}
  const strip=new cv.Mat();cv.remap(masked,strip,mx,my,cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255));mx.delete();my.delete();masked.delete();
  const pad=new cv.Mat();cv.copyMakeBorder(strip,pad,12,12,12,12,cv.BORDER_CONSTANT,new cv.Scalar(255));strip.delete();return pad;}
async function ocrAlong(cv,gray,ocr,xa,xb,yc,half,s){const m=stripAlong(cv,gray,xa,xb,yc,half,s);if(!m)return '';const r=await ocr(m,{psm:'7'});m.delete();return (r.lines||[]).map(l=>l.text).join(' ').replace(/\s+/g,' ').trim();}
async function ocrTrace(cv,gray,ocr,x0,cy,s,o){const t=traceLine(cv,gray,x0,cy,s,o);if(!t)return null;const r=await ocr(t.strip,{psm:'7'});t.strip.delete();t.strip=null;
  t.text=(r.lines||[]).map(l=>l.text).join(' ').replace(/\s+/g,' ').trim();return t;}
/* Independent cross-check for missed checkboxes: scan the checkbox column (interpolated between detected boxes, so it follows
   tilt and curl) for box-sized ink marks that the strict detector did not accept. Returns loose candidates. */
function marginScan(bin,boxes,s,yTop,yBot){
  const bs=boxes.slice().sort((a,b)=>a.y-b.y);if(!bs.length)return [];const cyOf=b=>b.y+b.h/2;
  const colX=y=>{if(bs.length===1)return bs[0].x;let a=null,b=null;for(const q of bs){if(cyOf(q)<=y)a=q;else if(!b)b=q;}
    if(a&&b)return a.x+(b.x-a.x)*(y-cyOf(a))/((cyOf(b)-cyOf(a))||1);const [p,q]=a?bs.slice(-2):bs.slice(0,2);const sl=(q.x-p.x)/((cyOf(q)-cyOf(p))||1);return clamp(p.x+sl*(y-cyOf(p)),p.x-2*s,p.x+2*s);};
  const d=bin.data,C=bin.cols;yTop=Math.max(0,Math.round(yTop));yBot=Math.min(bin.rows-1,Math.round(yBot));
  const cnt=[];for(let y=yTop;y<=yBot;y++){const cx=colX(y);const xa=Math.max(0,Math.round(cx-0.25*s)),xb=Math.min(C,Math.round(cx+0.95*s));let k=0;for(let x=xa;x<xb;x++)if(d[y*C+x])k++;cnt.push(k);}
  const runs=[];let st=-1,gap=0;for(let i=0;i<=cnt.length;i++){const on=i<cnt.length&&cnt[i]>=Math.max(2,0.08*s);
    if(on){if(st<0)st=i;gap=0;}else if(st>=0){gap++;if(gap>2||i===cnt.length){runs.push([st+yTop,i-gap+yTop]);st=-1;gap=0;}}}
  const out=[];for(const [a,b] of runs){const h=b-a+1;if(h<0.55*s||h>1.8*s)continue;const yc=(a+b)/2;
    if(bs.some(q=>Math.abs(cyOf(q)-yc)<0.6*s))continue;
    const cx=colX(yc);const xa=Math.max(0,Math.round(cx-0.5*s)),xb=Math.min(C,Math.round(cx+1.3*s));let l=-1,r=-1,ink=0;
    for(let x=xa;x<xb;x++){let any=0;for(let y=a;y<=b;y++)if(d[y*C+x]){any++;}if(any){if(l<0)l=x;r=x;ink+=any;}}
    if(l<0)continue;const w=r-l+1;if(w<0.5*s||w>1.8*s)continue;if(ink/(w*h)<0.12)continue;
    out.push({x:l,y:a,w,h,s:(w+h)/2,loose:true});}
  return out;}
function cropLine(cv,img,b,s){const x=Math.max(0,Math.round(b.x-0.6*s)),y=Math.max(0,Math.round(b.y+b.h/2-1.6*s));const w=Math.min(img.cols-x,Math.round(30*s)),h=Math.min(img.rows-y,Math.round(3.2*s));
  if(w<4||h<4)return null;const sub=img.roi(new cv.Rect(x,y,w,h));const sc=Math.min(1,900/w);const r=new cv.Mat();cv.resize(sub,r,new cv.Size(Math.max(1,Math.round(w*sc)),Math.max(1,Math.round(h*sc))),0,0,cv.INTER_AREA);sub.delete();
  const rgba=new cv.Mat();cv.cvtColor(r,rgba,cv.COLOR_GRAY2RGBA);r.delete();const out={width:rgba.cols,height:rgba.rows,data:new Uint8ClampedArray(rgba.data)};rgba.delete();return out;}
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
const sgPos=sg=>({x:(sg[0].bbox.x0+sg[sg.length-1].bbox.x1)/2,yw:sg.reduce((a,w)=>a+(w.bbox.y0+w.bbox.y1)/2,0)/sg.length});
const segText=ws=>ws.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();

/* t219 (proposal P5, K. Williams approved for the draft): comma-list splitting. A bundle line such as 'ANA, anti-dsDNA, ENA, C3, C4,
   rheumatoid factor, CK & CRP' yields one item per test. Guards: split only at top-level ',' / '&' (never inside brackets, so
   'Electrolytes (Na, K, Cl)' stays whole); a strong whole-line match wins first (names/aliases containing commas such as
   '1,25 Dihydroxy Vitamin D' or 'TSH, fT4 +/- fT3 (...)'); every fragment must strong-match (score >= 0.95, no close runner-up),
   allowing at most one unmatched fragment in five, which stays as a 'missed' card. LIST_ABBR: bare abbreviations accepted only as
   an exact whole fragment inside such a list (bare ANA / ENA are not dictionary aliases). */
const LIST_ABBR={ana:'ana',ena:'ena'};
function splitTop(name){const out=[];let d=0,cur='';for(const ch of name){if(ch==='('||ch==='[')d++;else if(ch===')'||ch===']')d=Math.max(0,d-1);
  if(d===0&&(ch===','||ch==='&')){out.push(cur);cur='';continue;}cur+=ch;}out.push(cur);return out.map(x=>x.replace(/^\s*and\s+/i,'').trim()).filter(Boolean);}
function listSplit(name,whole){
  if(!name||!/[,&]/.test(name))return null;const fr=splitTop(name);if(fr.length<2)return null;
  const res=fr.map(f=>{const n=D.norm(f);if(LIST_ABBR[n]&&D.BYID[LIST_ABBR[n]])return {f,id:LIST_ABBR[n],score:1};
    const m=D.match(f);return m&&m.score>=0.95&&!(m.runnerUp&&m.runnerUp.score>m.score-0.04)?{f,id:m.id,score:m.score}:{f,id:null};});
  const ids=res.filter(r=>r.id).map(r=>r.id);
  if(whole&&whole.score>=0.85&&!ids.includes(whole.id))return null;   // a whole-line match that is not just one of the fragments wins
  if(whole&&whole.score>=0.95)return null;
  if(new Set(ids).size<2)return null;
  if(res.filter(r=>!r.id).length>Math.floor(fr.length/5))return null;
  return res;}
/* t221 (K. Williams approved, draft): two narrow extra-test rules on top of the t219 splitter. Each can be switched off on its own.
   (a) PARENT_QUAL: 'Bilirubin - total, direct & indirect' - parent (strong whole match) + ' - ' + qualifier fragments that are not
       tests on their own; each 'Parent qualifier' phrase must match a dictionary entry exactly (score 1.0); all fragments must resolve
       or nothing is added. 'total' -> the parent entry itself (no extra item).
   (b) AND_TEST: 'Insulin (Fasting) - and Fasting Glucose' - main test, a separator (- : ; , /), then 'and <Test>'; the text after
       'and' (cut at any '*' / NOTE marker; splitNotes already removed *NOTE TO PATIENT / NOTE TO LAB text) must strong-match
       (>= 0.95, runner-up >= 0.04 behind) a different test. */
const T221_PARENT_QUAL=true,T221_AND_TEST=true;
function strongM(t,min){const m=D.match(t);return m&&m.score>=min&&!(min<1&&m.runnerUp&&m.runnerUp.score>m.score-0.04)?m:null;}
function extraTests(name,whole){
  if(!name||!whole||whole.score<0.85)return [];const out=[];
  if(T221_PARENT_QUAL){const mm=name.match(/^([^,&\-–—:]+?)\s+[-–—:]\s+(.+)$/);
    if(mm){const par=strongM(mm[1],0.95);const fr=splitTop(mm[2]);
      if(par&&par.id===whole.id&&fr.length>=2&&fr.every(f=>f.split(/\s+/).length<=2&&!strongM(f,0.85))){
        const ids=fr.map(f=>{const c=D.match(mm[1].trim()+' '+f);return c&&c.score>=0.999?c.id:null;});
        if(ids.every(Boolean))for(const id of ids)if(id!==whole.id&&!out.includes(id))out.push(id);}}}
  if(T221_AND_TEST){const mm=name.match(/^(.*\S)\s*[-–—:;,/]\s*and\s+(.+)$/i);
    if(mm){const right=mm[2].split(/\*|\bnote\b/i)[0].trim();const left=strongM(mm[1],0.95),r=right?strongM(right,0.95):null;
      if(left&&left.id===whole.id&&r&&r.id!==whole.id&&!out.includes(r.id))out.push(r.id);}}
  return out;}
async function listMode(lines,boxes,boxOcr,fillAt,ctx){
  const s=boxes.med||median(lines.flatMap(l=>l.words.map(w=>w.bbox.y1-w.bbox.y0)))||30;
  const L=lines.map((l,i)=>({i,text:l.text.trim(),bbox:l.bbox,words:l.words.slice().sort((a,b)=>a.bbox.x0-b.bbox.x0),cy:(l.bbox.y0+l.bbox.y1)/2,used:false}));
  const headers=[];const items=[];
  // stop line (signature/date block) – ignore everything below it
  const firstY=boxes.length?Math.min(...boxes.map(b=>b.y)):0;
  let stopY=Infinity;for(const l of L){if(l.cy>firstY&&D.isStop(l.text)&&l.cy<stopY)stopY=l.cy;}
  // 1) box-anchored lines. Checkboxes of a printed list sit in one (possibly tilted/curved) column; a 'box' clearly off that
  //    column (e.g. a bold 'M' of a header, 'FI' of a wrapped line) is held back as a suspect and judged later by its text
  const all=boxes.slice().sort((a,b)=>a.y-b.y);const suspects=[];
  const colDev=(b,others)=>{const cy=q=>q.y+q.h/2;const up=others.filter(q=>cy(q)<=cy(b)),dn=others.filter(q=>cy(q)>cy(b));let p,q;
    if(up.length&&dn.length){p=up[up.length-1];q=dn[0];}else if(up.length>=2){p=up[up.length-2];q=up[up.length-1];}else if(dn.length>=2){p=dn[0];q=dn[1];}else return 0;
    const sl=(q.x-p.x)/((cy(q)-cy(p))||1);const xi=p.x+clamp(sl,-0.3,0.3)*(cy(b)-cy(p));return Math.abs(b.x-xi);};
  // stage A: robust straight-line fit of the column (x = a*y + c) through the boxes, best pair by inlier count; gross outliers out
  const S0=boxes.med||34;let inl=all;
  if(all.length>=3){let best=[];for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const p=all[i],q=all[j];const dy=(q.y-p.y)||1;const a=(q.x-p.x)/dy;if(Math.abs(a)>0.3)continue;
      const I=all.filter(b=>Math.abs(b.x-(p.x+a*(b.y-p.y)))<1.5*S0);if(I.length>best.length)best=I;}
    if(best.length>=Math.max(2,Math.ceil(all.length/2)))inl=best;}
  // stage B: local check against neighbouring inliers (follows curl)
  const bs=inl.length>=3?inl.filter(b=>{const o=inl.filter(q=>q!==b);return colDev(b,o)<=0.8*S0;}):inl.slice();
  for(const b of all)if(!bs.includes(b))suspects.push(b);
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
    for(const sg of segs.slice(1)){const h=D.headerOf(segText(sg));if(h)headers.push(Object.assign({h,y:by},sgPos(sg)));else main=main.concat(sg);}
    items.push({box:b,line:best,y:by,x:b.x+b.w,raw:segText(main),checked:b.fill>=CHECK_THR,fill:+b.fill.toFixed(3),boxDetected:true});}
  const textX=median(items.map(it=>it.line?it.line.bbox.x0:it.x))||0;const boxX=median(bs.map(b=>b.x));
  // 2) remaining lines: headers, continuation of the line above, or test lines whose box was not detected
  const top=Math.min(firstY||Infinity,...L.filter(l=>D.headerOf(l.text)).map(l=>l.bbox.y0))-0.5*s;
  for(const l of L){if(l.used||l.cy>=stopY||l.cy<top-3*s)continue;
    const h=D.headerOf(l.text);if(h){headers.push({h,y:l.cy,x:(l.bbox.x0+l.bbox.x1)/2,yw:l.cy});continue;}
    if(l.cy<top)continue;
    let ws=l.words.slice();let glyph=false;if(ws.length>1&&GLYPH.test(ws[0].text)&&ws[1].bbox.x0-ws[0].bbox.x1<1.2*s){ws.shift();glyph=true;}
    const segs=segments(ws,2.2*s);let txt=segs.length?segText(segs[0]):'';for(const sg of segs.slice(1)){const hh=D.headerOf(segText(sg));if(hh)headers.push(Object.assign({h:hh,y:l.cy},sgPos(sg)));else txt+=' '+segText(sg);}
    if(txt.replace(/[^A-Za-z0-9]/g,'').length<3)continue;           // stray marks, e.g. a lone 'c'
    const m=D.match(D.splitNotes(txt).name);
    const above=items.filter(it=>it.y<l.cy&&l.bbox.y0-(it.line?it.line.bbox.y1:it.y)<1.3*s).sort((a,b)=>b.y-a.y)[0];
    // local checkbox column: interpolate from the nearest detected boxes above/below (photos are skewed)
    const nb=bs.slice().sort((a,b)=>Math.abs(a.y-l.cy)-Math.abs(b.y-l.cy)).slice(0,2);const locX=nb.length?nb.reduce((a,b)=>a+b.x,0)/nb.length:boxX;
    const atBox=boxes.length?Math.abs(l.bbox.x0-locX)<0.9*s:false;const atText=Math.abs(l.bbox.x0-(locX+1.4*s))<1.5*s;
    const cont=above&&continuationLikely(above.raw,txt,l,above,s)&&!atBox&&!glyph&&(above.cont||0)<2;
    // t193: a line with no checkbox of its own is not taken as a test on the strength of a 1-2 letter synonym at its start ('FE ...' -> Iron)
    const tiny=!!m&&m.matched.length<=2&&D.norm(D.splitNotes(txt).name)!==m.matched;
    if(m&&!tiny&&((m.score>=0.8&&(glyph||atBox||atText))||(m.score>=0.9&&!cont))){
      // checkbox glyph seen by OCR but not by the box detector: measure its ink directly
      let fill=null;const g=l.words[0];if(glyph&&fillAt){const gw=g.bbox.x1-g.bbox.x0,gh=g.bbox.y1-g.bbox.y0;if(gw>0.5*s&&gh>0.5*s&&gw<1.6*s){const ins=0.25*Math.min(gw,gh);fill=fillAt({x:g.bbox.x0+ins,y:g.bbox.y0+ins,w:gw-2*ins,h:gh-2*ins});}}
      items.push({box:null,line:l,y:l.cy,x:l.bbox.x0,raw:txt,checked:fill==null?null:fill>=CHECK_THR,fill:fill==null?null:+fill.toFixed(3),boxDetected:false});l.used=true;continue;}
    if(above&&(above.cont||0)<2&&l.bbox.x0>(above.box?above.box.x+above.box.w:above.x)-0.5*s){above.raw+=' '+txt;above.cont=(above.cont||0)+1;above.contText=(above.contText?above.contText+' ':'')+txt;l.used=true;}
  }
  // 3) safety cross-check: box-sized marks in the checkbox column that the strict detector rejected
  const allBoxY=bs.map(b=>b.y+b.h/2);let loose=[];
  if(ctx&&ctx.margin&&bs.length){const hdrAbove=headers.filter(h=>h.y<firstY).map(h=>h.y);
    const yTop=hdrAbove.length&&firstY-Math.max(...hdrAbove)<5*s?Math.max(...hdrAbove)+0.5*s:firstY-1.4*s;
    const lastY=Math.max(...bs.map(b=>b.y+b.h));const yBot=Math.min(stopY===Infinity?1e9:stopY-0.5*s,lastY+3.5*s);
    loose=ctx.margin(s,yTop,yBot).filter(c=>!items.some(it=>Math.abs(it.y-(c.y+c.h/2))<0.6*s));for(const c of loose)allBoxY.push(c.y+c.h/2);}
  // 4) line-constrained read of every checkbox line: trace the text line from its box (follows tilt/curl), dewarp it,
  //    mask out neighbouring lines, OCR only that line; wrapped continuation lines are traced the same way
  const rows=[];const readLine=async b=>{if(!ctx||!ctx.trace)return null;const by=b.y+b.h/2;const t=await ctx.trace(b.x+b.w+0.1*s,by,s,{firstGap:2.5,skipEdge:true});if(!t||!t.text)return null;
    let ws=t.text.split(' ');while(ws.length>1&&ws[0].length<=3&&GLYPH.test(ws[0]))ws.shift();const txt=ws.join(' ').replace(/^[|\[\]{}()]+\s*/,'');
    rows.push({y:by,yAt:t.yAt,x0:t.x0,x1:t.x1});let cont='',cur=t;for(let k=0;k<2&&cur.next;k++){const nx=cur.next;
      if(allBoxY.some(v=>v!==by&&Math.abs(v-nx.cy)<0.7*s))break;                     // that row has its own checkbox
      if(items.some(o=>!o.box&&Math.abs(o.y-nx.cy)<0.6*s))break;   /* header text there is rejected below by headerOf */
      if(nx.cy>stopY)break;const t2=await ctx.trace(nx.x-0.2*s,nx.cy,s,{firstGap:1});if(!t2||!t2.text||D.headerOf(t2.text))break;
      const sp2=D.splitNotes(t2.text);const mm=D.match(sp2.name);if(mm&&mm.score>=0.88&&!sp2.notes.length)break;   // an unboxed test line, not a continuation
      cont+=' '+t2.text;cur=t2;rows.push({y:t2.yAt(b.x+b.w),yAt:t2.yAt,x0:t2.x0,x1:t2.x1});}
    return {text:txt,cont:cont.trim()};};
  if(ctx&&ctx.trace)for(const it of items){if(!it.box)continue;const r=await readLine(it.box);if(!r||!r.text)continue;
    /* page-OCR continuation text is not used here: on curled pages it mixes lines */const full=r.text+(r.cont?' '+r.cont:'');const mS=D.match(D.splitNotes(r.text).name),mP=it.raw?D.match(D.splitNotes(it.raw).name):null;
    if(mS&&(!mP||mS.score>=mP.score-0.03)){it.raw=full;it.reocr=true;it.strip=true;}
    else{it.notesOverride=D.splitNotes(full).notes;}}
  for(const c of loose){const r=await readLine(c);const txt=r?(r.text+(r.cont?' '+r.cont:'')):'';
    const ins=0.24*c.s;const fill=fillAt?fillAt({x:c.x+ins,y:c.y+ins,w:c.w-2*ins,h:c.h-2*ins}):null;
    items.push({box:c,loose:true,line:null,y:c.y+c.h/2,x:c.x+c.w,raw:txt,strip:!!txt,checked:fill!=null&&fill>=CHECK_THR?true:null,fill:fill==null?null:+fill.toFixed(3),boxDetected:false});}
  // suspects: drop if their row was read as part of another line (wrapped text) or is a header; keep if the text is a test;
  // otherwise warn (never drop a possible checkbox silently)
  const rowsBefore=rows.slice();
  for(const b of suspects){const cy=b.y+b.h/2;if(items.some(it=>it.box&&!it.suspect&&Math.abs(it.y-cy)<0.6*s))continue;
    const consumed=rowsBefore.some(r=>Math.abs(r.x0-(b.x+b.w))<2.5*s&&Math.abs(r.yAt(r.x0)-cy)<0.6*s);   // read as a wrapped line of the item above
    const r=ctx&&ctx.trace?await readLine(b):null;const txt=r?(r.text+(r.cont?' '+r.cont:'')):'';
    {const m0=txt?D.match(D.splitNotes(txt).name):null;if(m0&&m0.score>=0.8){items.push({box:b,line:null,y:cy,x:b.x+b.w,raw:txt,strip:true,checked:b.fill>=CHECK_THR?true:null,fill:+b.fill.toFixed(3),boxDetected:false,suspect:true});continue;}}
    if(consumed)continue;
    const firstLetters=(txt.split(' ')[0]||'');if(D.headerOf(txt)||D.headerOf('MI'+txt)||D.headerOf('M'+txt)||D.headerOf(txt.split(' ').slice(0,2).join(' '))){headers.push({h:D.headerOf(txt)||D.headerOf('MI'+txt)||D.headerOf('M'+txt)||D.headerOf(txt.split(' ').slice(0,2).join(' ')),y:cy});continue;}
    const m=txt?D.match(D.splitNotes(txt).name):null;if(!(m&&m.score>=0.8)&&b.fill<CHECK_THR)continue;   // unticked-looking off-column blob without a test name
    items.push({box:b,line:null,y:cy,x:b.x+b.w,raw:txt,strip:!!txt,checked:b.fill>=CHECK_THR?true:null,fill:+b.fill.toFixed(3),boxDetected:false,suspect:true});}
  // headers read by page OCR: place them geometrically. On a tilted/curled page a header at the right end of a test line
  // ('CBC+Diff ....... HEMATOLOGY') belongs to the first traced line at or below it *at the header's x*, where line height
  // beyond a short line's end is extrapolated along the nearest long line (follows the page tilt/curl).
  const longRows=()=>rows.filter(r=>r.x1-r.x0>8*s);
  const yExt=(r,x)=>{if(x<=r.x1)return r.yAt(Math.max(x,r.x0));const L=longRows().filter(q=>q.x1>=x&&q!==r).sort((a,b)=>Math.abs(a.y-r.y)-Math.abs(b.y-r.y))[0];
    return L?r.yAt(r.x1)+(L.yAt(x)-L.yAt(r.x1)):r.yAt(r.x1);};
  if(rows.length){rows.sort((a,b)=>a.y-b.y);for(const h of headers){if(h.x===undefined)continue;const r=rows.find(q=>yExt(q,h.x)>h.yw-0.3*s);h.y=r?r.y-0.05*s:rows[rows.length-1].y+0.5*s;h.placed=true;}
    // same header read twice -> keep one
    for(let i=headers.length-1;i>=0;i--)if(headers.some((o,j)=>j<i&&o.h===headers[i].h&&Math.abs(o.y-headers[i].y)<1.2*s))headers.splice(i,1);}
  if(typeof process!=='undefined'&&process.env&&process.env.DEBUG_HDR){console.log('ROWS',rows.map(r=>[Math.round(r.y),Math.round(r.x0),Math.round(r.x1),Math.round(r.yAt(r.x1))].join(':')).join(' '));console.log('HDRS',JSON.stringify(headers.map(h=>({h:h.h,y:Math.round(h.y),x:h.x&&Math.round(h.x),yw:h.yw&&Math.round(h.yw)}))));}
  // 5) section headers between traced lines (page-level OCR often loses them on curled pages): read a dewarped band along
  //    the midline of each wide gap, and above the first line
  if(ctx&&ctx.along&&rows.length){rows.sort((a,b)=>a.y-b.y);const colX=boxX+s;const xEnd=Math.max(...rows.map(r=>r.x1));
    const gaps=[];for(let k=0;k<rows.length;k++){const A=rows[k-1]||null,B=rows[k];const gy=A?B.y-A.y:Infinity;if(A&&gy<1.6*s)continue;
      const lo=A?A.y:B.y-2.6*s;      const half=A?clamp(gy/2-0.45*s,0.4*s,0.8*s):0.5*s;const yc=A?(x=>(yExt(A,x)+yExt(B,x))/2):(x=>yExt(B,x)-1.3*s);
      gaps.push({yc,half,y:A?(A.y+B.y)/2:B.y-1.3*s});}
    for(const g of gaps.slice(0,8)){const txt=await ctx.along(colX,xEnd,g.yc,g.half,s);if(typeof process!=='undefined'&&process.env&&process.env.DEBUG_HDR)console.log('BAND',Math.round(g.y),Math.round(g.half),JSON.stringify(txt));if(!txt)continue;let h=D.headerOf(txt);
      if(!h){const w=txt.split(' ');for(let i=0;i<w.length&&!h;i++)h=D.headerOf(w[i])||D.headerOf(w.slice(i,i+2).join(' '));}if(!h)h=D.headerLoose(txt);
      if(h){for(let k=headers.length-1;k>=0;k--)if(!headers[k].band&&(headers[k].h===h||Math.abs(headers[k].y-g.y)<0.9*s))headers.splice(k,1);headers.push({h,y:g.y,band:true});}}}
  // second chance: re-read weak box lines as a single-line strip (PSM 7)
  if(boxOcr){for(const it of items){if(!it.box)continue;const sp=D.splitNotes(it.raw);const m=D.match(sp.name);if(it.strip&&m&&m.score>=OK_SCORE)continue;
      const merged=it.line&&bs.some(o=>o!==it.box&&o.y+o.h/2>it.line.bbox.y0+0.15*s&&o.y+o.h/2<it.line.bbox.y1-0.15*s);
      const weak=!it.raw||!m||m.score<OK_SCORE||merged||(it.line&&(it.line.bbox.y1-it.line.bbox.y0)>1.9*s);
      if(!weak)continue;const b=it.box;
      const r=await boxOcr(b,s);
      const txt=r.lines.map(l=>l.text).join(' ').replace(/\s+/g,' ').trim().replace(/^[|\[\]{}()]+\s*/,'');
      if(!txt)continue;const sp2=D.splitNotes(txt);const m2=D.match(sp2.name);
      if(m2&&(!m||merged||m2.score>m.score+0.02)){it.raw=txt+(it.cont&&it.contText?' '+it.contText:'');it.reocr=true;}}}
  // one checkbox row -> one item: drop loose/suspect/unboxed reads on a row that already has a strict checkbox item, and a
  // repeated test id from a non-strict read next to a strict one (e.g. a wrapped line or a letter read as a second box)
  const strict=it=>it.box&&!it.loose&&!it.suspect;
  // t193: an unboxed page-OCR line that is its own strongly matched test, read as a separate line from every nearby boxed line
  // (a small-font row squeezed between two boxed rows, whose own box was missed) is not a duplicate read of that row
  const ownLine=(it,near)=>{if(it.box||!it.line||!near.length)return false;const mi=D.match(D.splitNotes(it.raw||'').name);if(!mi||mi.score<0.95)return false;
    return near.every(o=>{if(!o.line||o.line===it.line)return false;const mo=D.match(D.splitNotes(o.raw||'').name);return !!mo&&mo.id!==mi.id&&mo.score>=0.9&&Math.abs((o.line.bbox.y0+o.line.bbox.y1)/2-it.line.cy)>0.6*s;});};
  for(let k=items.length-1;k>=0;k--){const it=items[k];if(strict(it))continue;
    const rowMates=items.filter(o=>o!==it&&strict(o)&&Math.abs(o.y-it.y)<0.7*s);const sameRow=rowMates.length>0&&!ownLine(it,rowMates);
    const mi=D.match(D.splitNotes(it.raw||'').name);const dupId=mi&&mi.score>=VERIFY_SCORE&&items.some(o=>o!==it&&strict(o)&&Math.abs(o.y-it.y)<2*s&&(()=>{const mo=D.match(D.splitNotes(o.raw||'').name);return mo&&mo.id===mi.id;})());
    if(sameRow||dupId)items.splice(k,1);}
  // an unboxed line on the same row as a checkbox line is a duplicate read of that row
  for(let k=items.length-1;k>=0;k--){const it=items[k];if(it.box)continue;const near=items.filter(o=>o.box&&Math.abs(o.y-it.y)<0.75*s);if(near.length&&!ownLine(it,near))items.splice(k,1);}
  items.sort((a,b)=>a.y-b.y);headers.sort((a,b)=>a.y-b.y);
  const outItems=[];
  // a 'box' indented under the previous item's text (the first letters of a wrapped line) whose text is not a test name is
  // that wrapped line: merge it into the item above instead of raising a false 'missed line' card
  for(let k=items.length-1;k>=1;k--){const it=items[k],pv=items[k-1];if(!it.box||!pv.box||it.loose)continue;if(it.y-pv.y>1.8*s)continue;
    if(it.box.x<pv.box.x+pv.box.w+0.1*s)continue;const mi=D.match(D.splitNotes(it.raw||'').name);if(mi&&mi.score>=0.8)continue;
    if(!(pv.raw||'').includes((it.raw||'').slice(0,12)))pv.raw=(pv.raw||'')+' '+(it.raw||'');items.splice(k,1);}
  const FORM_LABELS=/^(diagnosis|current medications?|date and time of last dose|clinical information)\b/i;
  for(const it of items){it.raw=stripHeader(it.raw);
    // a short line that is really a section header / form label (e.g. 'ICROBIOLOGY' read next to a bold 'M' taken for a box,
    // or 'DIAGNOSIS') is a header, not an unrecognised test line
    {const rr=(it.raw||'').replace(/[^A-Za-z ]/g,' ').trim();const short=rr.split(/\s+/).filter(w=>w.length>1).length<=3;const m0=D.match(D.splitNotes(it.raw||'').name);
     if(rr&&short&&!(m0&&m0.score>=VERIFY_SCORE)){const hh=D.headerOf(it.raw)||D.headerOf('MI'+rr)||D.headerOf('M'+rr)||D.headerLoose(rr);if(hh||FORM_LABELS.test(rr)){if(hh){headers.push({h:hh,y:it.y});headers.sort((a,b)=>a.y-b.y);}continue;}}}
    const sp=D.splitNotes(it.raw);const m=D.match(sp.name);
    const sec=headers.filter(h=>h.y<it.y+0.3*s).pop();
    const o={raw:it.raw,name:sp.name,notes:it.notesOverride||sp.notes,section:sec?sec.h:null,checked:it.checked,fill:it.fill,boxDetected:it.boxDetected,loose:!!it.loose,suspect:!!it.suspect,
      bbox:it.box?{x:it.box.x,y:it.box.y,w:it.box.w,h:it.box.h}:null,lineBox:it.line?it.line.bbox:null};
    if(m&&m.score>=VERIFY_SCORE){o.id=m.id;o.testName=m.name;o.category=m.category;o.score=m.score;o.runnerUp=m.runnerUp;}else{o.id=null;o.testName=null;o.score=m?m.score:0;}
    o.status=!o.id?'unrecognized':(o.score>=OK_SCORE&&o.boxDetected&&!(o.runnerUp&&o.runnerUp.score>o.score-0.04&&o.score<0.97)?'ok':'verify');o.reocr=!!it.reocr;
    if(!sp.name&&!it.raw){o.status='unrecognized';}
    // a checkbox (strict or loose) whose line could not be read as a test: never drop it silently
    if(it.box&&!o.id&&o.checked!==false){o.status='missed';o.warn='Possible missed line - check paper';}
    { const ls=listSplit(sp.name,m);if(ls){ // t219
        for(const r of ls){const e=r.id?D.BYID[r.id]:null;
          outItems.push(Object.assign({},o,r.id?{name:r.f,id:r.id,testName:e?e.name:r.id,category:e?e.category:null,score:r.score,runnerUp:null,status:o.boxDetected?'ok':'verify',warn:undefined,listSplit:true}
            :{name:r.f,id:null,testName:null,score:0,status:o.checked!==false&&o.bbox?'missed':'unrecognized',warn:o.checked!==false&&o.bbox?'Possible missed line - check paper':undefined,listSplit:true}));}
        continue;} }
    outItems.push(o);
    if(o.id&&o.status!=='missed')for(const id of extraTests(sp.name,m)){const e=D.BYID[id];   // t221
      outItems.push(Object.assign({},o,{id,testName:e?e.name:id,category:e?e.category:null,score:1,runnerUp:null,extraFrom:o.id,status:o.boxDetected?'ok':'verify'}));}}
  return {layout:'list',items:outItems,headers,looseMarks:loose.length,columnBoxes:bs.length,standingOrder:standingConsensus(outItems)};}
/* If the same bracketed standing order is on most lines, report it once ('Standing order (all tests)') and flag the per-line
   copies as common so the UI does not repeat it. Unparseable copies stay as 'Standing order noted - check paper'. */
function standingConsensus(items){
  const act=items.filter(o=>(o.id||o.warn)&&o.checked!==false);const so=o=>o.notes.find(n=>n.type==='standing order'&&n.parsed!==undefined);
  const withSo=act.filter(so);if(withSo.length<2)return null;const cnt={};for(const o of withSo){const n=so(o);if(n.parsed)cnt[n.text]=(cnt[n.text]||0)+1;}
  const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];if(!best||best[1]<2||best[1]<0.5*withSo.length)return null;const text=best[0];
  const key=t=>D.norm(t).replace(/\bfrom\b|\brepeat\b/g,'').replace(/\s+/g,'');
  for(const o of withSo){const n=so(o);if(!n.parsed&&n.rawText&&D.sim(key(n.rawText),key(text))>=0.85){n.text=text;n.parsed=true;n.repaired=true;}if(n.parsed&&n.text===text)n.common=true;}
  const nCommon=withSo.filter(o=>so(o).common).length;
  return {text,count:nCommon,total:act.length,all:nCommon===act.length};}
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
