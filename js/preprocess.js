/* Shared image pipeline (browser + Node). Pure OpenCV.js; no I/O, no storage, no network.
   All Mats are deleted by the caller/pipeline; nothing persists. */
(function(root){
'use strict';
function toGray(cv,src){const g=new cv.Mat();
  const ch=src.channels();
  if(ch===4)cv.cvtColor(src,g,cv.COLOR_RGBA2GRAY);else if(ch===3)cv.cvtColor(src,g,cv.COLOR_RGB2GRAY);else src.copyTo(g);return g;}
function resize(cv,m,s,interp){const o=new cv.Mat();cv.resize(m,o,new cv.Size(Math.round(m.cols*s),Math.round(m.rows*s)),0,0,interp===undefined?(s>1?cv.INTER_CUBIC:cv.INTER_AREA):interp);return o;}

// Illumination / shadow normalisation: divide by estimated paper background.
function normalizeIllum(cv,gray){
  const k=Math.max(15,Math.round(Math.max(gray.cols,gray.rows)/40))|1;
  const bg=new cv.Mat();const ker=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(k,k));
  cv.dilate(gray,bg,ker);ker.delete();
  cv.medianBlur(bg,bg,Math.min(255,k|1)>31?31:(k|1));
  const out=new cv.Mat();cv.divide(gray,bg,out,255);bg.delete();
  // stretch contrast
  cv.normalize(out,out,0,255,cv.NORM_MINMAX);
  return out;}

// Try to find the page outline; only accept a confident convex quad covering most of the frame.
function findPageQuad(cv,gray){
  const s=600/Math.max(gray.cols,gray.rows);const sm=resize(cv,gray,s,cv.INTER_AREA);
  cv.GaussianBlur(sm,sm,new cv.Size(5,5),0);const ed=new cv.Mat();cv.Canny(sm,ed,40,120);
  const ker=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));cv.dilate(ed,ed,ker);ker.delete();
  const cs=new cv.MatVector(),h=new cv.Mat();cv.findContours(ed,cs,h,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
  let best=null,bestA=0;const A=sm.cols*sm.rows;
  for(let i=0;i<cs.size();i++){const c=cs.get(i);const peri=cv.arcLength(c,true);const ap=new cv.Mat();
    cv.approxPolyDP(c,ap,0.02*peri,true);
    if(ap.rows===4&&cv.isContourConvex(ap)){const a=cv.contourArea(ap);if(a>bestA){bestA=a;best=[];for(let j=0;j<4;j++)best.push([ap.data32S[2*j]/s,ap.data32S[2*j+1]/s]);}}
    ap.delete();c.delete();}
  cs.delete();h.delete();ed.delete();sm.delete();
  if(!best||bestA<0.35*A)return null;
  // order tl,tr,br,bl
  const sum=best.map(p=>p[0]+p[1]),dif=best.map(p=>p[1]-p[0]);
  const tl=best[sum.indexOf(Math.min(...sum))],br=best[sum.indexOf(Math.max(...sum))],tr=best[dif.indexOf(Math.min(...dif))],bl=best[dif.indexOf(Math.max(...dif))];
  return [tl,tr,br,bl];}
function warpQuad(cv,gray,q){
  const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const W=Math.round(Math.max(d(q[0],q[1]),d(q[3],q[2]))),H=Math.round(Math.max(d(q[0],q[3]),d(q[1],q[2])));
  const src=cv.matFromArray(4,1,cv.CV_32FC2,[].concat(...q));const dst=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,W,0,W,H,0,H]);
  const M=cv.getPerspectiveTransform(src,dst);const out=new cv.Mat();
  cv.warpPerspective(gray,out,M,new cv.Size(W,H),cv.INTER_LINEAR,cv.BORDER_REPLICATE);
  src.delete();dst.delete();M.delete();return out;}

