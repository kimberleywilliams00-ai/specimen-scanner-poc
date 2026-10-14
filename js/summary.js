/* Collection Summary (v3.7). Pure in-memory rendering. Nothing is stored or sent. Never guesses: tests without any data get an amber card.
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
       v3.5: the BCCDC serology SST rule carries a 'handling' field (VCH community practice 2026-10-11): clot, then centrifuge, using the
       LifeLabs SST clot time / centrifuge settings from collection_data.js; no amber note and no 'Do NOT centrifuge' banner for that tube;
       the per-test LifeLabs wording stays in each test's details, labelled as LifeLabs page text. For BCCDC-bound tubes the clot/spin settings
       come from the BCCDC eLab Handbook entry (js/elab_data.js) when one exists for a test in the tube; LifeLabs differences are noted.
       v3.6: the SST is sent as is (no serum transfer, local practice). v3.7: the serology SST TUBE CARD quotes only the eLab clot and
       centrifuge sentences (no serum-transfer / sterile-tube wording; the full verbatim eLab text stays in each test's details). When several
       tests in the tube have eLab entries (e.g. Hep C + HIV serology) their clot/spin settings are compared: identical -> shown once,
       different -> the longer (stricter) clot is used and the difference is flagged on the tube.
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
const ELAB=root.ElabData||{entries:[],byDict:{}}; // v3.5 BCCDC PHL eLab Handbook entries (verbatim; js/elab_data.js)
const elabOf=u=>u.ids.map(i=>ELAB.byDict[i]).find(Boolean)||null;
/* ui2 (2026-10-11): eLab entries with one specimen row per site (CT/GC NAT) - the row for this unit's site; and a community specimen rule */
const elabSpec=u=>{const eb=elabOf(u);return eb&&eb.siteSpecimens?eb.specimens.find(s=>s.dictIds.some(i=>u.ids.includes(i)))||null:null;};
const elabsOf=u=>uniq(u.ids.map(i=>ELAB.byDict[i]).filter(Boolean)); // ui2: every eLab entry for the unit (CT/GC urine + Trichomonas share one unit)
const elabRow=(eb,u)=>eb&&eb.siteSpecimens?eb.specimens.find(s=>s.dictIds.some(i=>u.ids.includes(i)))||null:null;
const specRule=u=>LR.rules.find(r=>r.kind==='specimen'&&r.appliesTo.some(i=>u.ids.includes(i)))||null;
const qq=x=>'“'+x+'”';
const DIR_URL='https://tests.lifelabs.com/';
const BYDICT={},BYDICT_ALL={};for(const e of DATA.entries)for(const id of e.dictIds||[]){if(!BYDICT[id])BYDICT[id]=e;(BYDICT_ALL[id]=BYDICT_ALL[id]||[]).push(e);}
// ui2 (2026-10-11): dictIdsVia - a test that uses another entry's specimen because a source says the specimen is shared (e.g. urine
// Trichomonas on the CT/GC urine: LifeLabs Doc#31847). Only used when the test has no entry of its own.
for(const e of DATA.entries)for(const id in e.dictIdsVia||{})if(!BYDICT_ALL[id])(BYDICT_ALL[id]=[]).push(e);
const GD=root.GuideData||{entries:[],byDict:{}}; // ui2: collection guides + patient instruction sheets (js/guide_data.js, verbatim)
const guidesFor=u=>uniq((u.ids||[]).flatMap(id=>GD.byDict[id]||[]));
const viaIds=u=>u.entry&&u.entry.dictIdsVia?u.ids.filter(i=>u.entry.dictIdsVia[i]):[];
function guideRef(g){return [g.issuer,g.title,g.docNumber,g.version,g.date].filter(Boolean).join(' · ');}
/* v3.7: one dictionary id can be linked to several LifeLabs entries (e.g. 'TSH +/- fT4' -> TSH and FREE T4): one unit per entry. */

function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}
  for(const k of kids)if(k!=null&&k!==false)e.appendChild(typeof k==='string'?document.createTextNode(k):k);return e;}
const uniq=a=>[...new Set(a.filter(Boolean))];
function nominalMl(container){const m=(container||'').match(/(\d+(?:\.\d+)?)\s*mL/i);return m?+m[1]:null;}
function tubeColour(container){const c=(container||'').toLowerCase();
  if(/citrate|light blue/.test(c))return {rank:2,css:'lblue'};if(/^red top|^\d+(\.\d+)? ?ml red top/.test(c))return {rank:3,css:'red'}; /* turn 27: Red top pages (chart RED60) */ if(/sst|gold|red top|serum/.test(c))return {rank:3,css:'gold'};
  if(/heparin|green/.test(c))return {rank:4,css:'green'};if(/edta|lavender|pink/.test(c))return {rank:5,css:'lav'};if(/fluoride|grey|gray/.test(c))return {rank:6,css:'grey'};if(/acd|yellow/.test(c))return {rank:9,css:'yellow'};return {rank:9,css:''};} // ui2 turn 13: ACD yellow chip colour only (draw-order rank unchanged)
function destLabel(c){if(c.destination)return c.destination+(c.destGroup==='PHL'&&!/PHL/.test(c.destination)?' (BCCDC Public Health Lab)':'');
  if(c.destGroup==='PHL'&&RF.formOfName(c.form))return 'BCCDC Public Health Lab (the '+RF.formOfName(c.form).title+' named is the BCCDC PHL form '+RF.formOfName(c.form).number+')';
  if(c.destGroup==='PHL')return 'BCCDC Public Health Lab - inferred from the requisition form named (PDF does not name the lab; confirm)';
  return 'Not stated in the directory entry (LifeLabs directory)';}
/* ui2 (2026-10-11) source links: each test name links to its own directory page. LifeLabs: entry.sourceUrl (a candidate built from the
   page title unless sourceUrlVerified); no LifeLabs entry: the directory home (page not in the app). eLab: handbook home (no per-test URL is
   printed on the pages). Links open in a new tab; offline they simply do not load. */
function srcOf(u){const e=u&&u.entry;if(e&&e.sourceUrl)return {url:e.sourceUrl,verified:!!e.sourceUrlVerified,label:'LifeLabs page: '+e.title};
  return {url:DIR_URL,verified:false,home:true,label:'LifeLabs test directory (this test’s page is not in the app yet)'};}
function srcLink(u,text,cls){const s=srcOf(u);return el('a',{href:s.url,target:'_blank',rel:'noopener noreferrer',class:'srclink'+(cls?' '+cls:''),text:text||s.label});}
function unvTag(u){const s=srcOf(u);return s.verified?null:el('span',{class:'unv',title:s.home?'Directory home - the page for this test is not in the app yet':'Built from the page title with the confirmed LifeLabs URL rule - this link has not been opened yet',text:s.home?'directory home':'pattern-based, unverified'});}
function elabLink(eb){return el('a',{href:eb.sourceUrl||ELAB.url,target:'_blank',rel:'noopener noreferrer',class:'srclink',text:ELAB.urlText});}
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
function parseMix(e,c){ /* ui2 turn 18: per-tube mix in one combined line ("Gently invert/mix SST tube 5-6 times and the EDTA tube 8-10 times.") */
  if(c&&c.container)for(const h of (e&&e.handling)||[])if(/invert\/mix/i.test(h)){const re=/\b(SST|EDTA|ACD|citrate)\s+tube\s+(\d+)\s*-\s*(\d+)\s*times/gi;let m;
    while((m=re.exec(h)))if(new RegExp('\\b'+m[1]+'\\b','i').test(c.container))return m[2]+'-'+m[3];}
  for(const h of ((e&&e.handling)||[]).concat(...((e&&e.collect)||[]).map(c=>c.notes||[]))){
  const m=h.match(/invert(?:\/mix)?\s+tubes?\s+(\d+)\s*-\s*(\d+)\s*times/i);if(m)return m[1]+'-'+m[2];}return null;}
function chartSrc(){return 'Source: '+TR.source+' ('+TR.region+') · last checked '+TR.lastChecked;}
function ruleSrc(r){return r.source+', '+r.date;}

/* items: [{id, name, notes}] -> units: one per LifeLabs entry (per-test PDF) or per chart-only dictionary id */
function resolve(items){const units=[],unknown=[],by=new Map();
  for(const it of items){const id=it.id;const es=(id&&BYDICT_ALL[id])||[];const ch=id&&TR.byId[id];
    if(!es.length&&!ch&&!RF.byId[id]){unknown.push(it);continue;}
    const dn=dictName(id).toLowerCase(),pos=e=>{const i=dn.indexOf(short(e).toLowerCase());return i<0?999:i;}; // order as named on the line (TSH, then fT4)
    for(const e of es.length?es.slice().sort((a,b)=>pos(a)-pos(b)):[null]){const key=e?'E:'+e.id+(e.perDictId?':'+id:''):'C:'+id; // ui2: perDictId = one specimen per site
      if(!by.has(key)){const u={key,entry:e||null,chart:ch||null,ids:[],items:[],name:e?(e.perDictId?dictName(id):short(e)):dictName(id)};by.set(key,u);units.push(u);}
      const u=by.get(key);u.items.push(it);if(!u.ids.includes(id))u.ids.push(id);if(!u.chart&&ch)u.chart=ch;}}
  for(const u of units){u.localTube=localTubeRule(u);u.route=formRoute(u);u.formOnly=!u.entry&&!u.chart&&!u.localTube;
    if(u.entry&&u.ids.length&&u.ids.every(i=>(u.entry.dictIdsVia||{})[i]))u.name=dictName(u.ids[0]);} // via-only: named after the test asked for
  return {units,known:units.filter(u=>u.entry),chartOnly:units.filter(u=>!u.entry),unknown};}

