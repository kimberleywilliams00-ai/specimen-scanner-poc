/* Collection Summary (v3.2). Pure in-memory rendering from js/collection_data.js (LifeLabs Lab Test Information exports,
   transcribed verbatim and Kimberley-verified). Nothing is stored or sent. Never guesses: tests without an entry get an amber card.
   Tube consolidation rules (conservative):
   - Explicit directory rule wins: containers with the same shareGroup (one full EDTA tube for Hematology Panel + SR + A1c) are shared.
   - Otherwise only BLOOD tubes are ever shared; swabs, urine containers and tubes marked noShare (e.g. PTT: full-tube citrate) are never shared.
   - Two tests may share a tube only if container, centrifuge yes/no, clot time, RCF, spin minutes, storage temperature and destination
     group (LifeLabs vs BCCDC PHL) are all identical, and the components come from different tests.
   - Stated collection volumes in one tube may total at most half the tube's nominal volume (rule of thumb: serum is roughly half the
     blood volume; not from LifeLabs). Otherwise another tube of the same kind is started.
   - A shared tube shows 'confirm with lab if combining' whenever any member's volume is not stated, its destination is inferred,
     its clot step is ambiguous, or the members name different requisition forms. */
(function(root){
'use strict';
const DATA=root.CollectionData||{entries:[]};
const DIR_URL='https://tests.lifelabs.com/';
const BYDICT={};for(const e of DATA.entries)for(const id of e.dictIds||[])if(!BYDICT[id])BYDICT[id]=e;

function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}
  for(const k of kids)if(k!=null&&k!==false)e.appendChild(typeof k==='string'?document.createTextNode(k):k);return e;}
const uniq=a=>[...new Set(a.filter(Boolean))];
function nominalMl(container){const m=(container||'').match(/(\d+(?:\.\d+)?)\s*mL/i);return m?+m[1]:null;}
function tubeColour(container){const c=(container||'').toLowerCase();
  if(/citrate|light blue/.test(c))return {rank:2,css:'lblue'};if(/sst|gold|red top|serum/.test(c))return {rank:3,css:'gold'};
  if(/heparin|green/.test(c))return {rank:4,css:'green'};if(/edta|lavender|pink/.test(c))return {rank:5,css:'lav'};if(/fluoride|grey|gray/.test(c))return {rank:6,css:'grey'};return {rank:9,css:''};}
function destLabel(c){if(c.destination)return c.destination+(c.destGroup==='PHL'&&!/PHL/.test(c.destination)?' (BCCDC Public Health Lab)':'');
  if(c.destGroup==='PHL')return 'BCCDC Public Health Lab - inferred from the requisition form named (PDF does not name the lab; confirm)';
  return 'Not stated in the directory entry (LifeLabs directory)';}
function srcLine(e){return 'Source: LifeLabs Lab Test Information, published '+e.lastPublished+' · last checked '+e.lastChecked;}
function short(e){return e.name.replace(/\s*\(.*\)\s*$/,'');}

/* items: [{id, name, notes:[{type,text}]}] -> {known:[{entry, items}], unknown:[item]} */
function resolve(items){const known=[],unknown=[],byEntry=new Map();
  for(const it of items){const e=it.id&&BYDICT[it.id];if(!e){unknown.push(it);continue;}
    if(!byEntry.has(e.id)){const k={entry:e,items:[]};byEntry.set(e.id,k);known.push(k);}byEntry.get(e.id).items.push(it);}
  return {known,unknown};}