// Rotate about centre by angle (deg, CCW positive) with canvas expansion, white border.
function rotateExpand(cv,m,angle,interp){
  const c=new cv.Point(m.cols/2,m.rows/2);const M=cv.getRotationMatrix2D(c,angle,1);
  const r=angle*Math.PI/180,ca=Math.abs(Math.cos(r)),sa=Math.abs(Math.sin(r));
  const W=Math.round(m.cols*ca+m.rows*sa),H=Math.round(m.cols*sa+m.rows*ca);
  M.doublePtr(0,2)[0]+=W/2-c.x;M.doublePtr(1,2)[0]+=H/2-c.y;
  const o=new cv.Mat();cv.warpAffine(m,o,M,new cv.Size(W,H),interp===undefined?cv.INTER_LINEAR:interp,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));M.delete();return o;}

// Projection-profile orientation/skew estimate. Returns angle (deg) to rotate CCW so text lines are horizontal
// (covers 0/90 ambiguity; 180 handled later by OCR).
function estimateRotation(cv,norm){
  const s=700/Math.max(norm.cols,norm.rows);const sm=resize(cv,norm,s,cv.INTER_AREA);
  const bin=new cv.Mat();cv.threshold(sm,bin,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);sm.delete();
  function score(a){const r=rotateExpand(cv,bin,a,cv.INTER_NEAREST);// background 255 -> treat as ink? fix: border is 255(white) in inverted = ink; mask it
    // rotate a ones-mask to remove border fill
    let sc=0;const rows=r.rows,cols=r.cols,d=r.data;let prev=-1;
    for(let y=0;y<rows;y++){let s2=0;const o=y*cols;for(let x=0;x<cols;x++)if(d[o+x]===255)s2++;if(prev>=0)sc+=(s2-prev)*(s2-prev);prev=s2;}
    r.delete();return sc;}
  // use BORDER of 0 for inverted image
  const best={a:0,s:-1};
  const cands=[];for(let base of [0,90,-90])for(let a=-12;a<=12;a+=2)cands.push(base+a);
  for(const a of cands){const sc=scoreInv(a);if(sc>best.s){best.s=sc;best.a=a;}}
  // refine
  const b0=best.a;for(let a=b0-1.5;a<=b0+1.5;a+=0.5){const sc=scoreInv(a);if(sc>best.s){best.s=sc;best.a=a;}}
  function scoreInv(a){const c=new cv.Point(bin.cols/2,bin.rows/2);const M=cv.getRotationMatrix2D(c,a,1);
    const D=Math.round(Math.hypot(bin.cols,bin.rows));M.doublePtr(0,2)[0]+=D/2-c.x;M.doublePtr(1,2)[0]+=D/2-c.y;
    const r=new cv.Mat();cv.warpAffine(bin,r,M,new cv.Size(D,D),cv.INTER_NEAREST,cv.BORDER_CONSTANT,new cv.Scalar(0));M.delete();
    const red=new cv.Mat();cv.reduce(r,red,1,cv.REDUCE_SUM,cv.CV_32S);r.delete();
    let sc=0;for(let y=1;y<red.rows;y++){const dd=(red.data32S[y]-red.data32S[y-1])/255;sc+=dd*dd;}red.delete();return sc;}
  bin.delete();return best.a;}

/* preprocess: returns {img: normalized gray Mat upright (except possible 180), info}
   opts.targetLong: working resolution of the longer side */
function preprocess(cv,src,opts){
  opts=opts||{};const info={};
  let g=toGray(cv,src);
  const q=opts.noQuad?null:findPageQuad(cv,g);info.pageQuad=!!q;
  if(q){const w=warpQuad(cv,g,q);g.delete();g=w;}
  const target=opts.targetLong||2400;const s=Math.max(0.3,Math.min(6,target/Math.max(g.cols,g.rows)));info.scale=s;
  const gs=resize(cv,g,s);g.delete();
  const n=normalizeIllum(cv,gs);gs.delete();
  const a=(typeof opts.rotation==='number')?opts.rotation:estimateRotation(cv,n);info.rotation=a;
  const r=Math.abs(a)>0.25?rotateExpand(cv,n,a):n.clone();n.delete();
  return {img:r,info};}