/* local practice rules: which apply, how they are answered, which units they take out of the tube plan */
function ruleStates(units,answers){const ids=new Set(units.flatMap(u=>u.ids));const out=[];
  for(const r of LR.rules.filter(r=>r.kind==='question')){if(!r.appliesTo.some(i=>ids.has(i)))continue;const a=answers[r.id]||null;const ans=a&&r.answers.find(x=>x.v===a);
    const resolved=ans?(ans.as||ans.v):'unanswered';out.push({rule:r,answer:a,resolved,effect:r.effects[resolved]||{}});}
  for(const r of LR.rules.filter(r=>r.kind==='refer'))if(r.appliesTo.some(i=>ids.has(i)))out.push({rule:r,answer:null,resolved:'refer',effect:r.effect,refer:true}); // ui2
  { const RD=LR.rules.find(r=>r.kind==='redirect'); // ui2 turn 28 (K. Williams 2026-10-13): separate serum/plasma, freeze, blood films -> redirect to LifeLabs (amber)
    if(RD)for(const u of units){const c=u.entry&&u.entry.collect.find(c=>c.redirect);if(!c)continue;const q='“'+c.redirect.quote.join('” “')+'”';
      out.push({rule:{id:'redirect_'+u.entry.id,kind:'refer',redirect:true,appliesTo:u.ids.slice(),source:RD.source,date:RD.date,rationale:RD.rationale,base:RD},answer:null,resolved:'refer',refer:true,
        effect:{severity:'red',excludeFromTubes:true,title:u.name+': '+c.redirect.reason+' - refer to a LifeLabs Patient Service Centre',short:'LifeLabs page: '+q,
          text:u.name+': the LifeLabs page requires '+c.redirect.reason+' - '+q+'. '+RD.text}});}}
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
        if(sib.some(x=>!x.members.some(m=>m.unit===u))){for(const x of sib.concat(t))x.split=true; /* turn 27: a 2nd tube of the SAME test (count 2, e.g. Malaria) is not a handling split */
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
      { const cr=LR.rules.find(r=>r.kind==='companion'&&r.entries.includes(e.id)&&new RegExp(r.slotMatch).test(c.container||'')); // ui2 turn 14: CD4 REQUIRES a CBC (K. Williams)
        if(cr){const has=tubes.some(t=>t.group&&t.group.id===cr.group&&t.members.some(m=>m.unit.ids.some(i=>i==='cbc'||i==='cbc_diff')));u.companion={rule:cr,satisfied:has};
          if(!has){const he=DATA.entries.find(x=>x.id===cr.handlingEntry),hc=(he&&he.collect.find(x=>x.kind==='blood'))||c,g=TR.groups.find(g=>g.id===cr.group);
            const pu={key:'REQ:'+cr.id,entry:he||null,chart:null,ids:['cbc'],items:[],name:cr.reqName,forCompanion:cr};
            mk({group:g,source:'chart',members:[{unit:pu,c:hc}],companionFor:{rule:cr,unit:u}});}
          continue;}}
      if(c.shareGroup){let g=tubes.find(t=>t.key==='SG:'+c.shareGroup&&!t.members.some(m=>m.unit===u)&&commOk(t,u));
        if(!g)g=mk({key:'SG:'+c.shareGroup,source:'pdf',explicit:true});g.members.push({unit:u,c});continue;}
      if(c.noShare){mk({source:'pdf',members:[{unit:u,c}]});continue;}
      // no chart rule and no sharing statement in the per-test PDF: own tube. If another unchartered test has an identical
      // container/handling/destination the lab might allow sharing - say so, but do not combine.
      const key=[c.container,c.centrifuge,c.clotMinutes,c.rcf,c.spinMinutes,c.temp,c.destGroup||''].join('|');
      mk({key,source:'pdf',members:[{unit:u,c}],own:true});}}
  // ui2 turn 16: local practice chartJoin (AFP: chemistry SST when shared, 3.5 mL SST when alone)
  for(const r of LR.rules.filter(r=>r.kind==='chartJoin')){
    for(const t of tubes.slice()){if(!t.group||t.group.id!==r.fromGroup||!t.members.every(m=>m.unit.ids.some(i=>r.ids.includes(i))))continue;
      const j=tubes.find(x=>x!==t&&x.group&&x.group.id===r.joinGroup&&!x.split&&t.members.every(m=>commOk(x,m.unit)&&compatible(x,m.c,m.unit)));
      if(j){j.members.push(...t.members);(j.joined=j.joined||[]).push({rule:r,names:t.members.map(m=>m.unit.name)});tubes.splice(tubes.indexOf(t),1);}
      else{t.group=Object.assign({},t.group,{tube:Object.assign({},t.group.tube,r.alone)});t.sizeRule=r;}}}
  // ui2 turn 28: LifeLabs page says one tube for two tests (collect.shareTubeWith, verbatim) - used when the page is newer than the chart (page_vs_chart_date)
  { const PR=LR.rules.find(r=>r.kind==='precedence');
    for(const t of tubes.slice()){if(!tubes.includes(t))continue;const m0=t.members.find(m=>m.c&&m.c.shareTubeWith);if(!m0)continue;const sw=m0.c.shareTubeWith,pd=m0.unit.entry.lastPublished;
      for(const x of tubes.slice()){if(x===t)continue;const mx=x.members.find(m=>m.unit.entry&&sw.entries.includes(m.unit.entry.id));if(!mx||x.members.length!==1||t.members.length!==1)continue;
        const px=mx.unit.entry.lastPublished,newer=PR&&pd&&px&&pd>PR.chartDate&&px>PR.chartDate;
        if(!newer){t.caveats.push('Chart vs per-test PDF: '+m0.unit.name+' page says “'+sw.quote+'” but the chart (effective '+(PR?PR.chartDate:'?')+') is newer or a page date is missing - chart kept (separate tubes).');conflicts.push(m0.unit.name+' / '+mx.unit.name+': page says one tube, chart separate - chart kept.');continue;}
        t.members.push(...x.members);tubes.splice(tubes.indexOf(x),1);
        t.infos.push('One tube for '+m0.unit.name+' and '+mx.unit.name+': LifeLabs page “'+sw.quote+'” (pages published '+pd+' / '+px+', newer than the chart '+PR.chartDate+', which shows separate tubes; rule page_vs_chart_date).');}}}
  // per-tube facts, conflicts, caveats
  for(const t of tubes.filter(t=>t.local)){const r=t.local;t.label=r.tube.label;t.css=r.tube.css;t.rank=r.tube.rank;t.mix=r.mix;t.amber=[];
    // per-test centrifuge instructions from the LifeLabs pages (all blood slots of each member)
    const spin={},none=[];for(const m of t.members){const v=uniq((m.slots||[]).map(c=>c.centrifuge===true?'spin':c.centrifuge===false?'nospin':null));
      if(!v.length)none.push(m.unit.name);for(const x of v)(spin[x]=spin[x]||[]).push(m.unit.name);}
    const kinds=Object.keys(spin);const cf=kinds.length===1&&!none.length?kinds[0]==='spin':null;
    if(kinds.length===1&&none.length)t.partialSpin={kind:kinds[0],has:spin[kinds[0]],none};
    t.c={container:t.label,centrifuge:cf,destGroup:r.destination==='BCCDC'?'PHL':'',destination:r.destination==='BCCDC'?'BCCDC Public Health Laboratory (PHL)':(r.destination||'')};
    if(r.handling&&r.handling.centrifuge){ // v3.5 local practice: clot, then centrifuge
      const sst=c=>c&&c.centrifuge===true&&/sst/i.test(c.container||'')&&(c.destGroup||'')!=='PHL';
      let src=t.members.flatMap(m=>(m.slots||[]).filter(sst).map(c=>({c,n:m.unit.name})));
      if(!src.length)src=DATA.entries.flatMap(e=>e.collect.filter(sst).map(c=>({c,n:short(e)})));
      const sets=uniq(src.map(x=>[x.c.clotMinutes,x.c.spinMinutes,x.c.rcf].join('|')));const ll=sets.length===1?src[0].c:null;
      t.llSettings=ll;t.handlingFrom=uniq(src.map(x=>x.n));
      // BCCDC-bound tube: BCCDC eLab Handbook settings when a test in the tube has an eLab entry (clot as for the Preferred clotted blood,
      // centrifuge as for its serum specimen)
      const el_=uniq(t.members.map(m=>elabOf(m.unit)));t.elab=r.destination==='BCCDC'?el_:[];
      // v3.7: several eLab entries (e.g. Hep C + HIV serology) -> compare; identical settings shown once, otherwise the longer clot wins
      // (stricter) and the difference is flagged on the tube card.
      t.elabSet=elabSettings(t.elab);const es=t.elabSet;
      if(es)t.c=Object.assign(t.c,{centrifuge:true,clotMinutes:null,clotText:'Clot upright at room temperature for '+es.use.clot,spinMinutes:es.use.spinMinutes,rcf:es.use.rcf});
      else t.c=Object.assign(t.c,{centrifuge:true,clotMinutes:ll&&ll.clotMinutes,spinMinutes:ll&&ll.spinMinutes,rcf:ll&&ll.rcf});
      t.handling=r.handling;t.handlingSettingsOk=!!es||!!ll;
      if(kinds.length>1||none.length)t.llSpin=spin;delete t.partialSpin;}
    else if(r.handling&&r.handling.centrifuge===false){t.handling=r.handling;t.elab=r.destination==='BCCDC'?uniq(t.members.map(m=>elabOf(m.unit))):[];if(kinds.length>1||none.length)t.llSpin=spin;delete t.partialSpin;} // turn 34: BCCDC serology SST not spun
    else if(kinds.length>1){t.spinMixed=spin;t.amber.push(r.centrifugeConflict||'LifeLabs pages differ on centrifuging - confirm with lab');}
    /* ui2 (2026-10-11): BCCDC eLab Handbook entries for BCCDC-bound local tubes WITHOUT a local handling rule (HCV RNA / HIV viral load
       EDTA). The eLab page takes priority where it states something; where it is silent the LifeLabs entry is used - except that a
       LifeLabs centrifuge / plasma-separation step the eLab page does not print is NOT applied: centrifuging is left open and flagged amber
       (community nurses do not separate/transfer). Local practice tube rules (tube, mix, full tube) still apply. */
    if(!r.handling&&r.destination==='BCCDC'){const el_=uniq(t.members.map(m=>elabOf(m.unit)));
      if(el_.length){t.elab=el_;const pref=el_.map(eb=>({eb,sp:eb.specimens.find(x=>x.preferred)||eb.specimens[0]}));t.elabPref=pref;
        const eSpin=uniq(pref.map(p=>p.sp.centrifuge===true?'spin':p.sp.centrifuge===false?'nospin':null));
        if(eSpin.length===1)t.c.centrifuge=eSpin[0]==='spin';
        else if(t.c.centrifuge===true){t.c.centrifuge=null;
          const steps=uniq(t.members.flatMap(m=>(m.slots||[]).flatMap(c=>(c.notes||[]).filter(n=>/centrifug|separate/i.test(n)))));
          t.elabSpinConflict={steps,sep:t.members.some(m=>(m.slots||[]).some(c=>c.separatePlasma)),pref};
          t.amber.push('Centrifuging: LifeLabs page'+(steps.length?' says '+steps.map(x=>'“'+x+'”').join(' '):' says centrifuge')+'; the BCCDC eLab page ('+pref.map(p=>p.eb.title+', Preferred specimen: '+p.sp.specimen+', '+p.sp.container).join('; ')+') prints no centrifuge or separation step. BCCDC applies for this BCCDC-bound tube, so no centrifuge step is shown - community nurses do not separate or transfer specimens; confirm with BCCDC before collecting.');}
        for(const p of pref)if(p.eb.invert&&t.mix&&!p.eb.invert.includes(t.mix))t.infos.push('Mixing: BCCDC eLab ('+p.eb.title+') “'+p.eb.invert+'”; local practice tube rule and LifeLabs page: '+t.mix+' times (shown).');
        for(const p of pref){const num=(p.eb.requisition||'').match(/PHRQ_[A-Z]+_\d+F/);if(!num)continue;
          const routed=uniq(t.members.map(m=>m.unit.route&&m.unit.route.form));
          const rd=RF.redirectFor&&RF.redirectFor(num[0],t.members.flatMap(m=>m.unit.ids)); // ui2: the eLab-named form itself redirects (K. Williams 2026-10-11)
          if(rd&&routed.length&&routed.every(f=>f.id===rd.to)){t.reqRedirect={p,rd};t.infos.push('Requisition: '+routed.map(f=>f.display).join(', ')+'. The BCCDC eLab page ('+p.eb.title+') names “'+p.eb.requisition+'”, but the '+rd.from.display+' says ('+rd.section+' section): “'+rd.text+'”.');}
          else if(routed.length&&routed.some(f=>f.number!==num[0])){t.reqConflict=p;t.amber.push('Requisition: the BCCDC eLab page ('+p.eb.title+') names “'+p.eb.requisition+'”; the LifeLabs page and the '+routed.map(f=>f.display).join(', ')+' use the Serology Screening Requisition - confirm which requisition.');}
          else if(!routed.length){const f=RF.forms.find(f=>f.number===num[0]);t.elabReq={p,form:f||null,listed:false};}}
        t.timeLimits=pref.flatMap(p=>(p.eb.timeLimits||[]).map(x=>({text:x,eb:p.eb})));}}
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
    { const zr=LR.rules.find(r=>r.kind==='tubeSize'&&t.members.some(m=>m.unit.entry&&r.entries.includes(m.unit.entry.id)&&m.c&&new RegExp(r.match).test(m.c.container||'')));
      if(!g&&zr){t.label=zr.label;t.sizeLocal=zr;t.infos.push('Tube size: '+zr.text+' Local practice ('+zr.source+', '+zr.date+'); the LifeLabs page says “'+rep.container+'”.');} } // ui2 turn 16
    for(const x of t.joined||[])t.infos.push(x.names.join(', ')+' in this tube - local practice: '+x.rule.text+' ('+x.rule.source+', '+x.rule.date+')'); // ui2 turn 16
    if(t.sizeRule)t.infos.push('Tube size: local practice: '+t.sizeRule.text+' ('+t.sizeRule.source+', '+t.sizeRule.date+')');
    if(!g&&!rep&&t.formSpec&&t.formSpec.css==='lav')t.label='EDTA lavender top (size not stated on the form)';
    t.c=rep||{container:t.label,centrifuge:null};
    const col=g?GCSS[g.tube.colour]||{rank:9,css:''}:rep?tubeColour(rep.container):(t.formSpec&&t.formSpec.css==='lav'?{rank:5,css:'lav'}:{rank:3,css:'gold'});t.css=col.css;t.rank=col.rank;
    t.mix=g?g.mix:(t.members.map(m=>parseMix(m.unit.entry,m.c)).find(Boolean)||null);
    for(const m of t.members)if(m.unit.entry&&m.unit.entry.scopeNote&&!scopeOk(m.unit.entry,units))t.caveats.push(m.unit.name+': '+m.unit.entry.scopeNote); // v3.7
    for(const m of t.members)if(m.c&&m.c.destinationInferred&&!RF.formOfName(m.c.form||m.unit.entry.form))t.caveats.push(m.unit.name+': destination inferred from the requisition form named - confirm.');
    if(t.formSpec){const byForm=t.members.filter(m=>m.unit.formTubed).map(m=>m.unit.name);
      if(byForm.length&&t.members.length>1)t.infos.push(byForm.join(', ')+' added to this tube per the '+t.form.display+': “'+t.formSpec.combine+'”');
      for(const m of t.members)if(m.unit.formOnly)t.caveats.push(m.unit.name+': tube from the requisition form only (not on the LifeLabs chart; no LifeLabs entry yet).');}
    if(g){for(const m of t.members){const nm=m.unit.name;if(!m.unit.chart||m.unit.chart.group!==g)continue;
        if(m.unit.chart.partial)t.caveats.push(nm+': '+m.unit.chart.partial);if(m.unit.chart.coverageNote)t.infos.push(m.unit.chart.coverageNote+'.');
        if(!m.c)continue;
        const pm=nominalMl(m.c.container),pc=tubeColour(m.c.container).css;
        const PR=LR.rules.find(r=>r.kind==='precedence'),pd=m.unit.entry&&m.unit.entry.lastPublished,pageWins=!!(PR&&pd&&pd>PR.chartDate); // turn 28: newer source wins
        const win=s=>pageWins?s.replace(/ - chart (size )?used\.$/,' - page used (page published '+pd+', newer than the chart '+PR.chartDate+'; rule page_vs_chart_date).'):s.replace(/\.$/,' (chart effective '+(PR?PR.chartDate:'')+' is newer than the page'+(pd?' published '+pd:' - page date missing')+').');
        const isSST=/sst/i.test(g.tube.type||g.tube.label);
        if(pc&&pc!==t.css){const s=win(nm+': per-test PDF container "'+m.c.container+'" differs from the chart ('+g.tube.label+') - chart used.');if(pageWins)t.infos.push('Chart vs per-test PDF: '+s);else{t.caveats.push('Chart vs per-test PDF: '+s);conflicts.push(s);}}
        else if(pm!=null&&Math.abs(pm-g.tube.sizeMl)>1e-6&&!(isSST&&LR.rules.some(r=>r.kind==='sstSize'))){const s=win(nm+': per-test PDF says "'+m.c.container+'", chart says '+g.tube.label+' - chart size used.');const jr=LR.rules.find(r=>r.kind==='chartJoin'&&m.unit.ids.some(i=>r.ids.includes(i)));if(jr)t.infos.push(s+' Local practice: '+jr.text);else if(pageWins){t.infos.push('Chart vs per-test PDF: '+s);t.pageSize=pm;}else{t.caveats.push('Chart vs per-test PDF: '+s);conflicts.push(s);}}
        else if(pm!=null&&Math.abs(pm-g.tube.sizeMl)>1e-6)t.infos.push(nm+': per-test PDF says "'+m.c.container+'", chart says '+g.tube.label+' - SST size by local rule sst_size_alone_shared (3.5 mL alone, 5 mL shared).');
        else if(pm==null)t.infos.push(nm+': tube size not stated in the per-test PDF ("'+m.c.container+'"); '+g.tube.sizeMl.toFixed(1)+' mL from the chart.');
        const px=parseMix(m.unit.entry);if(px&&px!==g.mix){const s=win(nm+': per-test PDF says mix '+px+' times, chart says '+g.mix+' times - chart used.');if(pageWins){t.infos.push('Chart vs per-test PDF: '+s);t.mix=px;}else{t.caveats.push('Chart vs per-test PDF: '+s);conflicts.push(s);}}
        if(m.c.noShare&&!m.c.shareGroup&&t.members.length>1)t.infos.push(nm+': per-test PDF describes its own tube ("'+(m.c.notes||[])[0]+'"); the chart shares this tube with '+t.members.filter(x=>x!==m).map(x=>x.unit.name).join(', ')+'.');}
      if(g.confirm&&(!g.confirmWhenAlso||tubes.some(x=>x.group&&x.group.id===g.confirmWhenAlso))&&(!g.confirmWhenMulti||uniq(tubes.filter(x=>x.group===g).flatMap(x=>x.members.map(m=>m.unit.key))).length>1))t.caveats.push('Chart interpretation: '+g.confirm);
      if(t.split)t.caveats.push('Chart shows one tube for these tests but the per-test handling differs (centrifuged vs not / destination), so they are kept apart.');}
    { const SR=LR.rules.find(r=>r.kind==='sstSize'); // ui2 turn 28: SST 3.5 mL alone / 5 mL shared (generalises afp_tube); newer page size for other tubes
      if(SR&&/sst/i.test(t.label)&&!t.sizeLocal){const n=uniq(t.members.map(m=>m.unit.key)).length,ml=n>1?SR.shared:SR.alone;t.label='SST gold top '+ml.toFixed(1)+' mL';t.sstSize={ml,n};
        if(!t.sizeRule)t.infos.push('Tube size: local rule - '+SR.text+' ('+SR.source+', '+SR.date+')');}
      else if(t.pageSize&&/[\d.]+ mL/.test(t.label))t.label=t.label.replace(/[\d.]+ mL/,(+t.pageSize).toFixed(1)+' mL'); }
    t.chartOnly=t.members.filter(m=>!m.c).map(m=>m.unit.name);t.typeKey=t.css+'|'+(g?(nominalMl(t.label)||g.tube.sizeMl):(nominalMl(t.label)||(t.css==='gold'?5:null)));}
  for(const t of tubes)if(t.own){const same=tubes.filter(x=>x!==t&&x.typeKey===t.typeKey&&x.c.centrifuge===t.c.centrifuge&&(x.c.destGroup||'')===(t.c.destGroup||''));
    t.caveats.push('Not on the LifeLabs Quick Reference Chart: drawn as its own tube'+(same.length?' (same tube type and handling as the tube for '+uniq(same.flatMap(x=>x.members.map(m=>m.unit.name))).join(', ')+' - the lab may allow combining)':'')+'.');}
  if(live.some(u=>u.chart&&!u.localTube&&u.chart.group.mode==='perTest'&&u.route))conflicts.push('Hepatitis Acute / Chronic profiles: the '+(RF.forms[0]||{}).display+' says “'+((RF.forms[0]||{specimens:{serum:{}}}).specimens.serum.combine)+'”, but the LifeLabs chart and LifeLabs pages say two SST tubes per profile (one centrifuged for LifeLabs, one unspun for BCCDC) - LifeLabs used for LifeLabs collection.');
  for(const t of tubes){const k=uniq(t.members.map(m=>isComm(m.unit)?'c':'n'));if(k.length>1)throw new Error('communicable/non-communicable tests in one tube');}
  const spinRank=t=>t.c.centrifuge===true?0:t.c.centrifuge===false?1:2;
  const gi=t=>t.group?TR.groups.indexOf(t.group):99;
  { const dl=LR.rules.find(r=>r.kind==='drawLast');if(dl)for(const t of tubes)if(new RegExp(dl.match).test((t.c&&t.c.container)||t.label||'')){t.rank=99;t.drawLast=dl;} } // ui2 turn 14: local practice
  const blood=tubes.sort((a,b)=>a.rank-b.rank||spinRank(a)-spinRank(b)||gi(a)-gi(b));
  const cnt={};for(const t of blood){cnt[t.typeKey]=(cnt[t.typeKey]||0)+1;t.no=cnt[t.typeKey];}for(const t of blood)t.ofType=cnt[t.typeKey];
  // ui2 (2026-10-11, turn 10): ONE container for tests whose LifeLabs page says so (collect.shareWith {entries, quote}, verbatim),
  // e.g. C&S URINE (IF INDICATED): "If C&S and UA are ordered place both labels on the single container."
  // ui2 (turn 14): local practice - one specimen for several entries (shareSpecimen), supporting quotes from a guide reference
  for(const r of LR.rules.filter(r=>r.kind==='shareSpecimen')){const g=GD.entries.find(x=>x.id===r.guide);
    const hit=others.filter(o=>o.members.some(m=>m.unit.entry&&r.entries.includes(m.unit.entry.id)));if(hit.length<2)continue;const o=hit[0];
    for(const p of hit.slice(1)){o.members.push(...p.members);(o.sharedWith=o.sharedWith||[]).push({unit:p.members[0].unit,c:p.c,rule:r,g,from:o.members[0].unit});others.splice(others.indexOf(p),1);}}
  for(const o of others.slice()){const sw=o.c&&o.c.shareWith;if(!sw||!others.includes(o))continue;
    for(const p of others.slice()){const pe=p.members[0].unit.entry;if(p===o||!pe||!sw.entries.includes(pe.id))continue;
      o.members.push(...p.members);(o.sharedWith=o.sharedWith||[]).push({unit:p.members[0].unit,c:p.c,quote:sw.quote,from:o.members[0].unit});others.splice(others.indexOf(p),1);}}
  // ui2 (2026-10-12, turn 22): local practice shareCup (K. Williams) - runs after the LifeLabs shareWith merge so ACR joins a UA+culture cup
  for(const r of LR.rules.filter(r=>r.kind==='shareCup')){const ent=o=>o.members.map(m=>m.unit.entry&&m.unit.entry.id).filter(Boolean);
    if(!r.groups.every(g=>others.some(o=>ent(o).some(e=>g.includes(e)))))continue;const all=r.groups.flat();
    const hit=others.filter(o=>ent(o).some(e=>all.includes(e)));if(hit.length<2)continue;
    const rank=o=>{const i=r.hostFirst.findIndex(h=>ent(o)[0]===h);return i<0?99:i;};const o=hit.slice().sort((a,b)=>rank(a)-rank(b))[0];
    for(const p of hit){if(p===o)continue;o.members.push(...p.members);(o.sharedWith=o.sharedWith||[]).push({unit:p.members[0].unit,c:p.c,rule:r,g:null,from:o.members[0].unit});others.splice(others.indexOf(p),1);}}
  for(const o of others){o.label=o.c.altContainer?o.c.container+' or '+o.c.altContainer:o.c.container;o.css=tubeColour(o.c.container).css;o.ofType=1;o.no=1;o.chartOnly=[];
    // ui2 (2026-10-11): kit / site steps / time limit from the collection guides (verbatim; js/guide_data.js)
    const u=o.members[0].unit,ids=u.ids,gs=guidesFor(u);
    const kitG=gs.find(g=>g.id==='ll_doc31971');if(kitG){const k=Object.values(kitG.kits).filter(k=>ids.some(i=>k.ids.includes(i))&&(!/Boric/.test(k.name)||/Preservative/.test(o.c.container||'')));if(k.length)o.kits=k.map(k=>({name:k.name,use:k.use,not:k.not,g:kitG}));}
    // (BCCDC Quick Reference kit conflict removed 2026-10-11: its 'Unisex' wording is treated as superseded - K. Williams: the photo shows a Multitest swab)
    const stG=gs.find(g=>g.sites);const sid=stG&&ids.concat(viaIds(u).length?['ct_ng_urine']:[]).find(i=>stG.sites[i]);if(sid)o.steps={site:stG.sites[sid],g:stG};
    o.timeLimits=gs.flatMap(g=>(g.timeLimits||[]).filter(x=>ids.some(i=>x.ids.includes(i))).map(x=>({text:x.text,g})));
    const via=viaIds(u);if(via.length)o.shared={ids:via,ev:via.map(i=>u.entry.dictIdsVia[i])};
    // ui2 (2026-10-11): BCCDC-bound test with a site row in the eLab Handbook - eLab is the source of specimen requirements (K. Williams
    // standing rule); LifeLabs / guide wording is kept in o.ll for Details only. A community specimen rule (local_rules.js) can override the container.
    const esp=elabSpec(u);if(esp){const eb=elabOf(u),lr=specRule(u),eg={issuer:'BCCDC eLab Handbook',title:eb.title,date:'Last Changed '+eb.lastChanged,elab:true};
      o.ll={kits:o.kits,steps:o.steps,timeLimits:o.timeLimits};o.eb={eb,sp:esp,g:eg,local:lr};o.dest='BCCDC';o.elabReq=eb.requisition;
      const steps=lr?esp.collection.filter((x,i)=>lr.keepSteps.includes(i)):esp.collection;
      o.kits=lr?[{name:lr.container,g:{issuer:'Local practice',title:lr.source,date:lr.date},local:true}]:[{name:esp.kit,label:esp.label,g:eg}];
      o.steps={site:{site:esp.specimen,device:lr?[lr.container]:[esp.container],steps,comments:[]},g:eg};
      o.timeLimits=lr?[]:esp.timeLimits.map(t=>({text:t,g:eg}));o.storage=esp.storage;o.hTemp=!lr&&(esp.storage||esp.appNote)?'room':null;
      o.extraElab=elabsOf(u).filter(x=>x!==eb).map(x=>({eb:x,sp:elabRow(x,u)})).filter(x=>x.sp);o.keySteps=esp.keySteps||null;}
    // ui2 (2026-10-11): local practice - urine cups always refrigerated (any urine test)
    if(o.c&&(o.c.kind==='urine'||/urine/i.test(o.c.container||''))){o.cupRule=LR.rules.find(r=>r.kind==='urineCup')||null;if(o.cupRule)o.hTemp=null;}
    // ui2 (turn 11): local practice - kit from a guide row (GC culture: BCCDC Quick Reference green-top eSwab)
    { const kr=LR.rules.find(r=>r.kind==='kitSource'&&o.members.some(m=>m.unit.entry&&r.entries.includes(m.unit.entry.id)));
      const kg=kr&&GD.entries.find(g=>g.id===kr.guide),kk=kg&&kg.kits&&kg.kits[kr.kit];
      if(kk){o.kitRule=kr;o.ll=Object.assign({},o.ll||{},{kits:o.kits});o.kits=[{name:kk.kit,g:kg}];} }
    // ui2 (turn 10): local practice - urine culture: send the cup, no boric acid tube (LifeLabs kit/pour-off kept in Details as lab-side)
    const co=LR.rules.find(r=>r.kind==='cupOnly'&&o.members.some(m=>m.unit.entry&&r.entries.includes(m.unit.entry.id)));
    if(co&&!o.eb){o.cupOnly=co;o.ll=Object.assign({},o.ll||{},{kits:o.kits});o.kits=[{name:co.container,g:{issuer:'Local practice',title:co.source,date:co.date},local:true}];
      const vg=co.quoteFrom&&GD.entries.find(g=>g.id===co.quoteFrom.guide);if(vg&&JSON.stringify(vg).includes(co.quoteFrom.match))o.cupVol={text:co.volume,quote:co.quoteFrom.match,g:vg};}
    else if(!o.eb&&o.c&&o.c.kind==='urine'&&o.c.volume)o.cupVol={text:o.c.volume,page:true};}
  { // ui2: CT/GC urine + urine culture together -> two containers, numbered (both LifeLabs pages say so)
    const ct=others.find(o=>o.members[0].unit.entry&&o.members[0].unit.entry.id==='ct_gc_urine'),cs=others.find(o=>o.members[0].unit.entry&&['cs_urine','cs_urine_if_indicated'].includes(o.members[0].unit.entry.id));
    if(ct&&cs){ct.pairNo=1;cs.pairNo=2;const q=e=>(e.preTestPrep||[]).filter(x=>/#1|#2/.test(x));ct.pairText=q(ct.members[0].unit.entry);cs.pairText=q(cs.members[0].unit.entry);}}
  return {blood,nonBlood:others,conflicts:uniq(conflicts)};}

/* v3.7: clot/centrifuge settings of each eLab entry in a BCCDC-bound tube (clot as for the Preferred clotted blood, centrifuge as for its
   serum specimen). Returns null if none has a centrifuge setting. clot text -> minutes for comparison ('about one hour' = 60). */
function clotMin(t){const s=(t||'').toLowerCase();const W={one:1,two:2,three:3,half:0.5};let m;
  if((m=s.match(/(\d+)\s*(?:min|minutes)/)))return +m[1];if((m=s.match(/(\d+|one|two|three)\s*hours?/)))return 60*(W[m[1]]||+m[1]);return null;}
function elabSettings(list){const rows=[];for(const eb of list||[]){const sp=eb.specimens.find(x=>x.centrifuge),cl=eb.specimens.find(x=>x.preferred)||sp;if(!sp)continue;
    rows.push({eb,clot:cl.clot,clotMin:clotMin(cl.clot),clotSentence:cl.collection.find(x=>/clot/i.test(x)),spinSentence:sp.collection.find(x=>/^centrifuge/i.test(x)),spinMinutes:sp.spinMinutes,rcf:sp.rcf});}
  if(!rows.length)return null;const key=r=>[r.clot,r.spinMinutes,r.rcf].join('|');const same=uniq(rows.map(key)).length===1;
  let use=rows[0];if(!same)for(const r of rows)if((r.clotMin||0)>(use.clotMin||0))use=r;
  const spinDiff=uniq(rows.map(r=>r.spinMinutes+'|'+r.rcf)).length>1,clotDiff=uniq(rows.map(r=>r.clot)).length>1;
  return {rows,same,use,spinDiff,clotDiff,clotUnclear:clotDiff&&rows.some(r=>r.clotMin==null)};}
/* v3.7: a reviewer scope note (e.g. Electrolytes page = Na & K only) is not needed when every test it points to is also confirmed */
function scopeOk(e,units){const ids=new Set(units.flatMap(u=>u.ids));return !!(e.scopeSatisfiedBy||[]).length&&e.scopeSatisfiedBy.every(i=>ids.has(i));}
function memberLabel(m){const e=m.unit.entry;return m.unit.name+(!m.slots&&m.c&&m.c.tests&&e&&e.collect.length>1?' ('+m.c.tests+')':'');}
function spinText(c){if(c.centrifuge===true)return (c.clotText?c.clotText+', then ':c.clotMinutes?'Clot upright ≥ '+c.clotMinutes+' min, then ':'')+'centrifuge '+(c.spinMinutes?c.spinMinutes+' min':'')+(c.rcf?' at '+c.rcf+' RCF':'');
  if(c.centrifuge===false)return 'Do NOT centrifuge';return '';}
/* v3.5 BCCDC eLab Handbook block on a test card: key fields verbatim + differences from the LifeLabs entry (BCCDC shown for BCCDC-bound tests) */
function elabBlock(eb,e,u,secondary){const b=el('div',{class:'elab-block'},el('div',{class:'tname'},'BCCDC eLab Handbook - ',el('a',{href:eb.sourceUrl||ELAB.url,target:'_blank',rel:'noopener noreferrer',class:'srclink',text:eb.title})));
  b.appendChild(el('div',{class:'small',text:'Last Changed '+eb.lastChanged+(eb.version?' · Version '+eb.version:' · no version number printed')+' · Test method: '+eb.testMethod+' · Turnaround: '+[].concat(eb.turnaround).join(' / ')+' · Processing: '+eb.processing}));
  const ul=el('ul');for(const sp of eb.specimens)ul.appendChild(el('li',{},el('b',{text:sp.specimen+(sp.preferred?' (Preferred)':'')+': '}),sp.container+' · Optimal: '+sp.optimal+' · Min: '+sp.min));b.appendChild(ul);
  b.appendChild(el('div',{class:'fact'},el('b',{text:'Shipping: '}),[].concat(eb.shipping).map(qq).join(' ')+' · Ship to: '+eb.shipTo));
  if(eb.timeAccepted)b.appendChild(el('div',{class:'fact small',text:'Time Accepted: “'+eb.timeAccepted+'”'}));
  if(eb.swabNote)b.appendChild(el('div',{class:'fact small',text:'Before You Collect: '+eb.beforeCollect.map(qq).join(' ')+' '+qq(eb.swabNote)}));
  for(const sp of eb.specimens.filter(x=>x.appNote))b.appendChild(el('div',{class:'fact small',text:sp.specimen+': '+sp.appNote}));
  b.appendChild(el('div',{class:'fact'},el('b',{text:'Stability: '}),eb.stability||'not printed on the eLab page'+((eb.timeLimits||[]).length?' (time limit: '+eb.timeLimits.map(x=>'“'+x+'”').join(' ')+')':'')));
  b.appendChild(el('div',{class:'fact'},el('b',{text:'Requisition: '}),eb.requisition));
  const det=el('details',{},el('summary',{text:'BCCDC eLab text (verbatim)'}));
  for(const sp of eb.specimens){det.appendChild(el('div',{class:'small',text:sp.specimen+(sp.preferred?' (Preferred)':'')+' - '+sp.container+':'}));const l=el('ul',{class:'verbatim'});for(const x of sp.collection)l.appendChild(el('li',{text:x}));if(!sp.collection.length)l.appendChild(el('li',{text:'(no collection text printed on the eLab page)'}));det.appendChild(l);}
  det.appendChild(el('div',{class:'small',text:'Quick Tip:'}));const q=el('ul',{class:'verbatim'});for(const x of eb.quickTip)q.appendChild(el('li',{text:x}));det.appendChild(q);
  det.appendChild(el('div',{class:'small',text:'Unacceptable Samples (may not apply in exceptional circumstances):'}));const un=el('ul',{class:'verbatim'});for(const x of eb.unacceptable)un.appendChild(el('li',{text:x}));det.appendChild(un);
  b.appendChild(det);
  // differences vs the LifeLabs entry
  const c=(e&&e.collect.find(x=>x.kind==='blood'&&x.destGroup==='PHL'))||(e&&e.collect.find(x=>x.kind==='blood'));const diff=[];let redir=null;
  if(c){const cl=eb.specimens.find(x=>x.preferred),sv=eb.specimens.find(x=>x.centrifuge);
    if(c.centrifuge===false&&sv)diff.push('Centrifuging: LifeLabs page “'+((c.notes||[]).find(n=>/centrifug/i.test(n))||'Do NOT centrifuge')+'”; BCCDC eLab: '+cl.specimen+' (Preferred, no centrifuge step) or '+sv.specimen+' (centrifuge '+sv.spinMinutes+' min at '+sv.rcf+' rcf, transfer to a '+sv.container.toLowerCase()+'). Local practice for the BCCDC serology SST: clot, then centrifuge; send in the original SST, do not transfer serum.');
    if(!c.clotMinutes&&cl.clot)diff.push('Clotting: LifeLabs page has no clot step; BCCDC eLab: “'+cl.collection.find(x=>/clot/i.test(x))+'”');
    const pp=eb.patientPrep?'“'+eb.patientPrep+'” ':'',opt=eb.patientPrep?'':' (optimal '+cl.optimal+')';
    if(!c.volume)diff.push('Volume: LifeLabs page states none ('+c.container+'); BCCDC eLab: '+pp+cl.specimen+' min '+cl.min+opt+'.');
    else diff.push('Volume: LifeLabs page '+c.volume+' ('+c.container+'); BCCDC eLab: '+pp+cl.specimen+' min '+cl.min+opt+'.');
    // ui2: viral-load pages - centrifuge/separation, mixing, transport time limit
    if(c.centrifuge===true&&!eb.specimens.some(x=>x.centrifuge))diff.push('Centrifuging: LifeLabs page '+((c.notes||[]).filter(n=>/centrifug|separate/i.test(n)).map(n=>'“'+n+'”').join(' ')||'centrifuge')+'; BCCDC eLab: '+cl.specimen+' (Preferred, '+cl.container+') - no centrifuge or separation step printed.');
    {const lm=parseMix(e);if(eb.invert&&lm&&!eb.invert.includes(lm))diff.push('Mixing: LifeLabs page invert/mix '+lm+' times; BCCDC eLab: “'+eb.invert+'”.');}
    if(eb.transport||(eb.timeLimits||[]).length)diff.push('Transport: LifeLabs page '+(c.temp||'not stated')+' (no time limit printed); BCCDC eLab: '+[eb.transport,eb.noFreeze].concat(eb.timeLimits||[]).filter(Boolean).map(x=>'“'+x+'”').join(' ')+'.');
    if(c.temp)diff.push('Storage/transport: LifeLabs page '+c.temp+'; BCCDC eLab “'+eb.shipping+'”.');}
  if(e&&e.turnaroundTime)diff.push('Turnaround: LifeLabs page '+e.turnaroundTime+'; BCCDC eLab '+[].concat(eb.turnaround).join(' / ')+'.');
  {const num=(eb.requisition||'').match(/PHRQ_[A-Z]+_\d+F/);const lf=e?RF.formOfName(e.form||((c&&c.form)||'')):null; // ui2
   const rd=num&&RF.redirectFor?RF.redirectFor(num[0],(u&&u.ids)||[]):null;
   if(rd&&lf&&lf.id===rd.to)redir=el('div',{class:'fact'},el('b',{text:'Requisition: '}),'the eLab page names “'+eb.requisition+'”; the '+rd.from.display+' says ('+rd.section+' section): “'+rd.text+'” - '+lf.display+' used. ',el('span',{class:'small',text:'Source: '+rd.source+' · checked '+rd.lastChecked}));
   else if(e&&num&&(!lf||lf.number!==num[0]))diff.push('Requisition: LifeLabs page '+(e.form?'“'+e.form+'”':'names no form')+'; BCCDC eLab: “'+eb.requisition+'”.');}
  const nom=e?(e.additionalInfo||[]).concat(e.requisitionNotes||[]).find(x=>/nominal/i.test(x)):null;
  if(nom)diff.push('Non-nominal reporting: LifeLabs page “'+nom+'”; the BCCDC eLab page prints no nominal/non-nominal note.');
  if(diff.length){const dl=el('ul');for(const x of diff)dl.appendChild(el('li',{text:x}));b.appendChild(el('div',{class:'fact caveat'},'BCCDC eLab vs LifeLabs page differ - BCCDC applies (BCCDC-bound test):',dl));}
  // ui2 (2026-10-11): non-blood site rows - LifeLabs pages / guides differences, Details only (quiet, not a caveat)
  if(eb.siteSpecimens&&u&&secondary){const r=elabRow(eb,u);if(r)b.appendChild(el('div',{class:'fact'},el('b',{text:'Row for this test: '}),r.specimen+' - '+r.container+(r.restriction?' (printed: “'+r.restriction+'”)':'')));
    }
  if(eb.siteSpecimens&&u&&!secondary){const sp=elabRow(eb,u),lc=e&&e.collect.find(x=>x.kind!=='blood'),nd=[],lr=specRule(u);
    if(sp&&lc){nd.push('Container/kit: LifeLabs page “'+lc.container+'”; BCCDC eLab '+qq(sp.kit)+' ('+sp.label+')'+(lr?'; local practice: '+lr.container+' (no Aptima transfer in community)':'')+'.');
      if(lc.volume)nd.push('Volume: LifeLabs page '+lc.volume+'; BCCDC eLab Optimal: '+sp.optimal+'.');
      if(lc.temp)nd.push('Storage: LifeLabs page '+lc.temp+'; BCCDC eLab '+(sp.storage?sp.storage.map(qq).join(' '):'not stated for this site')+'.');}
    if(e&&(e.patientPrep||[]).length)nd.push('Patient prep: LifeLabs page '+e.patientPrep.map(qq).join(' ')+'; BCCDC eLab '+(sp&&sp.prep?qq(sp.prep):'none printed for this site')+'.');
    for(const g of guidesFor(u)){for(const x of (g.timeLimits||[]).filter(x=>u.ids.some(i=>x.ids.includes(i))))nd.push('Time limit: '+guideRef(g)+' “'+x.text+'”; BCCDC eLab '+(sp&&sp.timeLimits.length?sp.timeLimits.map(qq).join(' ')+(lr?' (lab-side under local practice)':''):'none for this site')+'.');
      if(g.id==='bccdc_sti_quickref')for(const k of Object.values(g.kits).filter(k=>u.ids.some(i=>k.ids.includes(i))))nd.push('BCCDC Quick Reference (May 2026): “'+k.kit+'”'+(/Unisex/.test(k.kit)?' - treated as superseded (K. Williams 2026-10-11: the guide\'s photo shows a Multitest swab)':'')+'.');}
    const rq=e?(e.requisitionNotes||[]).concat((e.preTestPrep||[]).filter(x=>/requisition/i.test(x))).filter((x,i,a)=>a.indexOf(x)===i):[];
    nd.push('Requisition: LifeLabs page '+(rq.length?rq.map(qq).join(' '):(e&&e.form?qq(e.form):'names no form'))+'; BCCDC eLab '+qq(eb.requisition)+'. The app lists this sample under the BCCDC requisition, so its paperwork line differs from the LifeLabs page.');
    const dl=el('ul');for(const x of nd)dl.appendChild(el('li',{text:x}));b.appendChild(el('div',{class:'fact'},'LifeLabs pages / guides differ - BCCDC eLab applies (BCCDC-bound test; K. Williams standing rule 2026-10-11):',dl));}
  if(redir)b.appendChild(redir); // ui2 2026-10-11
  b.appendChild(el('div',{class:'src'},'Source: '+ELAB.source+' (public view; page printed and supplied by K. Williams, checked '+ELAB.lastChecked+') · ',elabLink(eb),' - search “'+eb.title+'” ',el('span',{class:'unv',title:'No per-test URL is printed on the eLab page',text:'handbook home, not a per-test link'})));
  return b;}
/* ui2 (2026-10-11): what a collection guide says for this test (verbatim; source line with issuer / title / doc number / version / date) */
function guideBlock(g,u){const b=el('div',{class:'elab-block guide-block'},el('div',{class:'tname',text:g.issuer?g.issuer+' - '+g.title:g.title}));const ids=u.ids;const L=[];
  if(g.sites)for(const i of ids)if(g.sites[i])L.push(g.sites[i].site+': '+g.sites[i].device.join('; ')+' - '+g.sites[i].steps.join('; ')+(g.sites[i].comments.length?' - '+g.sites[i].comments.join(' '):''));
  if(g.kits)for(const k of Object.values(g.kits))if(ids.some(i=>k.ids.includes(i)))L.push(k.name?(k.name+(k.use?' - '+k.use:'')+(k.not?' - '+k.not:'')):(k.test+' · '+k.sites+' · '+k.kit));
  if(g.rows)for(const r of g.rows)L.push(r.order+': '+r.cells.join(' OR '));
  const uri=ids.some(i=>/urine/.test(i)),swb=ids.some(i=>!/urine/.test(i)); // storage lines: only the specimen type(s) in this unit
  for(const x of (g.share||[]).concat((g.storage||[]).filter(x=>/urine/i.test(x)?uri:/swab/i.test(x)?swb:true)))L.push(x);
  if(g.specimenRows){if(g.testIncludes)L.push('Test Includes: '+g.testIncludes);if(g.alternateNames)L.push('Alternate Names: '+g.alternateNames);if(g.quickTip)L.push('Quick Tip: '+g.quickTip);
    for(const r of g.specimenRows)L.push(r.specimen+': '+r.container+' · '+g.volume+' · '+g.volumeMin+(r.collection?' - '+r.collection:''));
    L.push('Requisition(s): '+g.requisition+' · Turnaround Time: '+g.turnaround+' · Time Accepted: '+g.timeAccepted);}
  if(g.labelling)L.push('Label: '+g.labelling.join('; '));
  if(g.transport)L.push('Transport to: '+g.transport);if(g.additionalInfo)L.push('Additional Information: '+g.additionalInfo);
  if(g.urineNote&&ids.some(i=>/ct_ng_(vaginal|urine)/.test(i)))L.push(g.urineNote);
  if(L.length){const ul=el('ul',{class:'verbatim'});for(const x of L)ul.appendChild(el('li',{text:x}));b.appendChild(ul);}
  if(g.scopeNote)b.appendChild(el('div',{class:'small',text:g.scopeNote}));
  if(g.supersededNote&&ids.some(i=>/^ct_ng_/.test(i)))b.appendChild(el('div',{class:'small',text:g.supersededNote})); // CT/GC kit wording only
  for(const l of g.links||[])b.appendChild(el('div',{class:'small'},'Linked in the document: ',el('a',{href:l.url,target:'_blank',rel:'noopener noreferrer',class:'srclink',text:l.text})));
  b.appendChild(el('div',{class:'src',text:'Source: '+guideRef(g)+(g.issuerBasis?' ('+g.issuerBasis+')':'')+(g.issuerNote?' ('+g.issuerNote+')':'')+' · supplied by K. Williams, checked '+GD.lastChecked+' · '+(g.url?g.url:'no web address printed in the document')}));
  return b;}
const STANDING=()=>LR.rules.filter(r=>r.kind==='standing');
function localTag(r){if(r.sourceUrl)return el('span',{class:'local-tag'},el('a',{href:r.sourceUrl,target:'_blank',rel:'noopener',text:r.source}),', ',el('span',{class:'nw',text:r.date})); /* turn 34 */ return el('span',{class:'local-tag'},'Local practice · '+r.source+', ',el('span',{class:'nw',text:r.date}));}

function render(host,items,opts){ // ui2: legacy full renderer, used as the source of every 'Details & sources' block (js/plan_view.js)
  opts=opts||{};opts.answers=opts.answers||{};
  const y=typeof window!=='undefined'?window.scrollY:0;
  host.innerHTML='';const {units,known,chartOnly,unknown}=resolve(items);const RS=ruleStates(units,opts.answers);const P=plan(units);
  const live=units.filter(u=>!u.excludedBy);
  const confirmedIds=new Set(items.map(i=>i.id).filter(Boolean));
  const rerender=()=>{if(opts.rerender)return opts.rerender();render(host,items,opts);if(typeof window!=='undefined')window.scrollTo(0,y);};
  host.appendChild(el('div',{class:'sum-head','data-part':'head'},el('h2',{text:'Collection summary'}),
    el('div',{class:'small',text:items.length+' confirmed test'+(items.length===1?'':'s')+' · '+known.length+' with full LifeLabs entry · '+chartOnly.length+' tube from chart/form/local rule only · '+unknown.length+' without info'})));

  // 0. local practice questions (e.g. PTT on heparin) - before anything else
  for(const st of RS){const r=st.rule;
    if(st.refer){const ef=st.effect;const amb=ef.severity==='amber';const q=el('div',{class:'sum-card local','data-part':'question'},el('h3',{text:(amb||st.rule.redirect)?'Redirect to LifeLabs':'Refer - not collected in community'}),
        el('div',{class:'redstop'+(amb?' amberstop':'')},el('div',{class:'redstop-h',text:(amb?'⚠ ':'⛔ ')+ef.title}),el('div',{text:ef.text})));
      const qe=r.quoteFrom&&DATA.entries.find(x=>x.id===r.quoteFrom.entry);
      const qt=qe&&[].concat(qe.preTestPrep||[],qe.additionalInfo||[]).filter(x=>x.includes(r.quoteFrom.match));
      if(qt&&qt.length){const u=units.find(u=>u.entry===qe);q.appendChild(el('div',{class:'fact'},el('b',{text:'LifeLabs page '+qe.title+' (published '+qe.lastPublished+'): '}),qt.map(x=>'“'+x+'”').join(' ')));
        q.appendChild(el('div',{class:'small'},'LifeLabs page: ',u?srcLink(u,qe.title):qe.title,' ',u?unvTag(u):''));}
      q.appendChild(el('div',{class:'small',text:'Why: '+r.rationale}));
      q.appendChild(el('div',{class:'src'},localTag(r),' - not LifeLabs data'));q.__st=st;host.appendChild(q);continue;}
    const q=el('div',{class:'sum-card local','data-part':'question'},el('h3',{text:'Question before collecting'}),el('div',{class:'q',text:r.question+' ('+r.appliesTo.map(dictName).join(', ')+')'}));
    const seg=el('div',{class:'seg',role:'group'});
    for(const a of r.answers){const b=el('button',{type:'button',class:'segbtn'+(st.answer===a.v?' on':''),'aria-pressed':String(st.answer===a.v),'data-rule':r.id,'data-v':a.v,text:a.label});
      b.addEventListener('click',()=>{opts.answers[r.id]=a.v;rerender();});seg.appendChild(b);}
    q.appendChild(seg);
    const ef=st.effect;
    if(ef.severity==='red')q.appendChild(el('div',{class:'redstop'},(ef.title?el('div',{class:'redstop-h',text:'⛔ '+ef.title}):null),el('div',{text:(ef.title?'':'⛔ ')+ef.text})));
    else if(ef.text)q.appendChild(el('div',{class:'fact '+(ef.severity==='ask'?'caveat':'okline'),text:ef.text}));
    if(r.answers.some(a=>a.as))q.appendChild(el('div',{class:'small',text:r.answers.filter(a=>a.as).map(a=>a.label+' is treated as '+r.answers.find(x=>x.v===a.as).label).join('; ')+'.'}));
    q.appendChild(el('div',{class:'src'},localTag(r),' - not LifeLabs data'));
    q.__st=st;host.appendChild(q);}

  // 1. time-critical / do-not-centrifuge banners
  const hidden=(u,s)=>(u.localNotes||[]).some(st=>st.effect.hideStability&&new RegExp(st.effect.hideStability,'i').test(s.text+' '+(s.when||'')));
  const crit=[];for(const u of live.filter(u=>u.entry))for(const s of u.entry.stability||[])if(s.critical&&!hidden(u,s))crit.push({u,s});
  for(const o of P.nonBlood)for(const x of o.timeLimits||[])crit.push({u:o.members[0].unit,s:{text:x.text,critical:true,src:x.g.elab?'BCCDC eLab Handbook - '+x.g.title:guideRef(x.g)}}); // ui2
  for(const u of live){const t=P.blood.find(t=>t.members.some(m=>m.unit===u));for(const x of (t&&t.timeLimits)||[])if(elabOf(u)===x.eb)crit.push({u,s:{text:x.text,critical:true,src:'BCCDC eLab Handbook - '+x.eb.title}});} // ui2
  if(crit.length){const b=el('div',{class:'sum-card crit','data-part':'crit'},el('h3',{text:'⏱ Time-critical / fill requirements'}));const ul=el('ul');
    for(const {u,s} of crit)ul.appendChild(el('li',{},el('b',{text:u.name+': '}),s.text+(s.when?' (when '+s.when+')':'')+(s.src?' ('+s.src+')':'')));b.appendChild(ul);host.appendChild(b);}
  const nospin=P.blood.filter(t=>t.c.centrifuge===false);
  const nsMixed=P.blood.filter(t=>!t.handling&&t.c.centrifuge!==false&&((t.spinMixed&&t.spinMixed.nospin)||(t.partialSpin&&t.partialSpin.kind==='nospin')));
  if(nospin.length||nsMixed.length){const nb_=el('div',{class:'sum-card nospin','data-part':'nospin'},el('h3',{text:'⛔ Do NOT centrifuge'}));
    if(nospin.length)nb_.appendChild(el('div',{text:nospin.map(t=>t.label+(t.ofType>1?' #'+t.no:'')+' ('+t.members.map(memberLabel).join(', ')+')').join('; ')}));
    for(const t of nsMixed)nb_.appendChild(el('div',{text:t.label+(t.ofType>1?' #'+t.no:'')+' (BCCDC serology): LifeLabs pages say do NOT centrifuge for '+((t.spinMixed||{}).nospin||t.partialSpin.has).join(', ')+' - other tests in this tube differ or have no entry; see the amber note on the tube.'}));
    host.appendChild(nb_);}

  // amber cards first so they are never missed
  for(const it of unknown){host.appendChild(el('div',{class:'sum-card amber','data-part':'unknown','data-name':it.name},el('div',{class:'tname',text:'⚠ '+it.name+(it.id?'':' (unmatched)')}),
    el('div',{},el('b',{text:'No collection info yet'}),' - not on the LifeLabs Quick Reference Chart and no Lab Test Information entry. Check ',el('a',{href:DIR_URL,target:'_blank',rel:'noopener noreferrer',text:'tests.lifelabs.com'})),
    el('div',{class:'small',text:'Not included in the tube counts below.'})));}
  const banner=()=>host.appendChild(el('div',{class:'proto-banner','data-part':'banner',text:'Prototype - verify against current LifeLabs/BCCDC guidance before collecting.'}));
  if(!units.length){banner();return {known:0,chartOnly:0,unknown:unknown.length,blood:0,other:0,conflicts:[],ui:{units,known,chartOnly,unknown,RS,P,live,items}};}

  // 2. what to collect
  const wc=el('div',{class:'sum-card','data-part':'collect'},el('h3',{text:'What to collect'}));
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
      else if(t.spinInfo&&t.spinMixed)box.appendChild(el('div',{class:'fact small',text:'Per-test LifeLabs pages: '+t.spinInfo+'.'}));
      if(t.handling){const h=t.handling;box.appendChild(el('div',{class:'fact okline'},'✔ '+h.text+' ',localTag(h)));
        const es=t.elabSet;
        if(!h.centrifuge){const eb=(t.elab||[]).filter(Boolean);if(eb.length)box.appendChild(el('div',{class:'fact elab'},el('b',{text:'BCCDC eLab Handbook - '+eb.map(e=>e.title).join('; ')+': '}),'Clotted blood (Preferred). Shipping: “'+(eb[0].shipping||'')+'”'));}
        else if(es){const names=es.rows.map(r=>r.eb.title+' (Last Changed '+r.eb.lastChanged+')');
          // v3.7: tube card quotes only the clot and centrifuge sentences - no serum-transfer / sterile-tube wording (local practice: send
          // the original SST). The full verbatim eLab text is in each test's details below.
          if(es.same)box.appendChild(el('div',{class:'fact elab'},el('b',{text:'BCCDC eLab Handbook - '+names.join('; ')+(es.rows.length>1?' - same clot and centrifuge settings: ':': ')}),
            'Clot: “'+es.use.clotSentence+'” Centrifuge: “'+es.use.spinSentence+'”'));
          else{box.appendChild(el('div',{class:'fact elab'},el('b',{text:'BCCDC eLab Handbook - '+names.join('; ')+': '}),
              'Clot (longest, used): “'+es.use.clotSentence+'” ('+es.use.eb.title+') Centrifuge: “'+es.use.spinSentence+'”'));
            const dl=el('ul');for(const r of es.rows)dl.appendChild(el('li',{text:r.eb.title+': clot '+r.clot+', centrifuge '+r.spinMinutes+' min at '+r.rcf+' rcf'}));
            box.appendChild(el('div',{class:'fact caveat'},'⚠ BCCDC eLab entries for the tests in this tube differ on clot/centrifuge settings - the longer clot is shown'+(es.clotUnclear?' (clot times could not all be compared - check each)':'')+(es.spinDiff?'; centrifuge settings differ - confirm with BCCDC':'')+':',dl));}
          const ll=t.llSettings;
          box.appendChild(el('div',{class:'fact small',text:'Clot time and centrifuge settings: BCCDC eLab Handbook ('+es.rows.map(r=>r.eb.title).join('; ')+'; BCCDC-bound tube).'+(ll?' LifeLabs SST pages differ: clot ≥ '+ll.clotMinutes+' min, centrifuge '+ll.spinMinutes+' min at '+ll.rcf+' RCF ('+t.handlingFrom.join(', ')+').':'')}));
          const oth=t.members.filter(m=>!elabOf(m.unit)).map(m=>m.unit.name);if(oth.length)box.appendChild(el('div',{class:'fact small',text:'No BCCDC eLab Handbook entry in the app yet for: '+oth.join(', ')+'.'}));}
        else if(h.centrifuge)box.appendChild(el('div',{class:'fact small',text:t.handlingSettingsOk?'Clot time and centrifuge settings: LifeLabs Lab Test Information SST page for '+t.handlingFrom.join(', ')+'. No BCCDC eLab Handbook entry in the app yet for the tests in this tube.':'⚠ LifeLabs SST clot/centrifuge settings differ between pages - confirm settings with LifeLabs.'}));
        if(t.spinInfo&&t.llSpin)box.appendChild(el('div',{class:'fact small',text:'LifeLabs page text per test (see each test below): '+t.spinInfo+'.'}));}}
    if(t.elabPref&&!t.handling)for(const p of t.elabPref){const ss=[p.eb.invert,p.eb.transport,p.eb.noFreeze].concat(p.eb.timeLimits||[]).filter(Boolean);
      box.appendChild(el('div',{class:'fact elab'},el('b',{text:'BCCDC eLab Handbook - '+p.eb.title+' (Last Changed '+p.eb.lastChanged+'), '+p.sp.specimen+' (Preferred), '+p.sp.container+': '}),
        ss.length?ss.map(x=>'“'+x+'”').join(' '):'no collection instructions printed on the page; LifeLabs handling shown where the eLab page is silent.'));}
    if(g&&g.notes)for(const n of g.notes){if(n.kind==='butterfly')box.appendChild(el('div',{class:'fact butterfly',text:'🦋 '+n.text+' (LifeLabs chart)'}));}
    const facts=[];const sp=spinText(c);if(sp)facts.push(sp);if(c.temp)facts.push(c.temp);
    if((t.local&&t.local.destination==='BCCDC')||(!t.local&&t.kind==='blood'&&t.members.length&&t.members.every(m=>isComm(m.unit))&&!t.members.some(m=>m.c&&m.c.destination)))facts.push('Destination: BCCDC Public Health Laboratory (local practice: communicable disease tests go to BCCDC)');
    else if(t.kind==='blood'||c.destination){const known_=t.members.filter(m=>m.c);if(known_.length)facts.push('Destination: '+destLabel(c));}
    const onForm=m=>{const r=m.unit.route;if(!r||r.how==='lifelabs')return false;if(r.how==='bccdc')return !!(m.c&&m.c.destGroup==='PHL');if(r.how==='named')return !m.c||RF.formOfName(m.c.form||m.unit.entry.form)===r.form||m.c.destGroup==='PHL';return true;};
    const lform=t.local&&t.local.form?RF.forms.find(f=>f.id===t.local.form):null;
    const forms=lform?[lform.display]:uniq(t.members.map(m=>onForm(m)?m.unit.route.form.display:m.c&&(m.c.form||m.unit.entry.form)?formDisplay(m.c.form||m.unit.entry.form):null));
    if(forms.length)facts.push('Requisition: '+forms.join(' / '));
    const bags=uniq(t.members.filter(m=>m.c).map(m=>m.c.bag));if(bags.length)facts.push('Bag: '+bags.join(' / '));
    if(t.eb){const {eb,sp,local}=t.eb; // ui2 2026-10-11
      box.appendChild(el('div',{class:'fact elab'},el('b',{text:'BCCDC eLab Handbook - '+eb.title+' (Last Changed '+eb.lastChanged+'), '+sp.specimen+': '}),sp.container+' · Optimal: '+sp.optimal+' · Min: '+sp.min));
      box.appendChild(el('div',{class:'fact'},'Destination: BCCDC Public Health Laboratory - dropped off at LifeLabs, which forwards it (local practice) · Requisition: '+qq(eb.requisition)+' (BCCDC eLab Handbook; LifeLabs pages name the LifeLabs requisition - see below)'));
      box.appendChild(el('div',{class:'fact'},el('b',{text:'Storage: '}),sp.storage?sp.storage.map(qq).join(' '):'not stated for this site on the eLab page'+(sp.appNote?' - '+sp.appNote:'')));
      if(local){box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+local.text+' ',el('span',{class:'small',text:'('+local.source+', '+local.date+')'})));
        const ls=el('ul',{class:'verbatim'});for(const i of local.labSide)ls.appendChild(el('li',{text:sp.collection[i]}));
        box.appendChild(el('div',{class:'fact small'},el('b',{text:'Lab-side only (BCCDC eLab text, not done in community): '}),ls));
        if(sp.storage)box.appendChild(el('div',{class:'fact small',text:'The eLab room-temperature line is for the Aptima urine transport tube (after the lab transfer); the cup follows local practice below.'}));}
      for(const r of [{eb,sp}].concat(t.extraElab||[]))if(r.sp.restriction){const nm=dictName(r.sp.dictIds.find(i=>t.members.some(m=>m.unit.ids.includes(i)))||r.sp.dictIds[0]);
        box.appendChild(el('div',{class:'fact warn'},'Not for asymptomatic clients: '+nm+' - BCCDC tests it for symptomatic females only.'));
        box.appendChild(el('div',{class:'fact small',text:'BCCDC eLab Handbook - '+r.eb.title+' (Last Changed '+r.eb.lastChanged+'), specimen row: “'+r.sp.specimen+'”.'}));}
      for(const r of t.extraElab||[]){box.appendChild(el('div',{class:'fact elab'},el('b',{text:'BCCDC eLab Handbook - '+r.eb.title+' (Last Changed '+r.eb.lastChanged+'), '+r.sp.specimen+': '}),r.sp.container+' · Optimal: '+r.sp.optimal+' · Min: '+r.sp.min+' · Requisition: '+qq(r.eb.requisition)+' · Storage: '+(r.sp.storage||[]).map(qq).join(' ')));
        if(t.shared)box.appendChild(el('div',{class:'fact small',text:'Same specimen: follows LifeLabs guidance (Doc#31847, Doc.#49222; quoted below) - K. Williams 2026-10-11.'}));}
      if(sp.dictIds.some(i=>/vaginal|rectal|throat/.test(i)))box.appendChild(el('div',{class:'fact small'},'BCCDC eLab: '+qq(eb.swabNote)));
      box.appendChild(el('div',{class:'fact small',text:'LifeLabs Lab Test Information and guides (for reference - BCCDC eLab applies where they differ):'}));}
    if(t.cupRule)box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+t.cupRule.text+' ',el('span',{class:'small',text:'('+t.cupRule.source+', '+t.cupRule.date+')'})));
    for(const f of facts)box.appendChild(el('div',{class:'fact'+(/NOT centrifuge/.test(f)?' warn':'')},f));
    for(const k of (t.ll&&t.ll.kits)||[])box.appendChild(el('div',{class:'fact small'},el('b',{text:'LifeLabs kit: '}),k.name+(k.use?' - “'+k.use+'”':'')+(k.not?' - “'+k.not+'”':'')+' ('+guideRef(k.g)+')'));
    if(t.ll&&t.ll.steps){const st=t.ll.steps.site;const ul=el('ul',{class:'verbatim'});for(const x of st.device.map(d=>'Device: '+d).concat(st.steps,st.comments))ul.appendChild(el('li',{text:x}));
      box.appendChild(el('div',{class:'fact small'},el('b',{text:st.site+' ('+guideRef(t.ll.steps.g)+'):'}),ul));}
    for(const x of (t.ll&&t.ll.timeLimits)||[])box.appendChild(el('div',{class:'fact small',text:'Time limit ('+guideRef(x.g)+'): “'+x.text+'”'}));
    if(t.eb)box.appendChild(el('div',{class:'fact small',text:'Used for this sample (BCCDC eLab'+(t.eb.local?' + local practice':'')+'):'}));
    for(const k of t.kits||[])box.appendChild(el('div',{class:'fact'},el('b',{text:'Kit: '}),k.name+(k.label?' ('+k.label+')':'')+(k.use?' - “'+k.use+'”':'')+(k.not?' - “'+k.not+'”':'')+' ('+guideRef(k.g)+')'));
    if(!t.eb&&t.steps&&t.c&&t.c.volume){const m=t.steps.site.steps.join(' ').match(/(\d+(?:-\d+)?) ?mL/);if(m&&m[1]!==String(t.c.volume).replace(/\s*mL/i,''))
      box.appendChild(el('div',{class:'fact warn'},'Volume differs between sources: LifeLabs page “'+t.c.volume+'” vs '+(t.steps.g.docNumber||t.steps.g.title)+' “'+m[0]+'”.'));}
    if(t.steps){const st=t.steps.site;const ul=el('ul',{class:'verbatim'});for(const x of st.device.map(d=>'Device: '+d).concat(st.steps,st.comments))ul.appendChild(el('li',{text:x}));
      box.appendChild(el('div',{class:'fact'},el('b',{text:st.site+' ('+guideRef(t.steps.g)+'):'}),ul));}
    if(t.shared)for(let i=0;i<t.shared.ids.length;i++){const ev=t.shared.ev[i];const gg=x=>GD.entries.find(g=>g.id===x.guide);
      box.appendChild(el('div',{class:'fact'},el('b',{text:'Same specimen for '+dictName(t.shared.ids[i])+': '}),'“'+ev.quote+'” ('+guideRef(gg(ev))+')'+(ev.also?' · “'+ev.also.quote+'” ('+guideRef(gg(ev.also))+')':'')));}
    { const cr=LR.rules.find(r=>r.kind==='collector');if(cr&&/swab/i.test((t.c&&t.c.container)||'')){ // ui2 turn 11: who may collect which swab site (local practice)
        const st=uniq(t.members.flatMap(m=>m.unit.ids.map(i=>cr.sites[i]).filter(Boolean)));
        for(const k of st)if(cr.flags[k])box.appendChild(el('div',{class:'fact warn',text:cr.flags[k]}));
        if(st.length)box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+cr.text+' ',el('span',{class:'small',text:'('+cr.source+', '+cr.date+')'})));} }
    if(t.kitRule){box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+t.kitRule.text+' ',el('span',{class:'small',text:'('+t.kitRule.source+', '+t.kitRule.date+')'})));
      box.appendChild(el('div',{class:'fact small',text:'Sources differ on the swab: LifeLabs page container “'+t.c.container+'”; local practice follows the BCCDC Quick Reference (“'+t.kits[0].name+'”).'}));}
    for(const sw of t.sharedWith||[]){if(!sw.rule){box.appendChild(el('div',{class:'fact'},el('b',{text:'Same container for '+sw.unit.name+' (LifeLabs page '+sw.from.entry.title+'): '}),'“'+sw.quote+'”'));continue;}
      box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+sw.rule.text+' ',el('span',{class:'small',text:'('+sw.rule.source+', '+sw.rule.date+')'})));
      if(sw.g)box.appendChild(el('div',{class:'small'},'Supporting wording - '+sw.g.issuer+', “'+sw.g.title+'” ('+sw.g.date+'): '+sw.g.share.map(q=>'“'+q+'”').join(' ')+' ',el('a',{href:sw.g.url,target:'_blank',rel:'noopener',text:'source'})));}
    for(const m of t.members)if(m.c&&m.c.cardWarn&&t.kind!=='blood'){const ho=LR.rules.find(r=>r.kind==='handOut'&&m.unit.entry&&r.entries.includes(m.unit.entry.id)); // ui2 turn 17/19 (FIT)
      if(!ho){box.appendChild(el('div',{class:'fact warn',text:'Check: LifeLabs page says “'+m.c.cardWarn.replace(/^\d+\.\s+/,'')+'”'}));continue;}
      box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+ho.text+' ',el('span',{class:'small',text:'('+ho.source+', '+ho.date+')'})));
      box.appendChild(el('div',{class:'fact small',text:'LifeLabs page says “'+m.c.cardWarn.replace(/^\d+\.\s+/,'')+'” (local practice: community nurses hand out the kit).'}));}
    if(t.companionFor){const r=t.companionFor.rule;box.appendChild(el('div',{class:'fact warn',text:r.missingText}));
      box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+r.text+' ',el('span',{class:'small',text:'('+r.source+', '+r.date+')'})));}
    for(const m of t.members)if(m.unit.companion){const r=m.unit.companion.rule;box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+r.text+' ',el('span',{class:'small',text:'('+r.source+', '+r.date+')'})));}
    if(t.drawLast)box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+t.drawLast.text+' ',el('span',{class:'small',text:'('+t.drawLast.source+', '+t.drawLast.date+')'})));
    if(t.cupOnly){box.appendChild(el('div',{class:'fact okline'},'✔ Local practice: '+t.cupOnly.text+' ',el('span',{class:'small',text:'('+t.cupOnly.source+', '+t.cupOnly.date+')'})));
      if(t.cupVol)box.appendChild(el('div',{class:'fact small',text:'Cup volume shown: '+guideRef(t.cupVol.g)+' “'+t.cupVol.quote+'” (the LifeLabs page’s Collection Volume “'+t.c.volume+'” is listed with the boric acid tube).'}));}
    if(t.pairNo)box.appendChild(el('div',{class:'fact'},el('b',{text:'Container #'+t.pairNo+' (LifeLabs page): '}),t.pairText.map(x=>'“'+x+'”').join(' ')));
    const labSide=t.cupOnly?uniq(t.members.flatMap(m=>(m.c&&m.c.notes)||[])).filter(n=>/boric|pour/i.test(n)):[];
    if(labSide.length){const ls=el('ul',{class:'verbatim'});for(const n of labSide)ls.appendChild(el('li',{text:n}));
      box.appendChild(el('div',{class:'fact small'},el('b',{text:'Lab-side only (LifeLabs page text, not done in community): '}),ls));}
    for(const n of uniq(t.members.flatMap(m=>(m.c&&m.c.notes)||[])))if(!labSide.includes(n)&&!/invert|draw 1 completely full tube/i.test(n)&&!((t.spinMixed||t.partialSpin||t.handling)&&/centrifuge/i.test(n)))box.appendChild(el('div',{class:'fact note-l',text:'“'+n+'”'}));
    for(const m of t.members){if(!m.c)continue;
      const ln=(m.unit.localNotes||[]);
      if(m.c.branchNote&&!ln.length)box.appendChild(el('div',{class:'fact caveat',text:'⚠ '+m.c.branchNote}));
      for(const st of ln)box.appendChild(el('div',{class:'fact okline'},'✔ '+m.unit.name+' - '+st.effect.text+' ',localTag(st.rule)));
      if(m.c.clotNote&&!t.handling)box.appendChild(el('div',{class:'fact caveat',text:'⚠ '+m.c.clotNote}));}
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
    box.__tube=t;wc.appendChild(box);}
  if(full.length&&P.blood.length)wc.appendChild(el('div',{class:'src','data-part':'fullnote'},'■ '+full.map(r=>r.detail).join(' ')+' ',...full.map(localTag)));
  host.appendChild(wc);

  // 2b. chart vs per-test differences
  if(P.conflicts.length){const cc=el('div',{class:'sum-card amber','data-part':'conflicts'},el('div',{class:'tname',text:'⚠ LifeLabs chart vs per-test entry differ - chart used'}));
    const l=el('ul');for(const x of P.conflicts)l.appendChild(el('li',{text:x}));cc.appendChild(l);cc.appendChild(el('div',{class:'small',text:'Confirm with lab.'}));host.appendChild(cc);}

  // 3. order of draw (general guidance only)
  if(P.blood.length){const od=el('div',{class:'sum-card','data-part':'order'},el('h3',{text:'Blood tube order'}));
    const ol=el('ol');for(const t of P.blood)ol.appendChild(el('li',{text:t.label+(t.ofType>1?' #'+t.no:'')+' - '+t.members.map(memberLabel).join(', ')}));od.appendChild(ol);
    const cit=P.blood.some(t=>t.css==='lblue');
    if(cit)od.appendChild(el('div',{class:'fact butterfly',text:'🦋 Citrate tube: when using a butterfly needle, collect a discard tube first (LifeLabs Quick Reference Chart).'}));
    od.appendChild(el('div',{class:'small',text:'Listed in the general CLSI GP41 order of draw (blood culture → light blue citrate → serum/SST → heparin → EDTA → fluoride). General guidance, not from LifeLabs; follow local policy.'}));
    host.appendChild(od);}

  // 4. patient prep
  const prep=[];for(const u of live.filter(u=>u.entry)){const es=elabSpec(u);if(es){if(es.prep)prep.push([u.name+' (BCCDC eLab Handbook)',qq(es.prep)]);continue;} // ui2: eLab site prep applies; LifeLabs prep in the eLab block
    for(const p of u.entry.patientPrep||[])prep.push([u.name,p]);}
  {const ep=new Map();for(const u of live){const eb=elabOf(u);if(eb&&eb.patientPrep){if(!ep.has(eb.patientPrep))ep.set(eb.patientPrep,[]);ep.get(eb.patientPrep).push(u.name);}}
   for(const [t,ns] of ep)prep.push([ns.join(', ')+' (BCCDC eLab Handbook)','“'+t+'”']);} // v3.7: identical eLab text shown once
  for(const it of items)for(const n of it.notes||[])if(/patient|instruction/i.test(n.type))prep.push([it.name+' (requisition)',n.text]);
  const pc=el('div',{class:'sum-card','data-part':'prep'},el('h3',{text:'Patient preparation'}));
  if(prep.length){const ul=el('ul');for(const [w,p] of prep)ul.appendChild(el('li',{},el('b',{text:w+': '}),p));pc.appendChild(ul);}
  else pc.appendChild(el('div',{class:'small',text:'No patient preparation stated in the LifeLabs entries for these tests.'}));
  if(chartOnly.length)pc.appendChild(el('div',{class:'fact caveat',text:'Not yet available for '+chartOnly.map(u=>u.name).join(', ')+' (no LifeLabs entry yet) - check Lab Test Information.'}));
  const docs=known.filter(u=>(u.entry.patientInstructionDocs||[]).length).map(u=>u.name);
  if(docs.length)pc.appendChild(el('div',{class:'small',text:'Printable patient instruction sheets (several languages) are listed in LifeLabs Lab Test Information for: '+docs.join(', ')+'.'}));
  host.appendChild(pc);
  // ui2 (2026-10-11): patient instruction sheets supplied by K. Williams (js/guide_data.js; key steps verbatim; PDFs not published)
  const pdocs=[];for(const u of live){for(const g of guidesFor(u).filter(g=>g.kind==='patient')){let d=pdocs.find(x=>x.g===g);if(!d)pdocs.push(d={g,units:[]});if(!d.units.includes(u))d.units.push(u);}}
  if(pdocs.length){const pi=el('div',{class:'sum-card','data-part':'pinstr'},el('h3',{text:'Patient instruction sheets'}));
    for(const d of pdocs){const g=d.g;pi.appendChild(el('div',{class:'tname',text:g.heading+' - for '+d.units.map(u=>u.name).join(', ')}));
      const ul=el('ul',{class:'verbatim'});for(const x of g.steps.concat(g.storage||[]))ul.appendChild(el('li',{text:x}));pi.appendChild(ul);
      if(g.kit)pi.appendChild(el('div',{class:'small',text:'Kit: '+g.kit}));
      pi.appendChild(el('div',{class:'src',text:'Source: '+guideRef(g)+(g.issuerBasis?' ('+g.issuerBasis+')':'')+' · supplied by K. Williams, checked '+GD.lastChecked+' · no web address printed on the sheet'}));}
    host.appendChild(pi);}

  // 5. processing + storage/transport
  const pr=el('div',{class:'sum-card','data-part':'proc'},el('h3',{text:'Processing, storage & transport'}));const ul=el('ul');
  for(const t of P.blood.concat(P.nonBlood)){const sp=spinText(t.c)||(t.spinMixed||t.partialSpin?'centrifuging: confirm with BCCDC/LifeLabs (see tube)':t.elabSpinConflict?'centrifuging: LifeLabs and BCCDC eLab differ - confirm with BCCDC (see tube)':'');
    const temps=t.local?uniq(t.members.flatMap(m=>(m.slots||[]).map(c=>c.temp))):[];
    const eShip=(t.elab||[]).length?uniq(t.elab.map(e=>'BCCDC eLab: “'+e.shipping+'”')).join(' / ')+(temps.length?' (LifeLabs pages: '+temps.join(' / ')+')':''):null;
    const txt=[sp,eShip||(t.local?temps.join(' / '):t.c.temp)].filter(Boolean).join(' · ');
    ul.appendChild(el('li',{class:t.c.centrifuge===false?'warn':''},el('b',{text:t.label+(t.ofType>1?' #'+t.no:'')+': '}),
      txt||((t.chartOnly||[]).length===t.members.length?'not yet available - check Lab Test Information':'see handling notes')));}
  pr.appendChild(ul);
  for(const u of live.filter(u=>u.entry))for(const s of u.entry.stability||[])if(!s.critical&&!hidden(u,s))pr.appendChild(el('div',{class:'fact',text:u.name+(s.text===u.entry.specimenStability?' - specimen stability: ':': ')+s.text}));
  {const fz=new Map();for(const u of live){const eb=elabOf(u);if(eb&&!eb.stability){const t=eb.specimens[0].collection.find(x=>/frozen/i.test(x));if(!t)continue;if(!fz.has(t))fz.set(t,[]);fz.get(t).push(u.name);}}
   for(const [t,ns] of fz)pr.appendChild(el('div',{class:'fact small',text:ns.join(', ')+' - BCCDC eLab Handbook: no stability times printed; “'+t+'”'}));} // v3.7: shown once
  host.appendChild(pr);

  // 6. paperwork & destination
  const pw=el('div',{class:'sum-card','data-part':'paper'},el('h3',{text:'Requisitions & destination'}));
  // requisition forms (e.g. BCCDC PHL Serology Screening Requisition) - from the form itself, plus names used on LifeLabs pages
  const HOW={local:'to BCCDC (local practice: communicable disease tests go to BCCDC)',named:'named on its LifeLabs page',bccdc:'BCCDC tube; LifeLabs page names no form - test is listed on this form, confirm',listed:'listed on this form (LifeLabs pages do not say which requisition) - confirm'};
  const byForm=new Map();
  for(const u of units){if(u.excludedBy&&u.excludedBy.effect.excludeFromTubes)continue;const r=u.route;if(!r||r.how==='lifelabs')continue;
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
  for(const u of live){const eb=elabOf(u);if(eb&&eb.requisitionNote&&P.blood.some(t=>(t.elab||[]).includes(eb)&&t.members.some(m=>m.unit===u)))rn.push([u.name+' (BCCDC eLab Handbook - '+eb.title+')',eb.requisitionNote]);} // ui2
  for(const t of P.blood.filter(t=>t.elabReq))pw.appendChild(el('div',{class:'fact caveat',text:t.members.map(m=>m.unit.name).join(', ')+': no requisition named on the LifeLabs page; the BCCDC eLab page ('+t.elabReq.p.eb.title+') names “'+t.elabReq.p.eb.requisition+'”'+(t.elabReq.form?', but this test is not listed on the '+t.elabReq.form.display:'')+' - confirm which requisition.'}));
  if(rn.length){const l=el('ul');for(const [w,r] of rn)l.appendChild(el('li',{},el('b',{text:w+': '}),r));pw.appendChild(el('div',{text:'Requisition notes:'}));pw.appendChild(l);}
  const dests=uniq(P.blood.concat(P.nonBlood).filter(t=>t.members.some(m=>m.c)).map(t=>destLabel(t.c)));if(dests.length)pw.appendChild(el('div',{class:'small',text:'Destinations: '+dests.join(' · ')}));
  const inter=[];for(const u of known){const e=u.entry;for(const o of e.orderNotes||[]){if(!o.ifAlsoOrdered.length||o.ifAlsoOrdered.some(i=>confirmedIds.has(i)))inter.push(u.name+': '+o.text);}
    for(const u2 of units){if(u2===u)continue;const ov=(e.includesDictIds||[]).filter(i=>u2.ids.includes(i));if(ov.length)inter.push('Possible overlap: '+u.name+' already includes '+u2.name+' - check the requisition for a duplicate order.');}
    for(const it of unknown){if((e.includesDictIds||[]).includes(it.id))inter.push('Possible overlap: '+u.name+' already includes '+it.name+' - check the requisition for a duplicate order.');}}
  if(inter.length){const l=el('ul');for(const s of uniq(inter))l.appendChild(el('li',{text:s}));pw.appendChild(el('div',{class:'fact caveat'},'⚠ Order notes:',l));}
  host.appendChild(pw);

  // 7. labelling
  const lab=el('div',{class:'sum-card','data-part':'label'},el('h3',{text:'Labelling'}));const L={};
  for(const u of known)for(const x of u.entry.labelling||[]){const k=x.replace(/\.$/,'').replace(/indentifier/,'identifier').toLowerCase();(L[k]=L[k]||{t:x.replace(/\.$/,''),w:new Set()}).w.add(u.name);}
  for(const [f,list] of byForm){const k=f.labelling.toLowerCase();(L[k]=L[k]||{t:f.labelling,w:new Set(),src:f}).w.add('__form');L[k].src=f;}
  const ll=el('ul');for(const k in L){const v=L[k];if(v.src){ll.appendChild(el('li',{},v.t+' ',el('span',{class:'small',text:'('+v.src.display+')'})));continue;}ll.appendChild(el('li',{text:v.t.replace(/^./,c=>c.toUpperCase())+(v.w.size<known.length?' ('+[...v.w].join(', ')+')':'')}));}
  if(Object.keys(L).length)lab.appendChild(ll);else lab.appendChild(el('div',{class:'small',text:'No labelling instructions in the LifeLabs entries for these tests.'}));
  if(chartOnly.length&&known.length)lab.appendChild(el('div',{class:'small',text:'Not yet available for tests without a LifeLabs entry: '+chartOnly.map(u=>u.name).join(', ')+'.'}));
  host.appendChild(lab);

  // 8. per-test cards
  const tc=el('div',{class:'sum-card','data-part':'tests'},el('h3',{text:'Tests'}));
  for(const u of units){const e=u.entry;const d=el('div',{class:'test-line'+(e?'':' chart-only')});
    d.appendChild(el('div',{class:'tname'},srcLink(u,e?e.name:u.name),' ',unvTag(u)||''));
    const asked=uniq(u.items.map(i=>i.name));if(asked.some(a=>a!==(e?e.name:u.name)))d.appendChild(el('div',{class:'small',text:'Confirmed as: '+asked.join('; ')}));
    if(u.excludedBy&&u.excludedBy.rule&&u.excludedBy.rule.redirect)d.appendChild(el('div',{class:'fact warn',text:'⛔ Redirect to LifeLabs - see the red card above.'})); /* turn 35: redirects red */
    else if(u.excludedBy&&u.excludedBy.effect.severity==='red')d.appendChild(el('div',{class:'fact warn',text:'⛔ Not collected in community - see the red card above.'}));
    else if(u.excludedBy&&u.excludedBy.effect.severity==='amber')d.appendChild(el('div',{class:'fact warn',text:'⚠ Redirect to LifeLabs - see the amber card above.'}));
    else if(u.excludedBy)d.appendChild(el('div',{class:'fact caveat',text:'Answer the question above first.'}));
    if(u.localTube){const lt=P.blood.find(t=>t.members.some(m=>m.unit===u));
      d.appendChild(el('div',{class:'fact'},el('b',{text:'Tube: '}),(lt?lt.label+(lt.ofType>1?' #'+lt.no:''):u.localTube.tube.label)+' - local practice ',localTag(u.localTube)));
      if(u.chart)d.appendChild(el('div',{class:'small',text:'LifeLabs chart (overridden by local practice): '+u.chart.group.tube.label+' (chart: '+u.chart.chartNames.join(', ')+')'}));}
    else if(u.chart){const g=u.chart.group;
      d.appendChild(el('div',{class:'fact'},el('b',{text:'Tube: '}),(((P.blood||[]).find(t=>t.members.some(m=>m.unit===u))||{}).label||g.tube.label)+(e?'':' - per LifeLabs Quick Reference Chart; full handling: check Lab Test Information'),' (chart: '+u.chart.chartNames.join(', ')+')'));
      if(u.chart.partial)d.appendChild(el('div',{class:'fact caveat',text:'⚠ '+u.chart.partial+' - confirm with lab.'}));}
    if(!e&&!u.chart&&!u.localTube&&u.route)d.appendChild(el('div',{class:'fact'},el('b',{text:'Tube: '}),u.route.spec.tube+' - per the '+u.route.form.display+' (“'+u.route.spec.combine+'”); not on the LifeLabs chart; full handling: check Lab Test Information / PHSA eLab Handbook'));
    if(u.route&&u.route.how!=='lifelabs')d.appendChild(el('div',{class:'small',text:'Requisition: '+u.route.form.display+' - “'+u.route.test.onForm+'” ('+u.route.test.section+')'}));
    if(!e){d.appendChild(el('div',{class:'fact caveat',text:u.localTube&&u.localTube.destination==='BCCDC'?'Processing, storage and transport details are not yet available for this test (destination BCCDC per local practice).':'Processing, storage, transport and destination details are not yet available for this test.'}));
      d.appendChild(el('div',{class:'src'},(u.chart?chartSrc():u.route?'Source: '+u.route.form.source+' · checked '+u.route.form.lastChecked:'Source: local practice, '+ruleSrc(u.localTube))+' · ',srcLink(u,'tests.lifelabs.com'),' ',unvTag(u)||''));d.__unit=u;tc.appendChild(d);continue;}
    const meta=[e.specimenType,e.discipline,e.frequency&&('Frequency '+e.frequency),e.turnaroundTime&&('TAT '+e.turnaroundTime)].filter(Boolean).join(' · ');d.appendChild(el('div',{class:'small',text:meta}));
    if(e.scopeNote&&!scopeOk(e,units))d.appendChild(el('div',{class:'fact caveat',text:'⚠ '+e.scopeNote+' (reviewer note, not LifeLabs text)'})); // v3.7: e.g. Electrolytes page = Na & K only
    for(const rid of e.relatedEntries||[]){const r=DATA.entries.find(x=>x.id===rid);if(!r)continue; // v3.7: ordering-rule pages (e.g. ELECTROLYTES EXTENDED PANEL)
      d.appendChild(el('div',{class:'fact small'},el('b',{text:'LifeLabs page '+r.title+' (published '+r.lastPublished+'): '}),(r.preTestPrep||[]).map(x=>'“'+x+'”').join(' ')));}
    const vv=k=>e.collect.filter(c=>c.volume&&!/full tube/i.test(c.volume)&&(c.kind==='blood')===k).map(c=>(c.tests&&e.collect.length>1?c.tests+': ':'')+c.volume);
    const mins=vv(true),nbv=vv(false); // ui2 2026-10-11: the full-tube rule is blood only
    if(mins.length)d.appendChild(el('div',{class:'small',text:'Lab minimum: '+mins.join(', ')+' (collect a full tube - local practice)'}));
    if(nbv.length)d.appendChild(el('div',{class:'small',text:'Collection volume (LifeLabs page): '+nbv.join(', ')}));
    if((e.includes||[]).length)d.appendChild(el('div',{class:'small',text:'Includes: '+e.includes.join(', ')}));
    const ht=P.blood.find(t=>t.handling&&t.members.some(m=>m.unit===u));
    if(ht){const cl=(e.handling||[]).filter(h=>/centrifug/i.test(h));
      d.appendChild(el('div',{class:'fact small'},el('b',{text:'LifeLabs page text: '}),(cl.length?cl.map(h=>'“'+h+'”').join(' '):'no centrifuge step on the LifeLabs page')+' - this tube is clotted, then centrifuged per local practice (see tube).'));}
    const det=el('details',{},el('summary',{text:ht?'LifeLabs page text - handling steps (verbatim)':'Handling steps (verbatim)'}));const hl=el('ul',{class:'verbatim'});for(const h of e.handling||[])hl.appendChild(el('li',{text:h}));det.appendChild(hl);
    if((e.preTestPrep||[]).length){det.appendChild(el('div',{class:'small',text:'Pre-test preparation:'}));const pl=el('ul',{class:'verbatim'});for(const h of e.preTestPrep)pl.appendChild(el('li',{text:h}));det.appendChild(pl);}
    d.appendChild(det);
    const amb=(e.ambiguities||[]).filter(x=>!/collection volume (is )?not stated/i.test(x));
    if(amb.length){const a=el('details',{class:'amb'},el('summary',{text:'⚠ Unclear in the directory entry ('+amb.length+')'}));const al=el('ul');for(const x of amb)al.appendChild(el('li',{text:x}));a.appendChild(al);d.appendChild(a);}
    elabsOf(u).forEach((eb,i)=>d.appendChild(elabBlock(eb,e,u,i>0)));
    for(const g of guidesFor(u).filter(g=>g.kind==='guide'))d.appendChild(guideBlock(g,u)); // ui2
    for(const g of guidesFor(u).filter(g=>g.kind==='elab-other-lab'))d.appendChild(el('div',{class:'small',text:'Hospital lab, reference only: '+g.issuer+' - eLab Handbook “'+g.title+'” ('+g.date+'). Not the lab community samples go to.'})); // ui2 turn 11
    d.appendChild(el('div',{class:'src'},srcLine(e)+(u.localTube?' · tube: local practice':u.chart?' · tube: '+TR.shortSource:'')+' · ',srcLink(u),' ',unvTag(u)||''));
    d.__unit=u;tc.appendChild(d);}
  host.appendChild(tc);
  banner();
  return {known:known.length,chartOnly:chartOnly.length,unknown:unknown.length,blood:P.blood.length,other:P.nonBlood.length,conflicts:P.conflicts,
    ui:{units,known,chartOnly,unknown,RS,P,live,excl,items,crit,prep,byForm,inter,L,rn,full,pdocs}};}

root.CollectionSummary={render,renderDetail:render,resolve,plan,ruleStates,BYDICT,elabSettings,helpers:{elabSpec,specRule,GD,guidesFor,guideRef,dictName,nominalMl,clotMin,isComm,elabOf,RF,LR,TR,DIR_URL,srcOf,srcLink,unvTag}};
})(typeof self!=='undefined'?self:this);
