/* Collection Summary (v3.4). Pure in-memory rendering. Nothing is stored or sent. Never guesses: tests without any data get an amber card.
   Data sources (each line on screen names its source):
   - js/tube_rules.js : LifeLabs Quick Reference Collection Chart Doc#49141 (Lower Mainland) - tube type/size/colour, mix inversions,
                         which tests share ONE tube ('combined') and which need their own tube ('separate' / 'perTest').
   - js/collection_data.js : LifeLabs Lab Test Information per-test entries (verbatim, Kimberley-verified) - handling, processing,
                         storage, destination, forms, patient prep.
   - js/local_rules.js : local practice rules (VCH community practice), each with its own source + date, shown separately.
   Tube assignment priority:
   (L) v3.4 local practice tube rules (local_rules.js kind 'tube', VCH community practice 2026-10-11) take priority over the chart and the
       per-test entries: HCV RNA (+ genotype) and HIV Viral Load each their own 6.0 mL EDTA; all communicable disease serology in ONE BCCDC SST
       (per-test centrifuge instructions kept; if they differ a single amber note is shown instead of splitting the tube).
       Constraint: communicable disease tests (HIV, hepatitis, syphilis) never share a tube with non-communicable tests.
   (a) chart rule: tests in the same chart group share one tube ('combined') or get their own ('separate'/'perTest');
       tests from different chart groups never share; chart tube sizes override per-test container sizes (conflicts are flagged).
       A combined chart group is still split if the per-test PDFs give different handling (centrifuged vs not, LifeLabs vs BCCDC):
       BCCDC unspun serology is never put in a centrifuged LifeLabs tube.
   (b) per-test PDF rule (explicit sharing statement, e.g. one full EDTA tube for HP + SR + A1c; noShare containers).
   (c) tests not on the chart and without a per-test sharing statement: their own tube, marked 'confirm with lab' if the lab
       might allow sharing. No volume-based sharing (v3.2's 'stated volumes <= half the tube' heuristic is removed): local practice
       is to always collect a full tube (local_rules.js full_tube_default); per-test volumes are shown only as 'lab minimum'. */
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
  if(c.destGroup==='PHL'&&RF.formOfName(c.form))return 'BCCDC Public Health Lab (the '+RF.formOfName(c.form).title+' named is the BCCDC PHL form '+RF.formOfName(c.form).number+')';
  if(c.destGroup==='PHL')return 'BCCDC Public Health Lab - inferred from the requisition form named (PDF does not name the lab; confirm)';
  return 'Not stated in the directory entry (LifeLabs directory)';}
function srcLine(e){return 'Source: LifeLabs Lab Test Information, published '+e.lastPublished+' · last checked '+e.lastChecked;}
function short(e){return e.name.replace(/\s*\(.*\)\s*$/,'');}

const TR=root.TubeRules||{groups:[],byId:{}};
const LR=root.LocalRules||{rules:[]};
const RF=root.RequisitionForms||{forms:[],byId:{},formOfName:()=>null};
function formDisplay(n){const f=RF.formOfName(n);return f?f.display+(n!==f.display?' (LifeLabs page: “'+n+'”)':''):n;}
/* which requisition form a unit goes on: named by its LifeLabs page / BCCDC tube without a named form / only listed on the form /
   listed on the form but the LifeLabs page shows LifeLabs testing */
const TUBE_RULES=()=>LR.rules.filter(r=>r.kind==='tube');
const COMM=LR.communicable||new Set();
function localTubeRule(u){return TUBE_RULES().find(r=>u.ids.some(i=>r.appliesTo.includes(i)))||null;}
const isComm=u=>u.ids.some(i=>COMM.has(i));
function formRoute(u){for(const id of u.ids){const r=RF.byId[id];if(!r)continue;const e=u.entry;
    if(u.localTube&&u.localTube.destination==='BCCDC')return Object.assign({how:(e&&(e.collect.some(c=>RF.formOfName(c.form)===r.form)||RF.formOfName(e.form)===r.form))?'named':'local'},r);
    if(e){if(e.collect.some(c=>RF.formOfName(c.form)===r.form)||RF.formOfName(e.form)===r.form)return Object.assign({how:'named'},r);
      if(e.collect.some(c=>c.destGroup==='PHL'))return Object.assign({how:'bccdc'},r);return Object.assign({how:'lifelabs'},r);}
    if(u.chart&&u.chart.group.lab==='LifeLabs')return Object.assign({how:'lifelabs'},r);
    return Object.assign({how:'listed'},r);}return null;}
function dictName(id){const D=root.ReqDict;const t=D&&D.BYID&&D.BYID[id];return t?t.name:id;}
const GCSS={'light blue':{rank:2,css:'lblue'},red:{rank:3,css:'red'},gold:{rank:3,css:'gold'},lavender:{rank:5,css:'lav'}};
function parseMix(e){for(const h of ((e&&e.handling)||[]).concat(...((e&&e.collect)||[]).map(c=>c.notes||[]))){
  const m=h.match(/invert(?:\/mix)?\s+tubes?\s+(\d+)\s*-\s*(\d+)\s*times/i);if(m)return m[1]+'-'+m[2];}return null;}
function chartSrc(){return 'Source: '+TR.source+' ('+TR.region+') · last checked '+TR.lastChecked;}
function ruleSrc(r){return r.source+', '+r.date;}

/* items: [{id, name, notes}] -> units: one per LifeLabs entry (per-test PDF) or per chart-only dictionary id */
function resolve(items){const units=[],unknown=[],by=new Map();
  for(const it of items){const id=it.id;const e=id&&BYDICT[id];const ch=id&&TR.byId[id];
    if(!e&&!ch&&!RF.byId[id]){unknown.push(it);continue;}
    const key=e?'E:'+e.id:'C:'+id;
    if(!by.has(key)){const u={key,entry:e||null,chart:ch||null,ids:[],items:[],name:e?short(e):dictName(id)};by.set(key,u);units.push(u);}
    const u=by.get(key);u.items.push(it);if(!u.ids.includes(id))u.ids.push(id);if(!u.chart&&ch)u.chart=ch;}
  for(const u of units){u.localTube=localTubeRule(u);u.route=formRoute(u);u.formOnly=!u.entry&&!u.chart&&!u.localTube;}
  return {units,known:units.filter(u=>u.entry),chartOnly:units.filter(u=>!u.entry),unknown};}