function rotate180(cv,m){const o=new cv.Mat();cv.rotate(m,o,cv.ROTATE_180);return o;}

// Binary (ink=255) via Otsu on illumination-normalised gray
function binarize(cv,norm){const b=new cv.Mat();cv.threshold(norm,b,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);return b;}
// Remove long horizontal rules (form lines) from a binary ink image; returns new Mat
function removeRules(cv,bin,minLen){const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(Math.max(15,Math.round(minLen)),1));
  const lines=new cv.Mat();cv.morphologyEx(bin,lines,cv.MORPH_OPEN,k);k.delete();
  const kv=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(1,Math.max(15,Math.round(minLen))));const vl=new cv.Mat();cv.morphologyEx(bin,vl,cv.MORPH_OPEN,kv);kv.delete();cv.bitwise_or(lines,vl,lines);vl.delete();
  const k2=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,5));cv.dilate(lines,lines,k2);k2.delete();
  const out=new cv.Mat();cv.subtract(bin,lines,out);lines.delete();return out;}
function inkFrac(bin,x0,y0,x1,y1){x0=Math.max(0,Math.round(x0));y0=Math.max(0,Math.round(y0));x1=Math.min(bin.cols,Math.round(x1));y1=Math.min(bin.rows,Math.round(y1));
  if(x1<=x0||y1<=y0)return 0;let n=0;const d=bin.data,c=bin.cols;for(let y=y0;y<y1;y++){const o=y*c;for(let x=x0;x<x1;x++)if(d[o+x])n++;}return n/((x1-x0)*(y1-y0));}
// side coverage: fraction of positions along a side where any ink exists within band thickness t
function sideCov(bin,b,side,t){const d=bin.data,c=bin.cols;let hit=0,tot=0;
  if(side==='top'||side==='bottom'){const ys=side==='top'?b.y:b.y+b.h-t;for(let x=b.x+t;x<b.x+b.w-t;x++){tot++;let h=0;for(let y=ys;y<ys+t;y++)if(y>=0&&y<bin.rows&&d[y*c+x]){h=1;break;}hit+=h;}}
  else{const xs=side==='left'?b.x:b.x+b.w-t;for(let y=b.y+t;y<b.y+b.h-t;y++){tot++;let h=0;for(let x=xs;x<xs+t;x++)if(x>=0&&x<c&&d[y*c+x]){h=1;break;}hit+=h;}}
  return tot?hit/tot:0;}
/* Refit a box-candidate bounding rect to its frame: outermost columns/rows that are mostly ink along the box
   (straight frame edges), ignoring tick strokes that stick out. Returns refined {x,y,w,h} or null. */
function refineFrame(bin,r){const d=bin.data,c=bin.cols;const x0=Math.max(0,r.x),y0=Math.max(0,r.y),x1=Math.min(c,r.x+r.w),y1=Math.min(bin.rows,r.y+r.h);
  const W=x1-x0,H=y1-y0;if(W<6||H<6)return null;const col=new Array(W).fill(0),row=new Array(H).fill(0);
  for(let y=y0;y<y1;y++){const o=y*c;for(let x=x0;x<x1;x++)if(d[o+x]){col[x-x0]++;row[y-y0]++;}}
  const win=a=>a.map((v,i)=>Math.max(v,(a[i-1]||0)+v,v+(a[i+1]||0)));// allow a 1-px lean of tilted frame edges
  const cw=win(col),rw=win(row);
  const strongC=[],strongR=[];
  // a column is a vertical frame edge if it is inked along most of the shorter dimension (box side ~ min(W,H))
  const side=Math.min(W,H);for(let i=0;i<W;i++)if(cw[i]>=0.62*side)strongC.push(i);for(let i=0;i<H;i++)if(rw[i]>=0.62*side)strongR.push(i);
  if(strongC.length<2||strongR.length<2)return null;
  const l=strongC[0],rr=strongC[strongC.length-1],t=strongR[0],bb=strongR[strongR.length-1];
  if(rr-l<0.6*side||bb-t<0.6*side)return null;
  return {x:x0+l,y:y0+t,w:rr-l+1,h:bb-t+1};}