function plan(known){
  const tubes=[],others=[];
  for(const {entry:e} of known)for(const c of e.collect){
    for(let n=0;n<(c.count||1);n++){
      const slot={entry:e,c};
      // explicit sharing rule stated in the directory (e.g. one full EDTA tube for HP + SR + A1c): share only within that group
      if(c.kind==='blood'&&c.shareGroup){let g=tubes.find(t=>t.key==='SG:'+c.shareGroup&&!t.members.some(m=>m.entry.id===e.id));
        if(!g){g={key:'SG:'+c.shareGroup,c,members:[],kind:'blood',explicit:true};tubes.push(g);}g.members.push(slot);continue;}
      if(c.kind!=='blood'||c.noShare){others.push({c,members:[slot],kind:c.kind});continue;}
      const key=[c.container,c.centrifuge,c.clotMinutes,c.rcf,c.spinMinutes,c.temp,c.destGroup||''].join('|');
      const cap=(nominalMl(c.container)||0)/2;
      let t=tubes.find(t=>t.key===key&&!t.members.some(m=>m.entry.id===e.id)&&
        (t.members.reduce((s,m)=>s+(m.c.volumeMl||0),0)+(c.volumeMl||0))<=cap+1e-9);
      if(!t){t={key,c,members:[],kind:'blood'};tubes.push(t);}t.members.push(slot);}}
  // caveats
  for(const t of tubes){t.caveats=[];if(t.members.length<2||t.explicit)continue;
    const unk=t.members.filter(m=>!m.c.volumeMl).map(m=>short(m.entry));if(unk.length)t.caveats.push('collection volume not stated for '+unk.join(', '));
    const inf=t.members.filter(m=>m.c.destinationInferred).map(m=>short(m.entry));if(inf.length)t.caveats.push('destination inferred from requisition form for '+inf.join(', '));
    const cl=t.members.filter(m=>m.c.clotNote).map(m=>short(m.entry));if(cl.length)t.caveats.push('clot step unclear for '+cl.join(', '));
    const forms=uniq(t.members.map(m=>m.c.form||m.entry.form));if(forms.length>1)t.caveats.push('different requisition form names: '+forms.join(' / '));
    if(!t.caveats.length&&t.members.reduce((s,m)=>s+(m.c.volumeMl||0),0)>0)t.ok=true;}
  // blood tubes in general order-of-draw rank (stable within a type), number per container type
  // within one container type: centrifuged tubes first, then unspun (BCCDC) ones
  const spinRank=t=>t.c.centrifuge===true?0:t.c.centrifuge===false?1:2;
  const blood=tubes.concat(others.filter(o=>o.kind==='blood')).sort((a,b)=>tubeColour(a.c.container).rank-tubeColour(b.c.container).rank||spinRank(a)-spinRank(b));
  const cnt={};for(const t of blood){cnt[t.c.container]=(cnt[t.c.container]||0)+1;t.no=cnt[t.c.container];}
  for(const t of blood)t.ofType=cnt[t.c.container];
  return {blood,nonBlood:others.filter(o=>o.kind!=='blood')};}

function memberLabel(m){return short(m.entry)+(m.c.tests&&m.entry.collect.length>1?' ('+m.c.tests+')':'');}
function spinText(c){if(c.centrifuge===true)return (c.clotMinutes?'Clot upright ≥ '+c.clotMinutes+' min, then ':'')+'centrifuge '+(c.spinMinutes?c.spinMinutes+' min':'')+(c.rcf?' at '+c.rcf+' RCF':'');
  if(c.centrifuge===false)return 'Do NOT centrifuge';return '';}