/* local practice rules: which apply, how they are answered, which units they take out of the tube plan */
function ruleStates(units,answers){const ids=new Set(units.flatMap(u=>u.ids));const out=[];
  for(const r of LR.rules.filter(r=>r.kind==='question')){if(!r.appliesTo.some(i=>ids.has(i)))continue;const a=answers[r.id]||null;const ans=a&&r.answers.find(x=>x.v===a);
    const resolved=ans?(ans.as||ans.v):'unanswered';out.push({rule:r,answer:a,resolved,effect:r.effects[resolved]||{}});}
  for(const u of units){u.excludedBy=null;u.localNotes=[];
    for(const st of out)if(u.ids.every(i=>st.rule.appliesTo.includes(i))){if(st.effect.excludeFromTubes)u.excludedBy=st;else u.localNotes.push(st);}}
  return out;}

function plan(units){
  const tubes=[],others=[],conflicts=[];
  const mk=o=>{const t=Object.assign({members:[],caveats:[],infos:[],kind:'blood'},o);tubes.push(t);return t;};
  // local constraint: communicable disease tests never share a tube with non-communicable tests
  const commOk=(t,u)=>t.members.every(m=>isComm(m.unit)===isComm(u));
  const compatible=(t,c,u)=>{if(u&&!commOk(t,u))return false;const h=t.members.map(m=>m.c).filter(Boolean);if(!c||!h.length)return true;
    return h.every(x=>x.centrifuge===c.centrifuge&&(x.destGroup||'')===(c.destGroup||''));};
  const live=units.filter(u=>!u.excludedBy);
  // (L) local practice tube rules (priority over the chart and per-test entries)
  for(const u of live.filter(u=>u.localTube)){const r=u.localTube;
    if(u.entry)for(const c of u.entry.collect)if(c.kind!=='blood')others.push({c,members:[{unit:u,c}],kind:c.kind,caveats:[],infos:[]});
    const slots=u.entry?u.entry.collect.filter(c=>c.kind==='blood'):[];
    const set=r.shareSets==='all'?'all':((r.shareSets||[]).find(s=>u.ids.some(i=>s.includes(i)))||null);
    let t=set?tubes.find(t=>t.local===r&&t.shareSet===set&&commOk(t,u)):null;
    if(!t)t=mk({local:r,shareSet:set,source:'local'});
    t.members.push({unit:u,c:slots.find(c=>c.destGroup==='PHL')||slots[0]||null,slots});}
  // (a) chart groups
  for(const u of live.filter(u=>u.chart&&!u.localTube)){const g=u.chart.group;
    const slots=u.entry?u.entry.collect.filter(c=>c.kind==='blood'):[];
    if(u.entry)for(const c of u.entry.collect)if(c.kind!=='blood')others.push({c,members:[{unit:u,c}],kind:c.kind,caveats:[],infos:[]});
    const list=slots.length?slots.flatMap(c=>Array(c.count||1).fill(c)):[null];
    if(g.mode==='perTest'){const n=Math.max(list.length,g.tubesPerTest||1);
      if(slots.length&&list.length!==(g.tubesPerTest||1))conflicts.push(u.name+': per-test PDF gives '+list.length+' tube(s), chart pictures '+g.tubesPerTest+' - the larger number is shown.');
      for(let i=0;i<n;i++)mk({group:g,source:'chart',members:[{unit:u,c:list[i]||null}]});}
    else if(g.mode==='separate'){for(const c of list)mk({group:g,source:'chart',members:[{unit:u,c}]});}
    else for(const c of list){let t=tubes.find(t=>t.group===g&&!t.members.some(m=>m.unit===u)&&compatible(t,c,u));
      if(!t){const sib=tubes.filter(t=>t.group===g);t=mk({group:g,source:'chart'});
        if(sib.length){for(const x of sib.concat(t))x.split=true;
          conflicts.push('Chart shows one '+g.tube.label+' for '+uniq(sib.flatMap(x=>x.members.map(m=>m.unit.name)).concat(u.name)).join(', ')+', but the per-test PDFs give different handling (centrifuged vs not / destination) - kept in separate tubes.');}}
      t.members.push({unit:u,c});}}
  // (a2) tests not on the chart that go on a requisition form with a combined-tube instruction (BCCDC PHL Serology Screening
  // Requisition: "Combinations of Syphilis, HIV, Hepatitis Serology and Other Serology -Please provide 1 serum separator tube.")
  const phlish=m=>m.unit.route&&m.unit.route.how!=='lifelabs';
  for(const u of live.filter(u=>!u.chart&&!u.localTube&&u.route&&(u.route.how==='named'||u.route.how==='listed'))){const sp=u.route.spec;
    if(u.entry)for(const c of u.entry.collect)if(c.kind!=='blood')others.push({c,members:[{unit:u,c}],kind:c.kind,caveats:[],infos:[]});
    const slots=u.entry?u.entry.collect.filter(c=>c.kind==='blood'):[null];
    for(const c of slots){let t=tubes.find(t=>!t.local&&!t.members.some(m=>m.unit===u)&&compatible(t,c,u)&&(t.formSpec===sp||
        (t.group&&t.group.mode!=='perTest'&&t.group.lab!=='LifeLabs'&&t.members.some(m=>phlish(m)&&m.unit.route.spec===sp))));
      if(!t)t=mk({formSpec:sp,form:u.route.form,source:'form'});else{t.formSpec=sp;t.form=u.route.form;}
      t.members.push({unit:u,c});}
    u.formTubed=true;}
  // (b)+(c) tests not on the chart
  for(const u of live.filter(u=>!u.chart&&!u.localTube&&u.entry&&!u.formTubed)){const e=u.entry;
    for(const c of e.collect)for(let n=0;n<(c.count||1);n++){
      if(c.kind!=='blood'){others.push({c,members:[{unit:u,c}],kind:c.kind,caveats:[],infos:[]});continue;}
      if(c.shareGroup){let g=tubes.find(t=>t.key==='SG:'+c.shareGroup&&!t.members.some(m=>m.unit===u)&&commOk(t,u));
        if(!g)g=mk({key:'SG:'+c.shareGroup,source:'pdf',explicit:true});g.members.push({unit:u,c});continue;}
      if(c.noShare){mk({source:'pdf',members:[{unit:u,c}]});continue;}
      // no chart rule and no sharing statement in the per-test PDF: own tube. If another unchartered test has an identical
      // container/handling/destination the lab might allow sharing - say so, but do not combine.
      const key=[c.container,c.centrifuge,c.clotMinutes,c.rcf,c.spinMinutes,c.temp,c.destGroup||''].join('|');
      mk({key,source:'pdf',members:[{unit:u,c}],own:true});}}
  // per-tube facts, conflicts, caveats
  for(const t of tubes.filter(t=>t.local)){const r=t.local;t.label=r.tube.label;t.css=r.tube.css;t.rank=r.tube.rank;t.mix=r.mix;t.amber=[];
    // per-test centrifuge instructions from the LifeLabs pages (all blood slots of each member)
    const spin={},none=[];for(const m of t.members){const v=uniq((m.slots||[]).map(c=>c.centrifuge===true?'spin':c.centrifuge===false?'nospin':null));
      if(!v.length)none.push(m.unit.name);for(const x of v)(spin[x]=spin[x]||[]).push(m.unit.name);}
    const kinds=Object.keys(spin);const cf=kinds.length===1&&!none.length?kinds[0]==='spin':null;
    if(kinds.length===1&&none.length)t.partialSpin={kind:kinds[0],has:spin[kinds[0]],none};
    t.c={container:t.label,centrifuge:cf,destGroup:r.destination==='BCCDC'?'PHL':'',destination:r.destination==='BCCDC'?'BCCDC Public Health Laboratory (PHL)':(r.destination||'')};
    if(kinds.length>1){t.spinMixed=spin;t.amber.push(r.centrifugeConflict||'LifeLabs pages differ on centrifuging - confirm with lab');}
    t.spinInfo=kinds.length?kinds.map(k=>(k==='spin'?'centrifuge':'do NOT centrifuge')+' - '+spin[k].join(', ')).join('; ')+(none.length?'; no LifeLabs handling entry - '+none.join(', '):''):null;
    if(r.shareText&&t.members.some(m=>m.unit.ids.includes('hcv_genotype')))t.infos.push(r.shareText);
    const cg=g=>g.mode==='perTest'?g.tubesPerTest+' tubes per profile':g.mode==='separate'?'own tube per test':'tube shared with '+g.tests.join(' / ');
    const same=t.members.filter(m=>m.unit.chart&&m.unit.chart.group.mode==='separate'&&t.members.length===1);
    if(same.length)t.infos.push('Same as the LifeLabs chart reading (own '+same[0].unit.chart.group.tube.label+' per test); local practice confirms it.');
    const over=uniq(t.members.filter(m=>m.unit.chart&&!same.includes(m)).map(m=>m.unit.name+' (chart: '+cg(m.unit.chart.group)+')'));
    if(over.length)t.infos.push('Overrides the LifeLabs chart grouping for: '+over.join('; ')+'.');
    const multi=t.members.filter(m=>(m.slots||[]).length>1).map(m=>m.unit.name+' ('+m.slots.length+' tubes on its LifeLabs page)');
    if(multi.length)t.infos.push('One tube per local practice instead of: '+multi.join(', ')+'.');
    t.chartOnly=t.members.filter(m=>!m.c).map(m=>m.unit.name);t.typeKey=t.css+'|'+r.tube.sizeMl;}
  for(const t of tubes.filter(t=>!t.local)){const g=t.group;const rep=(t.members.find(m=>m.c)||{}).c;
    t.label=g?g.tube.label:rep?(rep.altContainer?rep.container+' or '+rep.altContainer:rep.container):'SST gold top (serum separator tube; size not stated on the form)';
    if(!g&&!rep&&t.formSpec&&t.formSpec.css==='lav')t.label='EDTA lavender top (size not stated on the form)';
    t.c=rep||{container:t.label,centrifuge:null};
    const col=g?GCSS[g.tube.colour]||{rank:9,css:''}:rep?tubeColour(rep.container):(t.formSpec&&t.formSpec.css==='lav'?{rank:5,css:'lav'}:{rank:3,css:'gold'});t.css=col.css;t.rank=col.rank;
    t.mix=g?g.mix:(t.members.map(m=>parseMix(m.unit.entry)).find(Boolean)||null);
    for(const m of t.members)if(m.c&&m.c.destinationInferred&&!RF.formOfName(m.c.form||m.unit.entry.form))t.caveats.push(m.unit.name+': destination inferred from the requisition form named - confirm.');
    if(t.formSpec){const byForm=t.members.filter(m=>m.unit.formTubed).map(m=>m.unit.name);
      if(byForm.length&&t.members.length>1)t.infos.push(byForm.join(', ')+' added to this tube per the '+t.form.display+': “'+t.formSpec.combine+'”');
      for(const m of t.members)if(m.unit.formOnly)t.caveats.push(m.unit.name+': tube from the requisition form only (not on the LifeLabs chart; no LifeLabs entry yet).');}
    if(g){for(const m of t.members){const nm=m.unit.name;if(!m.unit.chart||m.unit.chart.group!==g)continue;
        if(m.unit.chart.partial)t.caveats.push(nm+': '+m.unit.chart.partial);if(m.unit.chart.coverageNote)t.infos.push(m.unit.chart.coverageNote+'.');
        if(!m.c)continue;
        const pm=nominalMl(m.c.container),pc=tubeColour(m.c.container).css;
        if(pc&&pc!==t.css){const s=nm+': per-test PDF container "'+m.c.container+'" differs from the chart ('+g.tube.label+') - chart used.';t.caveats.push('Chart vs per-test PDF: '+s);conflicts.push(s);}
        else if(pm!=null&&Math.abs(pm-g.tube.sizeMl)>1e-6){const s=nm+': per-test PDF says "'+m.c.container+'", chart says '+g.tube.label+' - chart size used.';t.caveats.push('Chart vs per-test PDF: '+s);conflicts.push(s);}
        else if(pm==null)t.infos.push(nm+': tube size not stated in the per-test PDF ("'+m.c.container+'"); '+g.tube.sizeMl.toFixed(1)+' mL from the chart.');
        const px=parseMix(m.unit.entry);if(px&&px!==g.mix){const s=nm+': per-test PDF says mix '+px+' times, chart says '+g.mix+' times.';t.caveats.push('Chart vs per-test PDF: '+s);conflicts.push(s);}
        if(m.c.noShare&&!m.c.shareGroup&&t.members.length>1)t.infos.push(nm+': per-test PDF describes its own tube ("'+(m.c.notes||[])[0]+'"); the chart shares this tube with '+t.members.filter(x=>x!==m).map(x=>x.unit.name).join(', ')+'.');}
      if(g.confirm&&(!g.confirmWhenAlso||tubes.some(x=>x.group&&x.group.id===g.confirmWhenAlso))&&(!g.confirmWhenMulti||uniq(tubes.filter(x=>x.group===g).flatMap(x=>x.members.map(m=>m.unit.key))).length>1))t.caveats.push('Chart interpretation: '+g.confirm);
      if(t.split)t.caveats.push('Chart shows one tube for these tests but the per-test handling differs (centrifuged vs not / destination), so they are kept apart.');}
    t.chartOnly=t.members.filter(m=>!m.c).map(m=>m.unit.name);t.typeKey=t.css+'|'+(g?g.tube.sizeMl:(nominalMl(t.label)||(t.css==='gold'?5:null)));}
  for(const t of tubes)if(t.own){const same=tubes.filter(x=>x!==t&&x.typeKey===t.typeKey&&x.c.centrifuge===t.c.centrifuge&&(x.c.destGroup||'')===(t.c.destGroup||''));
    t.caveats.push('Not on the LifeLabs Quick Reference Chart: drawn as its own tube'+(same.length?' (same tube type and handling as the tube for '+uniq(same.flatMap(x=>x.members.map(m=>m.unit.name))).join(', ')+' - the lab may allow combining)':'')+'.');}
  if(live.some(u=>u.chart&&!u.localTube&&u.chart.group.mode==='perTest'&&u.route))conflicts.push('Hepatitis Acute / Chronic profiles: the '+(RF.forms[0]||{}).display+' says “'+((RF.forms[0]||{specimens:{serum:{}}}).specimens.serum.combine)+'”, but the LifeLabs chart and LifeLabs pages say two SST tubes per profile (one centrifuged for LifeLabs, one unspun for BCCDC) - LifeLabs used for LifeLabs collection.');
  for(const t of tubes){const k=uniq(t.members.map(m=>isComm(m.unit)?'c':'n'));if(k.length>1)throw new Error('communicable/non-communicable tests in one tube');}
  const spinRank=t=>t.c.centrifuge===true?0:t.c.centrifuge===false?1:2;
  const gi=t=>t.group?TR.groups.indexOf(t.group):99;
  const blood=tubes.sort((a,b)=>a.rank-b.rank||spinRank(a)-spinRank(b)||gi(a)-gi(b));
  const cnt={};for(const t of blood){cnt[t.typeKey]=(cnt[t.typeKey]||0)+1;t.no=cnt[t.typeKey];}for(const t of blood)t.ofType=cnt[t.typeKey];
  for(const o of others){o.label=o.c.altContainer?o.c.container+' or '+o.c.altContainer:o.c.container;o.css=tubeColour(o.c.container).css;o.ofType=1;o.no=1;o.chartOnly=[];}
  return {blood,nonBlood:others,conflicts:uniq(conflicts)};}