/* Find checkbox squares in a binary ink image. Returns [{x,y,w,h,fill}] */
function findBoxes(cv,bin,opts){opts=opts||{};const L=Math.max(bin.cols,bin.rows);
  const sMin=opts.sMin||Math.max(6,L*0.004),sMax=opts.sMax||L*0.05;
  const cs=new cv.MatVector(),hi=new cv.Mat();cv.findContours(bin,cs,hi,cv.RETR_CCOMP,cv.CHAIN_APPROX_SIMPLE);
  let c=[];
  for(let i=0;i<cs.size();i++){if(hi.data32S[i*4+3]!==-1)continue;/* outer boundaries only, skip holes */const ct=cs.get(i);const r=cv.boundingRect(ct);const cpts=ct.data32S.slice();ct.delete();
    if(r.width<sMin||r.height<sMin||r.width>sMax*1.6||r.height>sMax*1.6)continue;let ar=r.width/r.height;
    let b={x:r.x,y:r.y,w:r.width,h:r.height};
    // a tick that overshoots the frame (common on EMR prints: the check mark pokes out of the top-right corner) widens the
    // bounding box; refit the box to its straight frame edges before the shape tests
    if(ar<0.72||ar>1.38||r.width>sMax||r.height>sMax){const fb=refineFrame(bin,b);if(!fb)continue;b=fb;ar=b.w/b.h;
      if(b.w<sMin||b.h<sMin||b.w>sMax||b.h>sMax||ar<0.72||ar>1.38)continue;b.refined=true;}const dbg=opts.debugAt&&Math.abs(r.x-opts.debugAt[0])<15&&Math.abs(r.y-opts.debugAt[1])<15;const t=Math.max(2,Math.round(0.14*Math.min(b.w,b.h)));
    const sc=['top','bottom','left','right'].map(sd=>{let best=0;const span=Math.round(0.3*((sd==='top'||sd==='bottom')?b.h:b.w));
      for(let o=0;o<=span;o+=Math.max(1,Math.round(t/2))){const bb={x:b.x,y:b.y,w:b.w,h:b.h};
        if(sd==='top'){bb.y+=o;bb.h-=o;}else if(sd==='bottom'){bb.h-=o;}else if(sd==='left'){bb.x+=o;bb.w-=o;}else{bb.w-=o;}
        const v=sideCov(bin,bb,sd,t);if(v>best)best=v;if(best>0.95)break;}return best;});
    if(dbg)console.log('dbg sides',sc);if(Math.min(...sc)<0.75)continue;
    // contour must reach close to the bbox corners (square, not round)
    {const s0=(b.w+b.h)/2;const cd=[[b.x,b.y],[b.x+b.w-1,b.y],[b.x,b.y+b.h-1],[b.x+b.w-1,b.y+b.h-1]].map(([cx,cy])=>{let m=1e9;for(let k=0;k<cpts.length;k+=2){const d=Math.hypot(cpts[k]-cx,cpts[k+1]-cy);if(d<m)m=d;}return m/s0;}).sort((a,b)=>a-b);
     if(dbg)console.log('dbg cornerdist',cd);
     // a tick crossing a corner pulls the outer contour away from it; tolerate that when all four sides are clearly straight and inked
     const strong=Math.min(...sc)>=0.95;if(cd[2]>(strong?0.2:0.13)||cd[3]>(strong?0.36:0.3))continue;}
    // corners must contain ink (rules out round glyphs like o, e, c, 0)
    const ct2=Math.max(2,Math.round(0.2*Math.min(b.w,b.h)));
    const corners=[[b.x,b.y],[b.x+b.w-ct2,b.y],[b.x,b.y+b.h-ct2],[b.x+b.w-ct2,b.y+b.h-ct2]].map(([x,y])=>inkFrac(bin,x,y,x+ct2,y+ct2));
    if(dbg)console.log('dbg corners',corners);if(corners.slice().sort((a,b)=>a-b)[1]<0.08)continue;
    // hollow: border band dense, ring just inside border mostly empty (rules out solid blobs / bold letters like D, O)
    const ins=Math.max(t+1,Math.round(0.22*Math.min(b.w,b.h)));
    const inner=inkFrac(bin,b.x+ins,b.y+ins,b.x+b.w-ins,b.y+b.h-ins);
    if(dbg)console.log('dbg inner',inner);if(inner>0.75)continue;
    b.sides=sc;c.push(b);}
  cs.delete();hi.delete();
  // drop boxes contained in other boxes (inner contours)
  c.sort((a,b)=>b.w*b.h-a.w*a.h);const keep=[];
  for(const b of c){if(keep.some(k=>b.x>=k.x-2&&b.y>=k.y-2&&b.x+b.w<=k.x+k.w+2&&b.y+b.h<=k.y+k.h+2))continue;keep.push(b);}
  if(!keep.length){const e=[];e.med=0;e.flip=false;return e;}
  for(const b of keep){const s=(b.w+b.h)/2;b.s=s;
    b.gapL=inkFrac(bin,b.x-0.7*s,b.y+0.1*s,b.x-0.08*s,b.y+b.h-0.1*s);b.gapR=inkFrac(bin,b.x+b.w+0.08*s,b.y+0.1*s,b.x+b.w+0.7*s>b.x+b.w+0.25*s?b.x+b.w+0.25*s:0,b.y+b.h-0.1*s);
    b.textRight=inkFrac(bin,b.x+b.w+0.2*s,b.y,b.x+b.w+4*s,b.y+b.h);b.textLeft=inkFrac(bin,b.x-4*s,b.y,b.x-0.2*s,b.y+b.h);
    b.farL=inkFrac(bin,b.x-1.6*s,b.y+0.15*s,b.x-0.1*s,b.y+b.h-0.15*s);b.farR=inkFrac(bin,b.x+b.w+0.1*s,b.y+0.15*s,b.x+b.w+1.6*s,b.y+b.h-0.15*s);
    b.okN=b.gapL<0.02&&b.farL<0.01&&b.textRight>0.03;   // upright: nothing just left, text on right
    b.okF=b.farR<0.01&&b.textLeft>0.03; // 180-flipped page
  }
  // refitted (tick-overshoot) boxes count half in the orientation vote: a lone refit blob must not flip the page
  const wt=b=>b.refined?0.5:1;const nN=keep.filter(b=>b.okN).reduce((a,b)=>a+wt(b),0),nF=keep.filter(b=>b.okF).reduce((a,b)=>a+wt(b),0);const flip=opts.allowFlip!==false&&nF>nN*1.5&&nF>=1;
  let cand=keep.filter(b=>flip?b.okF:b.okN);
  const sides=cand.map(b=>b.s).sort((a,b)=>a-b);
  if(!sides.length){const e=[];e.med=0;e.flip=false;e.nN=nN;e.nF=nF;return e;}
  // dominant size cluster; ties broken toward larger boxes (letters are smaller than checkboxes)
  let bestMed=sides[0],bestN=0;
  for(const s0 of sides){const n=sides.filter(s=>s>=s0*0.8&&s<=s0*1.25).length;if(n>=bestN){bestN=n;bestMed=s0;}}
  const cl=sides.filter(s=>s>=bestMed*0.8&&s<=bestMed*1.25);const med=cl[Math.floor(cl.length/2)];
  let out=cand.filter(b=>b.s>=med*0.5&&b.s<=med*1.9);
  for(const b of out){const ins=0.24*b.s;b.fill=inkFrac(bin,b.x+ins,b.y+ins,b.x+b.w-ins,b.y+b.h-ins);}
  out.nN=nN;out.nF=nF;out.flip=flip;
  out.med=med;return out;}

const api={refineFrame,binarize,removeRules,inkFrac,findBoxes,toGray,resize,normalizeIllum,findPageQuad,warpQuad,rotateExpand,estimateRotation,preprocess,rotate180};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReqPre=api;
})(typeof self!=='undefined'?self:this);