function render(host,items,opts){
  host.innerHTML='';const {known,unknown}=resolve(items);const P=plan(known);
  const confirmedIds=new Set(items.map(i=>i.id).filter(Boolean));
  host.appendChild(el('div',{class:'sum-head'},el('h2',{text:'Collection summary'}),
    el('div',{class:'small',text:items.length+' confirmed test'+(items.length===1?'':'s')+' · '+known.length+' with collection info · '+unknown.length+' without'})));

  // 1. time-critical / do-not-centrifuge banners
  const crit=[];for(const {entry:e} of known)for(const s of e.stability||[])if(s.critical)crit.push({e,s});
  if(crit.length){const b=el('div',{class:'sum-card crit'},el('h3',{text:'⏱ Time-critical / fill requirements'}));const ul=el('ul');
    for(const {e,s} of crit)ul.appendChild(el('li',{},el('b',{text:short(e)+': '}),s.text+(s.when?' (when '+s.when+')':'')));b.appendChild(ul);host.appendChild(b);}
  const nospin=P.blood.filter(t=>t.c.centrifuge===false);
  if(nospin.length)host.appendChild(el('div',{class:'sum-card nospin'},el('h3',{text:'⛔ Do NOT centrifuge'}),
    el('div',{text:nospin.map(t=>t.c.container+' #'+t.no+' ('+t.members.map(memberLabel).join(', ')+')').join('; ')})));

  // amber cards first so they are never missed
  for(const it of unknown){host.appendChild(el('div',{class:'sum-card amber'},el('div',{class:'tname',text:'⚠ '+it.name+(it.id?'':' (unmatched)')}),
    el('div',{},el('b',{text:'No collection info yet'}),' - check LifeLabs Lab Test Information: ',el('a',{href:DIR_URL,target:'_blank',rel:'noopener noreferrer',text:'tests.lifelabs.com'})),
    el('div',{class:'small',text:'Not included in the tube counts below.'})));}
  const banner=()=>host.appendChild(el('div',{class:'proto-banner',text:'Prototype - verify against current LifeLabs/BCCDC guidance before collecting.'}));
  if(!known.length){banner();return {known:0,unknown:unknown.length,blood:0,other:0};}
  // 2. what to collect
  if(!known.length&&!unknown.length)host.appendChild(el('div',{class:'sum-card',text:'No tests confirmed.'}));
  const wc=el('div',{class:'sum-card'},el('h3',{text:'What to collect'}));
  const nb=P.blood.length,nn=P.nonBlood.length;
  wc.appendChild(el('div',{class:'small',text:(nb?nb+' blood tube'+(nb>1?'s':''):'No blood tubes')+(nn?' · '+nn+' other container'+(nn>1?'s':''):'')+(unknown.length?' · plus anything needed for the '+unknown.length+' test(s) without info (amber, above)':'')}));
  for(const t of P.blood.concat(P.nonBlood)){const c=t.c;const col=tubeColour(c.container);
    const title=(c.altContainer?c.container+' or '+c.altContainer:c.container)+(t.kind==='blood'&&t.ofType>1?' #'+t.no:'')+(c.centrifuge===true?' - centrifuge':c.centrifuge===false?' - do NOT centrifuge':'')+(c.destGroup==='PHL'?' - to BCCDC':'');
    const box=el('div',{class:'tube '+col.css+(c.centrifuge===false?' nospin':'')},el('div',{class:'tube-title'},el('span',{class:'swatch '+col.css}),title));
    box.appendChild(el('div',{class:'tube-tests',text:'For: '+t.members.map(memberLabel).join(', ')}));
    const vols=t.kind==='swab'?[]:t.explicit?uniq(t.members.map(m=>m.c.volume)):t.members.map(m=>(t.members.length>1?short(m.entry)+' ':'')+(m.c.volume||'not stated'));
    const facts=[];if(vols.length)facts.push('Volume: '+vols.join(', '));const sp=spinText(c);if(sp)facts.push(sp);if(c.temp)facts.push(c.temp);
    if(t.kind==='blood'||c.destination)facts.push('Destination: '+destLabel(c));
    const forms=uniq(t.members.map(m=>m.c.form||m.entry.form));if(forms.length)facts.push('Form: '+forms.join(' / '));
    const bags=uniq(t.members.map(m=>m.c.bag));if(bags.length)facts.push('Bag: '+bags.join(' / '));
    for(const f of facts)box.appendChild(el('div',{class:'fact'+(/NOT centrifuge/.test(f)?' warn':'')},f));
    for(const n of uniq(t.members.flatMap(m=>m.c.notes||[])))box.appendChild(el('div',{class:'fact note-l',text:'“'+n+'”'}));
    for(const m of t.members)if(m.c.branchNote)box.appendChild(el('div',{class:'fact caveat',text:'⚠ '+m.c.branchNote}));
    for(const m of t.members)if(m.c.clotNote)box.appendChild(el('div',{class:'fact caveat',text:'⚠ '+m.c.clotNote}));
    if(t.caveats&&t.caveats.length)box.appendChild(el('div',{class:'fact caveat',text:'⚠ Confirm with lab if combining: '+t.caveats.join('; ')+'.'}));
    if(t.explicit&&t.members.length>1)box.appendChild(el('div',{class:'fact small',text:'Shared as stated in the LifeLabs directory: “'+t.members[t.members.length-1].c.shareNote+'”'}));
    else if(t.members.length>1&&!(t.caveats&&t.caveats.length))box.appendChild(el('div',{class:'fact small',text:'Shared: same container, handling, temperature and destination; stated volumes total '+t.members.reduce((s,m)=>s+(m.c.volumeMl||0),0)+' mL.'}));
    wc.appendChild(box);}
  if(known.length)host.appendChild(wc);

  // 3. order of draw (general guidance only)
  if(P.blood.length){const od=el('div',{class:'sum-card'},el('h3',{text:'Blood tube order'}));
    const ol=el('ol');for(const t of P.blood)ol.appendChild(el('li',{text:t.c.container+(t.ofType>1?' #'+t.no:'')+' - '+t.members.map(memberLabel).join(', ')}));od.appendChild(ol);
    od.appendChild(el('div',{class:'small',text:'Listed in the general CLSI GP41 order of draw (blood culture → light blue citrate → serum/SST → heparin → EDTA → fluoride). General guidance, not from the LifeLabs entries; follow local policy.'+(P.blood.some(t=>tubeColour(t.c.container).css==='lblue')?' CLSI also advises a discard tube before a citrate tube when a winged (butterfly) set is used.':'')}));
    host.appendChild(od);}

  // 4. patient prep
  const prep=[];for(const {entry:e,items:its} of known){for(const p of e.patientPrep||[])prep.push([short(e),p]);}
  for(const it of items)for(const n of it.notes||[])if(/patient|instruction/i.test(n.type))prep.push([it.name+' (requisition)',n.text]);
  const pc=el('div',{class:'sum-card'},el('h3',{text:'Patient preparation'}));
  if(prep.length){const ul=el('ul');for(const [w,p] of prep)ul.appendChild(el('li',{},el('b',{text:w+': '}),p));pc.appendChild(ul);}
  else pc.appendChild(el('div',{class:'small',text:'No patient preparation stated for these tests.'}));
  const docs=known.filter(k=>(k.entry.patientInstructionDocs||[]).length).map(k=>short(k.entry));
  if(docs.length)pc.appendChild(el('div',{class:'small',text:'Printable patient instruction sheets (several languages) are listed in LifeLabs Lab Test Information for: '+docs.join(', ')+'.'}));
  host.appendChild(pc);

  // 5. processing + storage/transport
  const pr=el('div',{class:'sum-card'},el('h3',{text:'Processing, storage & transport'}));const ul=el('ul');
  for(const t of P.blood.concat(P.nonBlood)){const sp=spinText(t.c);ul.appendChild(el('li',{class:t.c.centrifuge===false?'warn':''},el('b',{text:(t.c.altContainer?t.c.container+' / '+t.c.altContainer:t.c.container)+(t.ofType>1?' #'+t.no:'')+': '}),[sp,t.c.temp].filter(Boolean).join(' · ')||'see handling notes'));}
  pr.appendChild(ul);
  for(const {entry:e} of known)for(const s of e.stability||[])if(!s.critical)pr.appendChild(el('div',{class:'fact',text:short(e)+(s.text===e.specimenStability?' - specimen stability: ':': ')+s.text}));
  host.appendChild(pr);

  // 6. paperwork & destination
  const pw=el('div',{class:'sum-card'},el('h3',{text:'Requisitions & destination'}));
  const forms={};for(const t of P.blood.concat(P.nonBlood))for(const m of t.members){const f=m.c.form||m.entry.form;if(f)(forms[f]=forms[f]||new Set()).add(short(m.entry));}
  const fl=el('ul');for(const f in forms)fl.appendChild(el('li',{},el('b',{text:f+': '}),[...forms[f]].join(', ')));
  if(Object.keys(forms).length){pw.appendChild(el('div',{text:'Extra requisition forms named in the directory:'}));pw.appendChild(fl);}
  else pw.appendChild(el('div',{class:'small',text:'No extra requisition forms named for these tests.'}));
  const unnamed=known.filter(k=>k.entry.collect.some(c=>c.destination==='BCCDC'&&!c.form&&!k.entry.form)).map(k=>short(k.entry));
  if(unnamed.length)pw.appendChild(el('div',{class:'fact caveat',text:'⚠ '+unnamed.join(', ')+': BCCDC tube but no form named in the directory - confirm which requisition goes with it.'}));
  const rn=[];for(const {entry:e} of known)for(const r of e.requisitionNotes||[])rn.push([short(e),r]);
  if(rn.length){const l=el('ul');for(const [w,r] of rn)l.appendChild(el('li',{},el('b',{text:w+': '}),r));pw.appendChild(el('div',{text:'Requisition notes:'}));pw.appendChild(l);}
  const dests=uniq(P.blood.concat(P.nonBlood).map(t=>destLabel(t.c)));pw.appendChild(el('div',{class:'small',text:'Destinations: '+dests.join(' · ')}));
  // order interactions + overlaps
  const inter=[];for(const {entry:e} of known){for(const o of e.orderNotes||[]){if(!o.ifAlsoOrdered.length||o.ifAlsoOrdered.some(i=>confirmedIds.has(i)))inter.push(short(e)+': '+o.text);}
    for(const k2 of known){if(k2.entry===e)continue;const ov=(e.includesDictIds||[]).filter(i=>(k2.entry.dictIds||[]).includes(i));if(ov.length)inter.push('Possible overlap: '+short(e)+' already includes '+short(k2.entry)+' - check the requisition for a duplicate order.');}
    for(const it of unknown){if((e.includesDictIds||[]).includes(it.id))inter.push('Possible overlap: '+short(e)+' already includes '+it.name+' - check the requisition for a duplicate order.');}}
  if(inter.length){const l=el('ul');for(const s of uniq(inter))l.appendChild(el('li',{text:s}));pw.appendChild(el('div',{class:'fact caveat'},'⚠ Order notes:',l));}
  host.appendChild(pw);

  // 7. labelling
  const lab=el('div',{class:'sum-card'},el('h3',{text:'Labelling'}));const L={};
  for(const {entry:e} of known)for(const x of e.labelling||[]){const k=x.replace(/\.$/,'').replace(/indentifier/,'identifier').toLowerCase();(L[k]=L[k]||{t:x.replace(/\.$/,''),w:new Set()}).w.add(short(e));}
  const ll=el('ul');const all=known.length;for(const k in L){const v=L[k];ll.appendChild(el('li',{text:v.t.replace(/^./,c=>c.toUpperCase())+(v.w.size<all?' ('+[...v.w].join(', ')+')':'')}));}
  lab.appendChild(ll);host.appendChild(lab);

  // 8. per-test cards (known) with source + amber cards (unknown)
  const tc=el('div',{class:'sum-card'},el('h3',{text:'Tests'}));
  for(const {entry:e,items:its} of known){const d=el('div',{class:'test-line'});
    d.appendChild(el('div',{class:'tname',text:e.name}));
    const asked=uniq(its.map(i=>i.name));if(asked.some(a=>a!==e.name))d.appendChild(el('div',{class:'small',text:'Confirmed as: '+asked.join('; ')}));
    const meta=[e.specimenType,e.discipline,e.frequency&&('Frequency '+e.frequency),e.turnaroundTime&&('TAT '+e.turnaroundTime)].filter(Boolean).join(' · ');d.appendChild(el('div',{class:'small',text:meta}));
    if((e.includes||[]).length)d.appendChild(el('div',{class:'small',text:'Includes: '+e.includes.join(', ')}));
    const det=el('details',{},el('summary',{text:'Handling steps (verbatim)'}));const hl=el('ul',{class:'verbatim'});for(const h of e.handling||[])hl.appendChild(el('li',{text:h}));det.appendChild(hl);
    if((e.preTestPrep||[]).length){det.appendChild(el('div',{class:'small',text:'Pre-test preparation:'}));const pl=el('ul',{class:'verbatim'});for(const h of e.preTestPrep)pl.appendChild(el('li',{text:h}));det.appendChild(pl);}
    d.appendChild(det);
    if((e.ambiguities||[]).length){const a=el('details',{class:'amb'},el('summary',{text:'⚠ Unclear in the directory entry ('+e.ambiguities.length+')'}));const al=el('ul');for(const x of e.ambiguities)al.appendChild(el('li',{text:x}));a.appendChild(al);d.appendChild(a);}
    d.appendChild(el('div',{class:'src'},srcLine(e)+' · ',el('a',{href:DIR_URL,target:'_blank',rel:'noopener noreferrer',text:'tests.lifelabs.com'})));
    tc.appendChild(d);}
  if(known.length)host.appendChild(tc);
  banner();
  return {known:known.length,unknown:unknown.length,blood:P.blood.length,other:P.nonBlood.length};}

root.CollectionSummary={render,resolve,plan,BYDICT};
})(typeof self!=='undefined'?self:this);