function memberLabel(m){const e=m.unit.entry;return m.unit.name+(!m.slots&&m.c&&m.c.tests&&e&&e.collect.length>1?' ('+m.c.tests+')':'');}
function spinText(c){if(c.centrifuge===true)return (c.clotMinutes?'Clot upright ≥ '+c.clotMinutes+' min, then ':'')+'centrifuge '+(c.spinMinutes?c.spinMinutes+' min':'')+(c.rcf?' at '+c.rcf+' RCF':'');
  if(c.centrifuge===false)return 'Do NOT centrifuge';return '';}
const STANDING=()=>LR.rules.filter(r=>r.kind==='standing');
function localTag(r){return el('span',{class:'local-tag'},'Local practice · '+r.source+', ',el('span',{class:'nw',text:r.date}));}

function render(host,items,opts){
  opts=opts||{};opts.answers=opts.answers||{};
  const y=typeof window!=='undefined'?window.scrollY:0;
  host.innerHTML='';const {units,known,chartOnly,unknown}=resolve(items);const RS=ruleStates(units,opts.answers);const P=plan(units);
  const live=units.filter(u=>!u.excludedBy);
  const confirmedIds=new Set(items.map(i=>i.id).filter(Boolean));
  const rerender=()=>{render(host,items,opts);if(typeof window!=='undefined')window.scrollTo(0,y);};
  host.appendChild(el('div',{class:'sum-head'},el('h2',{text:'Collection summary'}),
    el('div',{class:'small',text:items.length+' confirmed test'+(items.length===1?'':'s')+' · '+known.length+' with full LifeLabs entry · '+chartOnly.length+' tube from chart/form/local rule only · '+unknown.length+' without info'})));

  // 0. local practice questions (e.g. PTT on heparin) - before anything else
  for(const st of RS){const r=st.rule;
    const q=el('div',{class:'sum-card local'},el('h3',{text:'Question before collecting'}),el('div',{class:'q',text:r.question+' ('+r.appliesTo.map(dictName).join(', ')+')'}));
    const seg=el('div',{class:'seg',role:'group'});
    for(const a of r.answers){const b=el('button',{type:'button',class:'segbtn'+(st.answer===a.v?' on':''),'aria-pressed':String(st.answer===a.v),'data-rule':r.id,'data-v':a.v,text:a.label});
      b.addEventListener('click',()=>{opts.answers[r.id]=a.v;rerender();});seg.appendChild(b);}
    q.appendChild(seg);
    const ef=st.effect;
    if(ef.severity==='red')q.appendChild(el('div',{class:'redstop'},(ef.title?el('div',{class:'redstop-h',text:'⛔ '+ef.title}):null),el('div',{text:(ef.title?'':'⛔ ')+ef.text})));
    else if(ef.text)q.appendChild(el('div',{class:'fact '+(ef.severity==='ask'?'caveat':'okline'),text:ef.text}));
    if(r.answers.some(a=>a.as))q.appendChild(el('div',{class:'small',text:r.answers.filter(a=>a.as).map(a=>a.label+' is treated as '+r.answers.find(x=>x.v===a.as).label).join('; ')+'.'}));
    q.appendChild(el('div',{class:'src'},localTag(r),' - not LifeLabs data'));
    host.appendChild(q);}

  // 1. time-critical / do-not-centrifuge banners
  const hidden=(u,s)=>(u.localNotes||[]).some(st=>st.effect.hideStability&&new RegExp(st.effect.hideStability,'i').test(s.text+' '+(s.when||'')));
  const crit=[];for(const u of live.filter(u=>u.entry))for(const s of u.entry.stability||[])if(s.critical&&!hidden(u,s))crit.push({u,s});
  if(crit.length){const b=el('div',{class:'sum-card crit'},el('h3',{text:'⏱ Time-critical / fill requirements'}));const ul=el('ul');
    for(const {u,s} of crit)ul.appendChild(el('li',{},el('b',{text:u.name+': '}),s.text+(s.when?' (when '+s.when+')':'')));b.appendChild(ul);host.appendChild(b);}
  const nospin=P.blood.filter(t=>t.c.centrifuge===false);
  const nsMixed=P.blood.filter(t=>t.c.centrifuge!==false&&((t.spinMixed&&t.spinMixed.nospin)||(t.partialSpin&&t.partialSpin.kind==='nospin')));
  if(nospin.length||nsMixed.length){const nb_=el('div',{class:'sum-card nospin'},el('h3',{text:'⛔ Do NOT centrifuge'}));
    if(nospin.length)nb_.appendChild(el('div',{text:nospin.map(t=>t.label+(t.ofType>1?' #'+t.no:'')+' ('+t.members.map(memberLabel).join(', ')+')').join('; ')}));
    for(const t of nsMixed)nb_.appendChild(el('div',{text:t.label+(t.ofType>1?' #'+t.no:'')+' (BCCDC serology): LifeLabs pages say do NOT centrifuge for '+((t.spinMixed||{}).nospin||t.partialSpin.has).join(', ')+' - other tests in this tube differ or have no entry; see the amber note on the tube.'}));
    host.appendChild(nb_);}

  // amber cards first so they are never missed
  for(const it of unknown){host.appendChild(el('div',{class:'sum-card amber'},el('div',{class:'tname',text:'⚠ '+it.name+(it.id?'':' (unmatched)')}),
    el('div',{},el('b',{text:'No collection info yet'}),' - not on the LifeLabs Quick Reference Chart and no Lab Test Information entry. Check ',el('a',{href:DIR_URL,target:'_blank',rel:'noopener noreferrer',text:'tests.lifelabs.com'})),
    el('div',{class:'small',text:'Not included in the tube counts below.'})));}
  const banner=()=>host.appendChild(el('div',{class:'proto-banner',text:'Prototype - verify against current LifeLabs/BCCDC guidance before collecting.'}));
  if(!units.length){banner();return {known:0,chartOnly:0,unknown:unknown.length,blood:0,other:0,conflicts:[]};}

  // 2. what to collect
  const wc=el('div',{class:'sum-card'},el('h3',{text:'What to collect'}));
  const nb=P.blood.length,nn=P.nonBlood.length;const excl=units.filter(u=>u.excludedBy);
  wc.appendChild(el('div',{class:'small',text:(nb?nb+' blood tube'+(nb>1?'s':''):'No blood tubes')+(nn?' · '+nn+' other container'+(nn>1?'s':''):'')+
    (excl.length?' · not included: '+excl.map(u=>u.name).join(', ')+' (see question above)':'')+(unknown.length?' · plus anything needed for the '+unknown.length+' test(s) without info (amber, above)':'')}));
  const full=STANDING().filter(r=>r.scope==='bloodTube');
  for(const t of P.blood.concat(P.nonBlood)){const c=t.c;const g=t.group;
    const title=t.label+(t.ofType>1?' #'+t.no:'')+(c.centrifuge===true?' - centrifuge':c.centrifuge===false?' - do NOT centrifuge':'')+(c.destGroup==='PHL'?' - to BCCDC':'');
    const box=el('div',{class:'tube '+t.css+(c.centrifuge===false?' nospin':'')},el('div',{class:'tube-title'},el('span',{class:'swatch '+t.css}),title));
    const chips=el('div',{class:'chips'});
    if(t.kind==='blood')for(const r of full)chips.appendChild(el('span',{class:'chip full',title:r.detail+' ('+ruleSrc(r)+')',text:'■ '+r.text}));
    if(t.mix)chips.appendChild(el('span',{class:'chip mix',text:'↻ Mix '+t.mix+' times'}));
    if(chips.children.length)box.appendChild(chips);
    box.appendChild(el('div',{class:'tube-tests',text:'For: '+t.members.map(memberLabel).join(', ')}));
    if(t.local){box.appendChild(el('div',{class:'fact okline'},'✔ '+t.local.text+' ',localTag(t.local)));
      for(const x of t.amber||[])box.appendChild(el('div',{class:'fact caveat amberline',text:'⚠ '+x}));
      if(t.partialSpin)box.appendChild(el('div',{class:'fact caveat',text:'⚠ Centrifuging: LifeLabs page'+(t.partialSpin.has.length>1?'s':'')+' for '+t.partialSpin.has.join(', ')+' say'+(t.partialSpin.has.length>1?'':'s')+' '+(t.partialSpin.kind==='spin'?'centrifuge':'do NOT centrifuge')+'; no LifeLabs handling entry for '+t.partialSpin.none.join(', ')+' - confirm with BCCDC/LifeLabs.'}));
      else if(t.spinInfo&&t.spinMixed)box.appendChild(el('div',{class:'fact small',text:'Per-test LifeLabs pages: '+t.spinInfo+'.'}));}
    if(g&&g.notes)for(const n of g.notes){if(n.kind==='butterfly')box.appendChild(el('div',{class:'fact butterfly',text:'🦋 '+n.text+' (LifeLabs chart)'}));}
    const facts=[];const sp=spinText(c);if(sp)facts.push(sp);if(c.temp)facts.push(c.temp);
    if((t.local&&t.local.destination==='BCCDC')||(!t.local&&t.kind==='blood'&&t.members.length&&t.members.every(m=>isComm(m.unit))&&!t.members.some(m=>m.c&&m.c.destination)))facts.push('Destination: BCCDC Public Health Laboratory (local practice: communicable disease tests go to BCCDC)');
    else if(t.kind==='blood'||c.destination){const known_=t.members.filter(m=>m.c);if(known_.length)facts.push('Destination: '+destLabel(c));}
    const onForm=m=>{const r=m.unit.route;if(!r||r.how==='lifelabs')return false;if(r.how==='bccdc')return !!(m.c&&m.c.destGroup==='PHL');if(r.how==='named')return !m.c||RF.formOfName(m.c.form||m.unit.entry.form)===r.form||m.c.destGroup==='PHL';return true;};
    const lform=t.local&&t.local.form?RF.forms.find(f=>f.id===t.local.form):null;
    const forms=lform?[lform.display]:uniq(t.members.map(m=>onForm(m)?m.unit.route.form.display:m.c&&(m.c.form||m.unit.entry.form)?formDisplay(m.c.form||m.unit.entry.form):null));
    if(forms.length)facts.push('Requisition: '+forms.join(' / '));
    const bags=uniq(t.members.filter(m=>m.c).map(m=>m.c.bag));if(bags.length)facts.push('Bag: '+bags.join(' / '));
    for(const f of facts)box.appendChild(el('div',{class:'fact'+(/NOT centrifuge/.test(f)?' warn':'')},f));
    for(const n of uniq(t.members.flatMap(m=>(m.c&&m.c.notes)||[])))if(!/invert|draw 1 completely full tube/i.test(n)&&!((t.spinMixed||t.partialSpin)&&/centrifuge/i.test(n)))box.appendChild(el('div',{class:'fact note-l',text:'“'+n+'”'}));
    for(const m of t.members){if(!m.c)continue;
      const ln=(m.unit.localNotes||[]);
      if(m.c.branchNote&&!ln.length)box.appendChild(el('div',{class:'fact caveat',text:'⚠ '+m.c.branchNote}));
      for(const st of ln)box.appendChild(el('div',{class:'fact okline'},'✔ '+m.unit.name+' - '+st.effect.text+' ',localTag(st.rule)));
      if(m.c.clotNote)box.appendChild(el('div',{class:'fact caveat',text:'⚠ '+m.c.clotNote}));}
    if(g&&g.notes&&excl.some(u=>g.map[u.ids[0]]))box.appendChild(el('div',{class:'fact warn',text:'PTT is NOT in this tube - see the question above.'}));
    if(t.chartOnly.length)box.appendChild(el('div',{class:'fact caveat',text:'Processing / storage'+(t.local?'':' / destination')+' for '+t.chartOnly.join(', ')+': not yet available - check Lab Test Information.'}));
    for(const x of uniq(t.caveats))box.appendChild(el('div',{class:'fact caveat',text:'⚠ Confirm with lab - '+x}));
    for(const x of uniq(t.infos))box.appendChild(el('div',{class:'fact small',text:'ℹ '+x}));
    if(t.local){const fs=lform&&t.local.formSpec?lform.specimens[t.local.formSpec]:null;
      box.appendChild(el('div',{class:'fact src',text:'Tube: Local practice ('+ruleSrc(t.local)+'), priority over the '+TR.shortSource+(fs?' - following the '+lform.display+': “'+fs.combine+'”':'')}));}
    else if(t.formSpec&&!g)box.appendChild(el('div',{class:'fact src',text:'Tube: '+t.form.source+' - “'+t.formSpec.combine+'”'}));
    else if(g)box.appendChild(el('div',{class:'fact src',text:'Tube: '+TR.shortSource+' - “'+g.heading+'”'+(g.mode==='combined'&&t.members.length>1?' (one shared tube)':g.mode==='separate'?' (own tube for each test)':g.mode==='perTest'?' ('+g.tubesPerTest+' tubes per test)':'')}));
    else if(t.explicit&&t.members.length>1)box.appendChild(el('div',{class:'fact src',text:'Shared as stated in the LifeLabs directory: “'+t.members[t.members.length-1].c.shareNote+'”'}));
    else if(t.kind==='blood')box.appendChild(el('div',{class:'fact src',text:'Tube: LifeLabs Lab Test Information (test not on the Quick Reference Chart)'}));
    wc.appendChild(box);}
  if(full.length&&P.blood.length)wc.appendChild(el('div',{class:'src'},'■ '+full.map(r=>r.detail).join(' ')+' ',...full.map(localTag)));
  host.appendChild(wc);

  // 2b. chart vs per-test differences
  if(P.conflicts.length){const cc=el('div',{class:'sum-card amber'},el('div',{class:'tname',text:'⚠ LifeLabs chart vs per-test entry differ - chart used'}));
    const l=el('ul');for(const x of P.conflicts)l.appendChild(el('li',{text:x}));cc.appendChild(l);cc.appendChild(el('div',{class:'small',text:'Confirm with lab.'}));host.appendChild(cc);}

  // 3. order of draw (general guidance only)
  if(P.blood.length){const od=el('div',{class:'sum-card'},el('h3',{text:'Blood tube order'}));
    const ol=el('ol');for(const t of P.blood)ol.appendChild(el('li',{text:t.label+(t.ofType>1?' #'+t.no:'')+' - '+t.members.map(memberLabel).join(', ')}));od.appendChild(ol);
    const cit=P.blood.some(t=>t.css==='lblue');
    if(cit)od.appendChild(el('div',{class:'fact butterfly',text:'🦋 Citrate tube: when using a butterfly needle, collect a discard tube first (LifeLabs Quick Reference Chart).'}));
    od.appendChild(el('div',{class:'small',text:'Listed in the general CLSI GP41 order of draw (blood culture → light blue citrate → serum/SST → heparin → EDTA → fluoride). General guidance, not from LifeLabs; follow local policy.'}));
    host.appendChild(od);}

  // 4. patient prep
  const prep=[];for(const u of live.filter(u=>u.entry))for(const p of u.entry.patientPrep||[])prep.push([u.name,p]);
  for(const it of items)for(const n of it.notes||[])if(/patient|instruction/i.test(n.type))prep.push([it.name+' (requisition)',n.text]);
  const pc=el('div',{class:'sum-card'},el('h3',{text:'Patient preparation'}));
  if(prep.length){const ul=el('ul');for(const [w,p] of prep)ul.appendChild(el('li',{},el('b',{text:w+': '}),p));pc.appendChild(ul);}
  else pc.appendChild(el('div',{class:'small',text:'No patient preparation stated in the LifeLabs entries for these tests.'}));
  if(chartOnly.length)pc.appendChild(el('div',{class:'fact caveat',text:'Not yet available for '+chartOnly.map(u=>u.name).join(', ')+' (no LifeLabs entry yet) - check Lab Test Information.'}));
  const docs=known.filter(u=>(u.entry.patientInstructionDocs||[]).length).map(u=>u.name);
  if(docs.length)pc.appendChild(el('div',{class:'small',text:'Printable patient instruction sheets (several languages) are listed in LifeLabs Lab Test Information for: '+docs.join(', ')+'.'}));
  host.appendChild(pc);

  // 5. processing + storage/transport
  const pr=el('div',{class:'sum-card'},el('h3',{text:'Processing, storage & transport'}));const ul=el('ul');
  for(const t of P.blood.concat(P.nonBlood)){const sp=spinText(t.c)||(t.spinMixed||t.partialSpin?'centrifuging: confirm with BCCDC/LifeLabs (see tube)':'');
    const temps=t.local?uniq(t.members.flatMap(m=>(m.slots||[]).map(c=>c.temp))):[];const txt=[sp,t.local?temps.join(' / '):t.c.temp].filter(Boolean).join(' · ');
    ul.appendChild(el('li',{class:t.c.centrifuge===false?'warn':''},el('b',{text:t.label+(t.ofType>1?' #'+t.no:'')+': '}),
      txt||((t.chartOnly||[]).length===t.members.length?'not yet available - check Lab Test Information':'see handling notes')));}
  pr.appendChild(ul);
  for(const u of live.filter(u=>u.entry))for(const s of u.entry.stability||[])if(!s.critical&&!hidden(u,s))pr.appendChild(el('div',{class:'fact',text:u.name+(s.text===u.entry.specimenStability?' - specimen stability: ':': ')+s.text}));
  host.appendChild(pr);

  // 6. paperwork & destination
  const pw=el('div',{class:'sum-card'},el('h3',{text:'Requisitions & destination'}));
  // requisition forms (e.g. BCCDC PHL Serology Screening Requisition) - from the form itself, plus names used on LifeLabs pages
  const HOW={local:'to BCCDC (local practice: communicable disease tests go to BCCDC)',named:'named on its LifeLabs page',bccdc:'BCCDC tube; LifeLabs page names no form - test is listed on this form, confirm',listed:'listed on this form (LifeLabs pages do not say which requisition) - confirm'};
  const byForm=new Map();
  for(const u of units){if(u.excludedBy&&u.excludedBy.effect.severity==='red')continue;const r=u.route;if(!r||r.how==='lifelabs')continue;
    if(!byForm.has(r.form))byForm.set(r.form,[]);byForm.get(r.form).push([u,r]);}
  for(const [f,list] of byForm){const box=el('div',{class:'reqform'},el('div',{class:'reqform-h',text:'Requisition: '+f.display}));
    const l=el('ul');for(const [u,r] of list)l.appendChild(el('li',{},el('b',{text:u.name}),' - on form: “'+r.test.onForm+'” ('+r.test.section+') · '+HOW[r.how]));box.appendChild(l);
    const al=uniq(list.flatMap(([u])=>u.entry?u.entry.collect.map(c=>c.form).concat(u.entry.form):[]).filter(n=>n&&RF.formOfName(n)===f));
    if(al.length)box.appendChild(el('div',{class:'small',text:'Named on LifeLabs pages as: '+al.map(x=>'“'+x+'”').join(', ')+' - same form (same title; PHL is a PHSA laboratory).'}));
    box.appendChild(el('div',{class:'src',text:'Source: '+f.source+' · checked '+f.lastChecked}));pw.appendChild(box);}
  const llOnForm=units.filter(u=>u.route&&u.route.how==='lifelabs').map(u=>u.name);
  if(llOnForm.length)pw.appendChild(el('div',{class:'small',text:'Also listed on the '+RF.forms[0].display+', but LifeLabs Lab Test Information / chart shows LifeLabs testing (centrifuged LifeLabs tube): '+llOnForm.join(', ')+'. Use the requisition the test was actually ordered on.'}));
  const forms={};for(const t of P.blood.concat(P.nonBlood))for(const m of t.members){if(!m.c)continue;const f=m.c.form||m.unit.entry.form;if(f&&!RF.formOfName(f))(forms[f]=forms[f]||new Set()).add(m.unit.name);}
  const fl=el('ul');for(const f in forms)fl.appendChild(el('li',{},el('b',{text:f+': '}),[...forms[f]].join(', ')));
  if(Object.keys(forms).length){pw.appendChild(el('div',{text:'Other requisition forms named in the directory:'}));pw.appendChild(fl);}
  else if(!byForm.size)pw.appendChild(el('div',{class:'small',text:'No extra requisition forms named for these tests.'}));
  const unnamed=known.filter(u=>!u.route&&u.entry.collect.some(c=>c.destination==='BCCDC'&&!c.form&&!u.entry.form)).map(u=>u.name);
  if(unnamed.length)pw.appendChild(el('div',{class:'fact caveat',text:'⚠ '+unnamed.join(', ')+': BCCDC tube but no form named in the directory - confirm which requisition goes with it.'}));
  const noForm=chartOnly.filter(u=>!u.localTube&&(!u.route||u.route.how==='lifelabs')).map(u=>u.name);
  const noFormLocal=chartOnly.filter(u=>u.localTube&&!u.route&&!u.excludedBy).map(u=>u.name);
  if(noFormLocal.length)pw.appendChild(el('div',{class:'fact caveat',text:'Requisition form not yet available for '+noFormLocal.join(', ')+' (destination BCCDC per local practice; no LifeLabs entry yet) - confirm which requisition goes with it.'}));
  if(noForm.length)pw.appendChild(el('div',{class:'fact caveat',text:'Forms / destination not yet available for '+noForm.join(', ')+' (no LifeLabs entry yet).'}));
  const rn=[];for(const u of known)for(const r of u.entry.requisitionNotes||[])rn.push([u.name,r]);
  if(rn.length){const l=el('ul');for(const [w,r] of rn)l.appendChild(el('li',{},el('b',{text:w+': '}),r));pw.appendChild(el('div',{text:'Requisition notes:'}));pw.appendChild(l);}
  const dests=uniq(P.blood.concat(P.nonBlood).filter(t=>t.members.some(m=>m.c)).map(t=>destLabel(t.c)));if(dests.length)pw.appendChild(el('div',{class:'small',text:'Destinations: '+dests.join(' · ')}));
  const inter=[];for(const u of known){const e=u.entry;for(const o of e.orderNotes||[]){if(!o.ifAlsoOrdered.length||o.ifAlsoOrdered.some(i=>confirmedIds.has(i)))inter.push(u.name+': '+o.text);}
    for(const u2 of units){if(u2===u)continue;const ov=(e.includesDictIds||[]).filter(i=>u2.ids.includes(i));if(ov.length)inter.push('Possible overlap: '+u.name+' already includes '+u2.name+' - check the requisition for a duplicate order.');}
    for(const it of unknown){if((e.includesDictIds||[]).includes(it.id))inter.push('Possible overlap: '+u.name+' already includes '+it.name+' - check the requisition for a duplicate order.');}}
  if(inter.length){const l=el('ul');for(const s of uniq(inter))l.appendChild(el('li',{text:s}));pw.appendChild(el('div',{class:'fact caveat'},'⚠ Order notes:',l));}
  host.appendChild(pw);

  // 7. labelling
  const lab=el('div',{class:'sum-card'},el('h3',{text:'Labelling'}));const L={};
  for(const u of known)for(const x of u.entry.labelling||[]){const k=x.replace(/\.$/,'').replace(/indentifier/,'identifier').toLowerCase();(L[k]=L[k]||{t:x.replace(/\.$/,''),w:new Set()}).w.add(u.name);}
  for(const [f,list] of byForm){const k=f.labelling.toLowerCase();(L[k]=L[k]||{t:f.labelling,w:new Set(),src:f}).w.add('__form');L[k].src=f;}
  const ll=el('ul');for(const k in L){const v=L[k];if(v.src){ll.appendChild(el('li',{},v.t+' ',el('span',{class:'small',text:'('+v.src.display+')'})));continue;}ll.appendChild(el('li',{text:v.t.replace(/^./,c=>c.toUpperCase())+(v.w.size<known.length?' ('+[...v.w].join(', ')+')':'')}));}
  if(Object.keys(L).length)lab.appendChild(ll);else lab.appendChild(el('div',{class:'small',text:'No labelling instructions in the LifeLabs entries for these tests.'}));
  if(chartOnly.length&&known.length)lab.appendChild(el('div',{class:'small',text:'Not yet available for tests without a LifeLabs entry: '+chartOnly.map(u=>u.name).join(', ')+'.'}));
  host.appendChild(lab);

  // 8. per-test cards
  const tc=el('div',{class:'sum-card'},el('h3',{text:'Tests'}));
  for(const u of units){const e=u.entry;const d=el('div',{class:'test-line'+(e?'':' chart-only')});
    d.appendChild(el('div',{class:'tname',text:e?e.name:u.name}));
    const asked=uniq(u.items.map(i=>i.name));if(asked.some(a=>a!==(e?e.name:u.name)))d.appendChild(el('div',{class:'small',text:'Confirmed as: '+asked.join('; ')}));
    if(u.excludedBy&&u.excludedBy.effect.severity==='red')d.appendChild(el('div',{class:'fact warn',text:'⛔ Not collected in community - see the red card above.'}));
    else if(u.excludedBy)d.appendChild(el('div',{class:'fact caveat',text:'Answer the question above first.'}));
    if(u.localTube){const lt=P.blood.find(t=>t.members.some(m=>m.unit===u));
      d.appendChild(el('div',{class:'fact'},el('b',{text:'Tube: '}),(lt?lt.label+(lt.ofType>1?' #'+lt.no:''):u.localTube.tube.label)+' - local practice ',localTag(u.localTube)));
      if(u.chart)d.appendChild(el('div',{class:'small',text:'LifeLabs chart (overridden by local practice): '+u.chart.group.tube.label+' (chart: '+u.chart.chartNames.join(', ')+')'}));}
    else if(u.chart){const g=u.chart.group;
      d.appendChild(el('div',{class:'fact'},el('b',{text:'Tube: '}),g.tube.label+(e?'':' - per LifeLabs Quick Reference Chart; full handling: check Lab Test Information'),' (chart: '+u.chart.chartNames.join(', ')+')'));
      if(u.chart.partial)d.appendChild(el('div',{class:'fact caveat',text:'⚠ '+u.chart.partial+' - confirm with lab.'}));}
    if(!e&&!u.chart&&!u.localTube&&u.route)d.appendChild(el('div',{class:'fact'},el('b',{text:'Tube: '}),u.route.spec.tube+' - per the '+u.route.form.display+' (“'+u.route.spec.combine+'”); not on the LifeLabs chart; full handling: check Lab Test Information / PHSA eLab Handbook'));
    if(u.route&&u.route.how!=='lifelabs')d.appendChild(el('div',{class:'small',text:'Requisition: '+u.route.form.display+' - “'+u.route.test.onForm+'” ('+u.route.test.section+')'}));
    if(!e){d.appendChild(el('div',{class:'fact caveat',text:u.localTube&&u.localTube.destination==='BCCDC'?'Processing, storage and transport details are not yet available for this test (destination BCCDC per local practice).':'Processing, storage, transport and destination details are not yet available for this test.'}));
      d.appendChild(el('div',{class:'src'},(u.chart?chartSrc():u.route?'Source: '+u.route.form.source+' · checked '+u.route.form.lastChecked:'Source: local practice, '+ruleSrc(u.localTube))+' · ',el('a',{href:DIR_URL,target:'_blank',rel:'noopener noreferrer',text:'tests.lifelabs.com'})));tc.appendChild(d);continue;}
    const meta=[e.specimenType,e.discipline,e.frequency&&('Frequency '+e.frequency),e.turnaroundTime&&('TAT '+e.turnaroundTime)].filter(Boolean).join(' · ');d.appendChild(el('div',{class:'small',text:meta}));
    const mins=e.collect.filter(c=>c.volume&&!/full tube/i.test(c.volume)).map(c=>(c.tests&&e.collect.length>1?c.tests+': ':'')+c.volume);
    if(mins.length)d.appendChild(el('div',{class:'small',text:'Lab minimum: '+mins.join(', ')+' (collect a full tube - local practice)'}));
    if((e.includes||[]).length)d.appendChild(el('div',{class:'small',text:'Includes: '+e.includes.join(', ')}));
    const det=el('details',{},el('summary',{text:'Handling steps (verbatim)'}));const hl=el('ul',{class:'verbatim'});for(const h of e.handling||[])hl.appendChild(el('li',{text:h}));det.appendChild(hl);
    if((e.preTestPrep||[]).length){det.appendChild(el('div',{class:'small',text:'Pre-test preparation:'}));const pl=el('ul',{class:'verbatim'});for(const h of e.preTestPrep)pl.appendChild(el('li',{text:h}));det.appendChild(pl);}
    d.appendChild(det);
    const amb=(e.ambiguities||[]).filter(x=>!/collection volume (is )?not stated/i.test(x));
    if(amb.length){const a=el('details',{class:'amb'},el('summary',{text:'⚠ Unclear in the directory entry ('+amb.length+')'}));const al=el('ul');for(const x of amb)al.appendChild(el('li',{text:x}));a.appendChild(al);d.appendChild(a);}
    d.appendChild(el('div',{class:'src'},srcLine(e)+(u.localTube?' · tube: local practice':u.chart?' · tube: '+TR.shortSource:'')+' · ',el('a',{href:DIR_URL,target:'_blank',rel:'noopener noreferrer',text:'tests.lifelabs.com'})));
    tc.appendChild(d);}
  host.appendChild(tc);
  banner();
  return {known:known.length,chartOnly:chartOnly.length,unknown:unknown.length,blood:P.blood.length,other:P.nonBlood.length,conflicts:P.conflicts};}

root.CollectionSummary={render,resolve,plan,ruleStates,BYDICT};
})(typeof self!=='undefined'?self:this);
