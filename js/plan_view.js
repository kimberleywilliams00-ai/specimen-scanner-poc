/* ui2 (draft, not deployed): Collection plan view - PRESENTATION ONLY.
   Every rule, tube decision and piece of text still comes from js/summary.js (unchanged logic: resolve / ruleStates / plan and the
   full legacy renderer). This file renders the legacy summary into a detached element, builds a short glanceable plan from the same
   plan objects, and MOVES every legacy block into a collapsed 'Details & sources' expander next to the item it belongs to.
   Nothing is dropped: tools/ui2_lost_check (node/ui2_check.js) compares every legacy text node with the new page.
   Short labels below (test short names, tube colour names, plain-language prep/handling phrases) are display wording only. */
(function(root){
'use strict';
const CS=root.CollectionSummary;const H=CS.helpers;
function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}
  for(const k of kids)if(k!=null&&k!==false)e.appendChild(typeof k==='string'?document.createTextNode(k):k);return e;}
const uniq=a=>[...new Set(a.filter(Boolean))];

/* display short names (entry id first, then dictionary id); the full LifeLabs name is in Details */
const ENTRY_SHORT={creatinine:'Creatinine',electrolytes_na_k:'Lytes (Na, K)',electrolytes_cl_co2:'Cl, CO2',free_t4:'Free T4',hemoglobin_a1c:'A1c',
  hep_a_ab_igg_igm:'Hep A immune',hep_a_ab_igm:'Hep A IgM',hep_b_carrier:'Hep B carrier',hep_b_core_ab:'Anti-HBc',hep_b_screen:'Hep B screen',
  hep_b_surface_ag:'HBsAg',hepatitis_acute:'Acute hepatitis',hepatitis_c:'Hep C antibody',hiv_serology:'HIV serology',lipid_profile_full:'Lipids',
  ptt:'PTT',hcv_rna_quant:'HCV RNA',hiv_viral_load:'HIV viral load',syphilis_screen:'Syphilis',tsh:'TSH',urine_micro_if_indicated:'Urinalysis',cs_vag_chronic:'Vaginal C&S',
  c_diff:'C. difficile',infectious_diarrhea_panel:'Diarrhea panel (stool)',nt_probnp:'NT-proBNP',pth:'PTH',cd4_sph:'CD4',heme_interp:'Smear review',afp:'AFP',ck:'CK',psa:'PSA',hfe_confirm:'HFE',urine_pregnancy:'Urine pregnancy',fit_ll:'FIT',urea:'Urea',sodium:'Sodium',potassium:'Potassium',magnesium:'Magnesium',iron:'Iron',prothrombin_time:'INR',phosphorus:'Phosphorus',glucose:'Glucose',calcium:'Calcium',albumin:'Albumin',valproic_acid:'Valproic acid',hcv_genotype_ll:'HCV genotype',bilirubin_total:'Bilirubin',bilirubin_direct:'Direct bilirubin',bilirubin_indirect:'Indirect bilirubin',ferritin:'Ferritin',vitamin_b12:'B12',ast:'AST',alt:'ALT',ggt:'GGT',alp:'ALP',acr_urine:'Urine ACR',ct_gc_urine:'Chlamydia/GC urine',cs_urine:'Urine culture',cs_urine_if_indicated:'Urine culture if indicated',urine_macroscopic:'Urinalysis (dipstick)',urine_microscopic:'Urine microscopic',ct_gc_trich_self_vag:'CT/GC/Trich self-swab'};
const DICT_SHORT={cbc_diff:'CBC + diff',cbc:'CBC',alt_ast_ggt:'ALT, AST, GGT',hcv_rna_quant:'HCV RNA',hcv_genotype:'HCV genotype',hiv_vl:'HIV viral load',
  inr:'INR',d_dimer:'D-dimer',ptt:'PTT',esr:'ESR',crp:'CRP',ferritin:'Ferritin',b12:'B12',a1c:'A1c',lipids:'Lipids',acr:'Urine ACR',
  glucose_fasting:'Fasting glucose',glucose_random:'Glucose',drug_valproic:'Valproic acid',ct_ng_urine:'Chlamydia/GC urine',hbv_dna:'HBV DNA',
  hbeag:'HBeAg',hbsag:'HBsAg',hcv_screen:'Hep C antibody',syphilis:'Syphilis',hiv_serology:'HIV serology',fibrinogen:'Fibrinogen',
  ct_ng_rectal:'Chlamydia/GC rectal',ct_ng_throat:'Chlamydia/GC throat',ct_ng_vaginal:'Chlamydia/GC vaginal',ct_ng_cervix:'Chlamydia/GC cervix',
  ct_ng_urethra:'Chlamydia/GC urethra',urine_trich:'Trichomonas urine',culture_urine:'Urine culture',urine_macro_culture:'Urinalysis + culture',
  gc_culture_cervix:'GC culture cervix',gc_culture_urethra:'GC culture urethra',gc_culture_throat:'GC culture throat',gc_culture_rectum:'GC culture rectal',gc_culture_other:'GC culture (other site)'};
const VIA_SHORT={urine_trich:'Trichomonas'}; // ui2: test done on another test's specimen (source says shared)
function shortName(u){if(u.forCompanion)return u.forCompanion.reqName; /* turn 14 */if(u.entry&&u.entry.id==='hematology_panel')return u.ids.includes('cbc_diff')?'CBC + diff':'CBC';
  if(u.ids.includes('urine_macro_culture')&&!(u.entry&&ENTRY_SHORT[u.entry.id]))return DICT_SHORT.urine_macro_culture;
  if(u.entry){const via=u.ids.filter(i=>(u.entry.dictIdsVia||{})[i]);
    if(u.entry.perDictId||via.length===u.ids.length)return DICT_SHORT[u.ids[0]]||u.name;
    if(via.length)return (ENTRY_SHORT[u.entry.id]||u.name)+' + '+via.map(i=>VIA_SHORT[i]||DICT_SHORT[i]).join(' + ');}
  return (u.entry&&ENTRY_SHORT[u.entry.id])||DICT_SHORT[u.ids[0]]||u.name.replace(/\s*\(.*\)\s*$/,'');}
const COLOUR={gold:'Gold SST',lav:'Lavender EDTA',lblue:'Light blue citrate',red:'Red top',green:'Green heparin',grey:'Grey fluoride',yellow:'ACD A Yellow'};
/* ui2 (2026-10-11): container illustrations - Kimberley Williams' original artwork (img/containers/, see README). Shown ONLY where the
   container in the data clearly matches the drawing (tube type + colour + volume; kit name for swabs); otherwise no picture. */
const IMG_DIR='img/containers/';
const TUBE_IMG={'gold|5':['sst_gold_5ml','Gold SST 5 mL tube'],'gold|3.5':['sst_gold_3_5ml','Gold SST 3.5 mL tube'],'lav|6':['edta_lavender_6ml','Lavender EDTA 6 mL tube'],
  'lav|4':['edta_lavender_4ml','Lavender EDTA 4 mL tube'],'lblue|2.7':['citrate_light_blue_2_7ml','Light blue citrate 2.7 mL tube'],'red|6':['red_top_serum_6ml','Red top serum 6 mL tube'],'yellow|8.5':['acd_a_yellow_8_5ml','ACD-A yellow 8.5 mL tube']};
function thumbOf(t,nb){
  if(!nb){const m=H.nominalMl(t.label)||(t.group&&t.group.tube.sizeMl);const k=t.css+'|'+(m?(+m).toString():'');return TUBE_IMG[k]||null;}
  if(t.kitRule&&t.kitRule.img)return [t.kitRule.img,'COPAN green-top eSwab'];
  { const LRr=(typeof root.LocalRules&&root.LocalRules)||{rules:[]};const ho=LRr.rules.find(r=>r.kind==='handOut'&&(t.members||[]).some(m=>m.unit.entry&&r.entries.includes(m.unit.entry.id)));if(ho)return [ho.img,ho.alt]; } // turn 19: FIT Eiken (local practice)
  const kit=t.eb&&!t.eb.local?t.eb.sp.kit:'';const c=(t.label||'');
  if(/Multitest/.test(kit)||(!t.eb&&/Aptima Multitest/i.test(c)))return ['aptima_multitest_swab','Aptima Multitest swab kit'];
  if(/Unisex/.test(kit))return ['aptima_unisex_swab','Aptima Unisex swab kit'];
  if(/Copan Fecal/i.test(c))return ['copan_fecalswab_orange_cap','Copan FecalSwab container']; // LifeLabs 'Swab (Copan Fecal)'
  if(/urine/i.test(c)||(t.eb&&t.eb.local&&/urine/i.test(t.eb.local.container||'')))return ['urine_container_orange_cap','Urine container'];
  return null;}
function thumb(t,nb){const m=thumbOf(t,nb);return m?el('img',{class:'tc-thumb',src:IMG_DIR+m[0]+'.webp',alt:m[1],width:'40',height:'64',loading:'lazy',decoding:'async'}):null;}
function chip(css){return el('span',{class:'tchip '+(css||'none'),'aria-hidden':'true'});}
function sizeText(t){const m=H.nominalMl(t.label)||(t.group&&t.group.tube.sizeMl);return m?(+m).toString().replace(/\.0+$/,'')+' mL':'';}
function nonBloodName(o){const c=(o.label||'').toLowerCase();
  if(o.eb&&!o.eb.local){const k=o.eb.sp.kit;return (/Multitest/.test(k)?'Multitest swab':/Unisex/.test(k)?'Unisex swab':/Urine/.test(k)?'Aptima urine kit':k)+' ('+o.eb.sp.label+')';} /* ui2: BCCDC eLab kit */
  if(/urine/.test(c))return 'Urine cup'+(o.pairNo?' #'+o.pairNo+(o.pairNo===1?' - first catch':' - midstream'):'')+(/preservative/.test(c)&&!o.cupOnly?' + boric acid tube':'');if(o.kitRule)return o.kitRule.short; /* turn 11: local kit rule (GC culture eSwab) */
  if(/swab/.test(c)&&/amies/.test(c))return 'Amies swab (red cap)'; /* GC CULTURE page: 'Red cap, Liquid Amies Single Plastic Swab' */
  if(/swab/.test(c))return 'Swab'+(/copan|aptima/i.test(o.label)?' ('+o.label.replace(/^.*\((.*)\).*$/,'$1')+')':'');return o.label;}
/* plain temperature words (display only; the exact lab wording is in Details) */
function tempWord(t){const s=(t||'').toLowerCase();if(!s)return '';const r=/refrigerat|2-8/.test(s),rt=/room/.test(s),f=/froz/.test(s);
  if(r&&rt)return 'fridge or room temp';if(r)return 'refrigerate';if(rt)return 'room temp';if(f)return 'freeze';return t;}
function clotWord(c){if(c.clotText){const m=H.clotMin(c.clotText);return m?(m%60===0?(m/60)+' h':m+' min'):'';}return c.clotMinutes?c.clotMinutes+' min':'';}
/* ONE handling line per tube: clot/spin from the plan's tube settings, temperature from the lab entries */
function handling(t){const c=t.c||{};const out=[];let cls='';
  if(c.centrifuge===true){const cw=clotWord(c);if(cw)out.push('Clot '+cw);out.push('spin'+(c.spinMinutes?' '+c.spinMinutes+' min':''));}
  else if(c.centrifuge===false){out.push('Do not spin');cls='stop';}
  else if(t.spinMixed||t.partialSpin){out.push('Spin: check Details');cls='check';}
  else if(t.elabSpinConflict){out.push('Spin: check first');cls='check';} // ui2: LifeLabs spin+separate vs BCCDC eLab whole blood
  if(c.centrifuge!==true&&(t.members||[]).some(m=>(m.slots||[m.c]).some(x=>x&&(x.notes||[]).some(n=>/do not open tube/i.test(n)))))out.push('do not open');
  const cupQ=!!t.cupRule;if(cupQ)out.push(t.cupRule.temp.toLowerCase()+' (local practice)'); // ui2: local practice - urine cups always refrigerated
  const temps=t.hTemp||cupQ?[]:t.local?uniq((t.members||[]).flatMap(m=>(m.slots||[]).map(x=>x.temp))):uniq([c.temp]);
  if(t.hTemp)out.push('room temp (2–30 °C)'); // ui2: BCCDC eLab storage
  const tw=uniq(temps.map(tempWord));if(tw.length)out.push(tw.join(' / '));
  if((t.elabPref||[]).some(p=>p.eb.noFreeze))out.push('do not freeze');
  if((t.members||[]).some(m=>(m.slots||[m.c]).some(x=>x&&(x.notes||[]).some(n=>/protected from direct sunlight/i.test(n)))))out.push('protect from light'); // LifeLabs bilirubin pages
  if(!out.length)return {text:(t.chartOnly||[]).length?'Handling not in app yet - see Details':'',cls:'check'};
  const s=out.join(', ');return {text:s.charAt(0).toUpperCase()+s.slice(1),cls};}
/* ui2 (2026-10-11): Other samples - kit, short steps, time limit (verbatim text from js/guide_data.js; source in Details) */
function otherBits(t){const out=[];
  if(t.kits)out.push(el('div',{class:'tc-kit'},el('b',{text:t.kits.some(k=>k.local)?'Container: ':'Kit: '}),t.kits.map(k=>k.name+(k.label?' ('+k.label+')':'')).join(' + '),
    t.kits.some(k=>k.local)?el('span',{class:'tc-local',text:t.cupOnly?t.cupOnly.short:'Local practice: send the cup, no Aptima transfer.'}):null));
  if(t.cupVol)out.push(el('div',{class:'tc-kit'},el('b',{text:'Volume: '}),t.cupVol.text)); // ui2 turn 10: cup volume (source in Details)
  if((t.sharedWith||[]).some(x=>x.rule))out.push(el('div',{class:'tc-kit'},t.sharedWith.find(x=>x.rule).rule.short+' ',el('span',{class:'tc-local',text:'Local practice'})));
  else if((t.sharedWith||[]).length)out.push(el('div',{class:'tc-kit',text:'One cup for '+(t.members.length>2?'all '+t.members.length+' tests – put all the labels on it.':'both tests – put both labels on it.')})); // LifeLabs C&S page; quote in Details
  const cap=x=>x.charAt(0).toUpperCase()+x.slice(1);const swab=/swab/i.test(t.label||'');
  if(t.keySteps)out.push(el('ol',{class:'tc-steps'},...t.keySteps.map(fr=>el('li',{text:cap(fr.reduce((a,x)=>a?a+(/\.$/.test(a)?' ':'; ')+x:x,'').replace(/\.?$/,'.'))})),swab?el('li',{text:'Label with the site.'}):null)); // ui2: essential eLab steps; full text in Details
  else if(t.steps){const st=t.steps.site;out.push(el('ol',{class:'tc-steps'},...st.steps.map(x=>el('li',{text:x}))));}
  for(const x of t.timeLimits||[])out.push(el('div',{class:'tc-time',text:'Time limit: '+x.text}));
  return out;}
const isBCCDC=t=>t.dest==='BCCDC'||(t.local&&t.local.destination==='BCCDC')||(t.c&&t.c.destGroup==='PHL')||(t.kind==='blood'&&t.members.length&&t.members.every(m=>H.isComm(m.unit))&&!t.members.some(m=>m.c&&m.c.destination));
/* plain-language patient prep (display wording; verbatim text in Details) */
function prepShort(p){const s=p.replace(/^“|”$/g,'').replace(/^\d+\.\s+/,''); /* turn 15: drop list numbers ('1. Usual collection...') - display only */
  // K. Williams 2026-10-11: only show prep that needs an action; 'not required' lines stay in Details only
  if(/\bnot (?:required|needed|necessary)\b|\bno fasting\b/i.test(s))return null;
  if(/at least one hour after a meal/i.test(s))return 'Collect at least 1 hour after a meal';
  if(/mid-?stream/i.test(s))return 'Give mid-stream urine instructions';
  if(/not collect specimen during menses/i.test(s))return 'Not during menses';
  if(/must not have voided within the last hour|not have urinated for at least 1 hour/i.test(s))return 'No peeing for 1 hour before the sample';
  return s;}
/* ui2 (2026-10-12): condensed 'Before you start' prep (display wording only; every source sentence stays verbatim in Details).
   Each source sentence is split into fragments and each fragment mapped to a fact; a test shows each fact once (the most complete
   wording wins, e.g. a requisition note adding the first-catch volume). Tests whose instructions are identical share one line; a test
   whose instructions are those of another line plus one extra fact joins that line with the extra fact named. Unrecognised wording
   is shown as written (not reworded). No time limits are added here (time limits come only from the sources, shown above). */
function prepLabel(u){return shortName(u).replace(/^Chlamydia\/GC\b/,'CT/GC').replace(/\s+if indicated$/,'').replace(/\s*\([^)]*\)\s*$/,'')
  .replace(/^HIV serology$/,'HIV').replace(/^Hep C antibody$/,'Hep C');}
const PREP_FACTS=[ // [key, test, phrase, personal phrase (n = test name) or null]
  ['meal',/at least (?:one|1) hours? after a meal/i,'At least 1 hour after a meal.'],
  ['novoid',/not have voided within the last hour|not have urinated for at least (?:1|one) hour|(?:do not|don't|no) (?:void|urinat|pee)\w* for (?:at least )?(?:1|one) h/i,'No voiding for 1 hour.'],
  ['firstvol',/first\s+(\d+)\s*[-–]\s*(\d+)\s*ml/i,m=>'Collect the first '+m[1]+'–'+m[2]+' mL.'],
  ['midstream',/mid-?stream/i,'Mid-stream collection.'],
  ['menses',/during menses/i,'Not during menses.'],
  ['morning_rand',/first morning (?:specimen|sample) is preferr?ed,? but random (?:specimen |sample )?is acceptable/i,'First morning sample preferred; random is acceptable.',n=>n+' prefers a first morning sample (random is acceptable).'],
  ['morning',/first morning (?:specimen|sample) is preferr?ed/i,'First morning sample preferred.',n=>n+' prefers a first morning sample.']];
const SUPERSEDES={morning_rand:['morning']};
function prepFacts(text){const out=[];const s=text.replace(/^“|”$/g,'').replace(/^\d+\.\s+/,'');
  if(/\bnot (?:required|needed|necessary)\b|\bno fasting\b/i.test(s))return out; // K. Williams 2026-10-11: action-only; 'not required' stays in Details
  const frags=s.split(/;\s*|\.\s+(?=[A-Z0-9])|\.\.\.\s*/).map(x=>x.trim()).filter(Boolean);
  for(const f of frags){let hit=false;for(const [k,re,ph,pp] of PREP_FACTS){const m=f.match(re);if(!m)continue;
      if(k==='morning'&&PREP_FACTS[5][1].test(f))continue;hit=true;out.push({k,ph:typeof ph==='function'?ph(m):ph,pp:pp||null});}
    if(!hit&&!/^\s*\(?(?:see|refer)\b/i.test(f))out.push({k:'raw:'+f.toLowerCase().replace(/[.\s]+$/,''),ph:f.replace(/\.?$/,'.'),pp:null,raw:true});}
  return out;}
function prepVolRules(){const LR=root.LocalRules||{rules:[]},GD=root.GuideData||{entries:[]};
  return LR.rules.filter(r=>r.kind==='prepVolume'&&(()=>{const g=GD.entries.find(g=>g.id===r.quoteFrom.guide);return g&&JSON.stringify(g).includes(r.quoteFrom.match);})());}
function prepLines(U){const tests=new Map();const unitByName=n=>U.units.find(x=>x.name===n)||U.units.find(x=>(x.items||[]).some(it=>it.name===n));
  for(const [w,p] of U.prep){const isReq=/\(requisition\)$/.test(w);const who=w.replace(/ \(BCCDC eLab Handbook\)$/,'').replace(/ \(requisition\)$/,'');
    const us=isReq?[unitByName(who)]:who.split(', ').map(unitByName);const fs=prepFacts(p);if(!fs.length)continue;
    us.forEach((u,i)=>{const lab=u?prepLabel(u):(isReq?who:who.split(', ')[i]);if(!tests.has(lab))tests.set(lab,new Map());const m=tests.get(lab);
      for(const f of fs){if(!m.has(f.k)||f.ph.length>m.get(f.k).ph.length)m.set(f.k,f);}});}
  // turn 21: prepVolume local rule (K. Williams, LifeLabs Doc#31847) - the first-catch volume always comes from the quoted source
  for(const r of prepVolRules()){for(const [lab,m] of tests){const u=U.units.find(x=>prepLabel(x)===lab);if(u&&u.ids.some(i=>r.appliesTo.includes(i))&&m.has('novoid'))
      m.set('firstvol',{k:'firstvol',ph:'Collect the first '+r.volume+'.',pp:null});}}
  for(const m of tests.values())for(const [k,sub] of Object.entries(SUPERSEDES))if(m.has(k))for(const x of sub)m.delete(x);
  const ORDER=PREP_FACTS.map(f=>f[0]);const sig=m=>[...m.keys()].sort().join('|');
  const groups=[];for(const [lab,m] of tests){const g=groups.find(g=>sig(g.m)===sig(m));if(g)g.labels.push(lab);else groups.push({labels:[lab],m,extra:[]});}
  // a single-test group = another group's facts + extra personal facts -> join that group
  for(const g of [...groups]){if(g.labels.length!==1||g.extra.length)continue;
    const host=groups.find(h=>h!==g&&!h.extra.length&&h.m.size&&[...h.m.keys()].every(k=>g.m.has(k))&&g.m.size>h.m.size&&[...g.m.keys()].filter(k=>!h.m.has(k)).every(k=>g.m.get(k).pp));
    if(host){host.labels.push(g.labels[0]);host.extra.push(...[...g.m.keys()].filter(k=>!host.m.has(k)).map(k=>g.m.get(k).pp(g.labels[0].replace(/^Urine\s+/,''))));groups.splice(groups.indexOf(g),1);}}
  const ord=k=>{const i=ORDER.indexOf(k);return i<0?99:i;};
  return groups.map(g=>({label:g.labels.join(', '),text:[...[...g.m.entries()].sort((a,b)=>ord(a[0])-ord(b[0])).map(e=>e[1].ph),...g.extra].join(' '),
    raw:[...g.m.values()].some(f=>f.raw)}));}
/* short wording for red local-practice stoppers (display only; the full rule text is shown in Details) */
/* ui2 (2026-10-11): every test name links to its own source page (summary.js srcOf); opens in a new tab */
const nameLink=(u,text)=>H.srcLink(u,text||shortName(u),'tn');
function linkLead(text,us){for(const u of us){const n=shortName(u);if(text.startsWith(n))return [nameLink(u,n),text.slice(n.length)];}return [text];}
const REFER_SHORT={hiv_vl_refer_psc:'Community does not separate plasma. Send the client to the nearest LifeLabs Patient Service Centre with the requisition.'};
const STOP_SHORT={ptt_heparin_community:{yes:{title:'PTT: do not collect',text:'Needs double spin and freezing – not done in community. Send the client to a LifeLabs Patient Service Centre for the PTT.'}}};

function details(label,kids,opts){opts=opts||{};const d=el('details',{class:'dx'+(opts.cls?' '+opts.cls:'')},
    el('summary',{},opts.dot?el('span',{class:'adot',title:'Something to check inside','aria-label':'Something to check inside'}):null,label));
  const body=el('div',{class:'dx-body'});for(const k of kids)if(k)body.appendChild(k);d.appendChild(body);return d;}
const GLYPH=/^[\s]*(?:⚠️?|✔|ℹ|■|↻|🦋|⛔|⏱|🔁|📝)\s*/u;
/* drop decorative glyphs from legacy text inside Details (display only; the words are unchanged) */
function deglyph(root_){const w=document.createTreeWalker(root_,NodeFilter.SHOW_TEXT);const ns=[];while(w.nextNode())ns.push(w.currentNode);
  for(const n of ns)if(GLYPH.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(GLYPH,'');}
const normC=t=>/not yet available/i.test(t)?'__notyet':t.replace(GLYPH,'').replace(/^Confirm with lab - /,'').replace(/\s*\(reviewer note[^)]*\)\s*$/,'').replace(/\s*-\s*confirm with lab\.?$/i,'').replace(/^[^:]{1,60}:\s+/,'').replace(/[.\s]+$/,'').toLowerCase();
function moveCaveats(node,seen){const out=[];if(!node)return out;for(const c of [...node.children].filter(x=>x.classList.contains('caveat'))){
    const k=normC(c.textContent);if(seen){if([...seen].some(x=>x.includes(k)||k.includes(x))){c.classList.add('dup');continue;}seen.add(k);} // duplicate: stays in the test details
    out.push(c);c.remove();}return out;}
function checkList(nodes){if(!nodes.length)return null;const box=el('div',{class:'tocheck'},el('div',{class:'tocheck-h',text:'To check'}));for(const n of nodes){n.classList.add('tocheck-i');box.appendChild(n);}return box;}
function seg(st,rerender,opts){const r=st.rule;const g=el('div',{class:'seg2',role:'group','aria-label':r.question});
  for(const a of r.answers){const on=st.answer===a.v;const b=el('button',{type:'button',class:'seg2b'+(on?' on':''),'aria-pressed':String(on),'data-rule':r.id,'data-v':a.v,text:a.label});
    b.addEventListener('click',()=>{opts.answers[r.id]=a.v;rerender();});g.appendChild(b);}return g;}

function render(host,items,opts){
  opts=opts||{};opts.answers=opts.answers||{};
  const y=typeof window!=='undefined'?window.scrollY:0;
  const rerender=()=>{render(host,items,opts);if(typeof window!=='undefined')window.scrollTo(0,y);};
  const L=document.createElement('div');                       // legacy summary, detached (source of every Details block)
  const res=CS.renderDetail(L,items,Object.assign({},opts,{rerender}));const U=res.ui;
  const part=k=>L.querySelector('[data-part="'+k+'"]'),parts=k=>[...L.querySelectorAll('[data-part="'+k+'"]')];
  const tubeBox=new Map([...L.querySelectorAll('.tube')].map(b=>[b.__tube,b]));
  const testLine=new Map([...L.querySelectorAll('.test-line')].map(d=>[d.__unit,d]));
  for(const q of parts('question'))for(const s of q.querySelectorAll('.seg'))s.remove();    // answer buttons live in the new block
  host.innerHTML='';host.classList.add('ui2');
  const P=U.P;const blood=P.blood,nonBlood=P.nonBlood;
  host.appendChild(el('div',{class:'stephead'},el('div',{class:'step'},el('span',{class:'stepn',text:'2'}),'Collection plan'),
    el('div',{class:'stepsub',text:[blood.length?blood.length+' tube'+(blood.length>1?'s':''):'No blood tubes',nonBlood.length?nonBlood.length+' other sample'+(nonBlood.length>1?'s':''):null].filter(Boolean).join(' · ')})));

  const exLines=new Map();for(const [u,d] of testLine)if(u.excludedBy){if(!exLines.has(u.excludedBy.rule.id))exLines.set(u.excludedBy.rule.id,[]);exLines.get(u.excludedBy.rule.id).push(d);}
  const bysDet=[];const qdet=(q,st)=>{bysDet.push(q,...(exLines.get(st.rule.id)||[]));return null;};
  // ---- Before you start (only when needed) ----
  const bys=el('section',{class:'blk'},el('h2',{text:'Before you start'}));let need=false;
  for(const q of parts('question')){const st=q.__st,ef=st.effect;need=true;
    const names=st.rule.appliesTo.map(H.dictName).map(n=>n.replace(/\s*\(.*\)$/,'')).join(', ');
    const us=U.units.filter(u=>u.excludedBy===st||(u.localNotes||[]).includes(st)||u.ids.some(i=>st.rule.appliesTo.includes(i)));
    if(st.refer){bys.appendChild(el('div',{class:'stop'},el('div',{class:'stop-h'},...linkLead(ef.title,us)),el('div',{class:'stop-t',text:REFER_SHORT[st.rule.id]||ef.text}),qdet(q,st)));continue;}
    if(ef.severity==='red'){const sh=(STOP_SHORT[st.rule.id]||{})[st.answer]||(STOP_SHORT[st.rule.id]||{})[st.resolved]||{title:(ef.title||names+': do not collect'),text:ef.text};
      bys.appendChild(el('div',{class:'stop'},el('div',{class:'stop-h'},...linkLead(sh.title,us)),el('div',{class:'stop-t',text:sh.text}),
        el('div',{class:'qline',text:st.rule.question}),seg(st,rerender,opts),
        st.answer&&st.answer!==st.resolved?el('div',{class:'ask-t',text:(st.rule.answers.find(a=>a.v===st.answer)||{}).label+' is treated as '+((st.rule.answers.find(a=>a.v===st.resolved)||{}).label||st.resolved)+'.'}):null,qdet(q,st)));}
    else if(ef.severity==='ask'){bys.appendChild(el('div',{class:'ask'},el('div',{class:'ask-h',text:st.rule.question}),
        el('div',{class:'ask-t'},...linkLead(names+' is left out of the plan until you answer.',us)),seg(st,rerender,opts),qdet(q,st)));}
    else bys.appendChild(el('div',{class:'okq'},el('div',{class:'qline',text:st.rule.question}),seg(st,rerender,opts),el('div',{class:'ask-t',text:ef.text}),qdet(q,st)));}
  const tl=[];for(const {u,s} of U.crit)tl.push(el('li',{},el('b',{class:'red'},nameLink(u),' - time limit: '),s.text+(s.when?' (when '+s.when+')':'')));
  // ui2 (2026-10-12): condensed prep - one fact per meaning per test, tests with the same instruction merged; verbatim text stays in Details
  { const lines=prepLines(U);for(const l of lines)tl.push(el('li',{},el('b',{text:l.label+': '}),l.text)); }
  { const p1=nonBlood.find(t=>t.pairNo===1),p2=nonBlood.find(t=>t.pairNo===2); // ui2: both LifeLabs urine pages number the two containers
    if(p1&&p2)tl.push(el('li',{},el('b',{text:'Two urine cups: '}),'Mark the CT/GC cup #1 (first void, to the 30 mL line) and the culture cup #2 (midstream).'));}
  for(const r of prepVolRules())if(U.units.some(u=>u.ids.some(i=>r.appliesTo.includes(i)))){const g=(root.GuideData.entries.find(g=>g.id===r.quoteFrom.guide));
    bysDet.push(el('div',{class:'fact small'},el('b',{text:'Local decision ('+r.source+', '+r.date+'): '}),r.text+' Source: '+g.issuer+' '+g.docNumber+' (“'+g.title+'”): “'+r.quoteFrom.match+'”.'));}
  // patient instruction sheet references -> Details & sources (sheet text itself is in part('pinstr'))
  if((U.pdocs||[]).length)bysDet.push(el('ul',{class:'pdoc-refs small'},...U.pdocs.map(d=>el('li',{},el('b',{},...d.units.flatMap((u,i)=>i?[', ',nameLink(u)]:[nameLink(u)]),': '),
    'Patient instructions: '+(d.g.issuer||'LifeLabs')+' sheet '+(d.g.docNumber?d.g.docNumber+' ':'')+'(“'+d.g.title+'”).'))));
  if(tl.length){need=true;bys.appendChild(el('ul',{class:'prep'},...tl));}
  // (HIV viral load spin/separation 'check with BCCDC' box removed 2026-10-11: it came from the eLab HIV-1 NAT page, a different test)
  bysDet.push(...[part('crit'),part('prep'),part('pinstr')].filter(Boolean));
  if(need){if(bysDet.length)bys.appendChild(details('Details & sources',bysDet));host.appendChild(bys);}
  const bysLeft=need?[]:bysDet;

  // ---- Tubes in draw order ----
  const tb=el('section',{class:'blk'},el('h2',{text:'Tubes'},el('span',{class:'h2sub',text:' in draw order'})));
  for(const q of parts('unknown')){const nm=q.getAttribute('data-name');
    tb.appendChild(el('div',{class:'ask'},el('div',{class:'ask-h',text:nm+': no collection info in the app'}),
      el('div',{class:'ask-t'},'Check ',el('a',{href:H.DIR_URL,target:'_blank',rel:'noopener noreferrer',text:'tests.lifelabs.com'}),' for the tube or container. Not counted below.'),details('Details & sources',[q])));}
  const full=(U.full||[]).length>0;
  const numOf=new Map();blood.forEach((t,i)=>numOf.set(t,i+1));
  const card=(t,n,nb)=>{const box=tubeBox.get(t);const seen=new Set();const cav=moveCaveats(box,seen);
    const tests=t.members.map(m=>m.unit);const lines=tests.map(u=>testLine.get(u)).filter(Boolean);for(const d of lines)cav.push(...moveCaveats(d,seen));
    const warn=box?[...box.querySelectorAll('.fact.warn')].map(x=>x.textContent).filter(x=>!/NOT centrifuge/.test(x)):[];
    const h=handling(t);const bc=isBCCDC(t);
    const head=el('div',{class:'tc-head'},n?el('span',{class:'tnum',text:String(n)}):null,chip(t.css),
      el('span',{class:'tc-name',text:nb?nonBloodName(t):(COLOUR[t.css]||t.label)}),!nb&&sizeText(t)?el('span',{class:'tc-size',text:sizeText(t)}):null,
      bc?el('span',{class:'dest',text:'BCCDC'}):null);
    const meta=[];if(!nb&&t.kind==='blood'&&full)meta.push('Full tube');if(t.mix)meta.push('Mix '+t.mix.replace('-','–')+'×');
    const th=thumb(t,nb);if(th){const cp=head.querySelector('.tchip');if(cp)cp.remove();}
    const c=el('div',{class:'tcard'+(h.cls==='stop'?' nospin':'')+(th?' has-thumb':'')},th,head,meta.length?el('div',{class:'tc-meta',text:meta.join(' · ')}):null,
      el('div',{class:'tc-tests'},...tests.flatMap((u,i)=>i?[' · ',nameLink(u)]:[nameLink(u)])),
      h.text?el('div',{class:'tc-hand '+h.cls,text:h.text}):null,
      ...(nb?otherBits(t):[]),
      ...t.members.filter(m=>m.unit.companion).map(m=>el('div',{class:'tc-kit'},m.unit.companion.satisfied?m.unit.companion.rule.satisfiedNote:m.unit.companion.rule.note,' ',el('span',{class:'tc-local',text:'Local practice'}))), // turn 14: CD4 needs a CBC
      t.drawLast?el('div',{class:'tc-kit'},'Draw last ',el('span',{class:'tc-local',text:'Local practice'})):null, // turn 14: ACD yellow
      ...warn.map(w=>el('div',{class:'tc-warn'+(/^(Kit|Volume) differs|not covered by|^Open question|^Check: |^Requires STI certified|^Confirm whether|^Site not stated|^BCCDC eLab accepts|^Not for asymptomatic|^CBC not on the requisition/.test(w)?' amb':''),text:w.replace(/^PTT is NOT in this tube - see the question above\.?$/,'PTT is not in this tube (see Before you start)')})),
      details('Details & sources',[checkList(cav),box?el('div',{class:'dx-sub',text:'Lab wording & sources'}):null,box,lines.length?el('div',{class:'dx-sub',text:'Test details'}):null,...lines],{dot:cav.length>0}));
    return c;};
  for(const t of blood)tb.appendChild(card(t,numOf.get(t)));
  const tbDet=[part('banner'),part('head'),part('order'),part('nospin'),part('conflicts'),part('proc'),part('fullnote'),part('collect')].filter(Boolean).concat(bysLeft);
  const confl=part('conflicts');
  if(blood.length)tb.appendChild(details('Draw order, processing & sources',tbDet,{dot:!!confl,cls:'secdx'}));
  if(blood.length||parts('unknown').length)host.appendChild(tb);
  else if(tbDet.length){/* no blood tubes: keep legacy blocks reachable */}
  if(nonBlood.length){const ob=el('section',{class:'blk'},el('h2',{text:'Other samples'}));for(const o of nonBlood)ob.appendChild(card(o,null,true));host.appendChild(ob);}
  if(!blood.length&&tbDet.length)host.appendChild(el('section',{class:'blk'},details('Processing & sources',tbDet,{dot:!!confl,cls:'secdx'})));

  // ---- Paperwork ----
  const pw=el('section',{class:'blk'},el('h2',{text:'Paperwork'}));const rows=[];
  const all=blood.concat(nonBlood);const label=t=>numOf.has(t)?'tube '+numOf.get(t):nonBloodName(t).toLowerCase();
  const bag=b=>b.replace(/^BCCDC Biohazard specimen transport bag$/i,'BCCDC biohazard bag').replace(/^specimen transport bag$/i,'transport bag');
  const ll=all.filter(t=>!isBCCDC(t)),bc=all.filter(isBCCDC);
  const nbLabel=t=>/swab/i.test(t.label||'')?'swab ('+t.members.map(m=>shortName(m.unit).replace(/^Chlamydia\/GC /,'')).join(', ')+')':nonBloodName(t).toLowerCase();
  const lst=a=>{const tn=a.filter(t=>numOf.has(t)).map(t=>numOf.get(t)),ob=a.filter(t=>!numOf.has(t)).map(nbLabel);
    const parts=(tn.length?[(tn.length>1?'Tubes ':'Tube ')+tn.join(', ')]:[]).concat(ob);const s=parts.join(', ');return s.charAt(0).toUpperCase()+s.slice(1);};
  if(ll.length){const bags=uniq(ll.flatMap(t=>t.members.map(m=>m.c&&m.c.bag)).filter(Boolean).map(bag));
    rows.push(el('div',{class:'pwrow'},el('div',{class:'pw-h',text:'LifeLabs requisition'}),el('div',{class:'pw-t',text:lst(ll)+' → LifeLabs'+(bags.length?' · '+bags.join(' / '):'')})));}
  if(bc.length){const byF=new Map(),noF=[],byE=new Map();
    for(const t of bc.filter(t=>t.elabReq)){if(!byE.has(t.elabReq))byE.set(t.elabReq,[]);byE.get(t.elabReq).push(t);} // ui2: requisition named by the BCCDC eLab entry
    for(const t of bc.filter(t=>!t.elabReq)){const f=uniq(t.members.map(m=>m.unit.route&&m.unit.route.how!=='lifelabs'?m.unit.route.form:null).concat(t.local&&t.local.form?[H.RF.forms.find(f=>f.id===t.local.form)]:[]));
      if(f.length)for(const x of f){if(!byF.has(x))byF.set(x,[]);byF.get(x).push(t);}else noF.push(t);}
    const bagsOf=ts=>uniq(ts.flatMap(t=>t.members.map(m=>m.c&&m.c.bag)).filter(Boolean).map(bag));
    for(const [f,ts] of byF){const bags=bagsOf(ts);rows.push(el('div',{class:'pwrow'},el('div',{class:'pw-h',text:'BCCDC '+f.title}),el('div',{class:'pw-t',text:lst(ts)+' → drop at LifeLabs (forwarded to BCCDC)'+(bags.length?' · '+bags.join(' / '):'')})));}
    for(const [rq,ts] of byE){const m=rq.match(/^(.*?) - (\S+) (V[\d.]+) \((.*)\)$/);
      rows.push(el('div',{class:'pwrow'},el('div',{class:'pw-h',text:'BCCDC '+(m?m[1].replace(/ Req$/,' requisition')+' ('+m[2]+')':rq)}),el('div',{class:'pw-t',text:lst(ts)+' → drop at LifeLabs (forwarded to BCCDC)'+(ts.some(t=>!t.eb.local)?' · biohazard bag (in the Aptima kit)':'')})));}
    for(const t of noF)rows.push(el('div',{class:'pwrow'},el('div',{class:'pw-h check',text:'BCCDC: confirm requisition'}),el('div',{class:'pw-t',text:lst([t])+' ('+t.members.map(m=>shortName(m.unit)).join(', ')+') → BCCDC. '+
      (t.elabReq?'eLab names the '+(t.elabReq.form?t.elabReq.form.title:t.elabReq.p.eb.requisition)+(t.elabReq.form?', but the test is not listed on it.':'.'):'Requisition not in the app yet.')})));
    for(const t of bc.filter(t=>t.reqConflict))rows.push(el('div',{class:'pwrow'},el('div',{class:'pw-h check',text:'BCCDC: which requisition?'}),el('div',{class:'pw-t',text:lst([t])+' ('+t.members.map(m=>shortName(m.unit)).join(', ')+'): LifeLabs says Serology Screening; BCCDC eLab says Virology Requisition ('+((t.reqConflict.p?t.reqConflict.p:t.reqConflict).eb.requisition.match(/PHRQ_[A-Z]+_\d+F/)||[''])[0]+').'})));}
  const other=uniq(all.flatMap(t=>t.members.map(m=>m.c&&(m.c.form||(m.unit.entry&&m.unit.entry.form)))).filter(f=>f&&!H.RF.formOfName(f)));
  for(const f of other)rows.push(el('div',{class:'pwrow'},el('div',{class:'pw-h',text:f})));
  if(U.rn.some(([,r])=>/initials/i.test(r)))rows.push(el('div',{class:'pw-t',text:'Write your initials and the collection date and time on the requisition.'}));
  for(const r of rows)pw.appendChild(r);
  const paper=part('paper');const pwCav=paper?[...paper.querySelectorAll(':scope > .caveat')]:[];
  if(paper)pw.appendChild(details('Details & sources',[paper],{dot:pwCav.length>0}));
  if(rows.length||paper)host.appendChild(pw);

  // ---- Labelling (one line) ----
  const lab=part('label');const keys=Object.keys(U.L||{}).join(' ');
  if(keys||lab){const bits=[];if(/full name/.test(keys))bits.push('full name');if(/identifier/.test(keys))bits.push('second ID (DOB or health number)');if(/test name/.test(keys))bits.push('test name');
    let line=bits.length?'Every tube: '+bits.join(', ')+'.':'';const f=[...U.byForm.keys()];if(f.length)line+=(line?' ':'')+'BCCDC: 2 matching IDs on tube and requisition.';
    if(nonBlood.some(t=>/swab/i.test(t.label||'')&&t.steps))line+=(line?' ':'')+'Swabs: also the anatomic site and collection date/time (LifeLabs Doc#31847).';
    host.appendChild(el('section',{class:'blk'},el('h2',{text:'Labelling'}),line?el('div',{class:'pw-t',text:line}):null,lab?details('Details & sources',[lab]):null));}

  const ban=part('banner');if(ban&&ban.isConnected&&ban.parentNode===L)host.appendChild(el('section',{class:'blk'},details('Details & sources',[ban])));
  host.appendChild(el('div',{class:'foot',text:'Prototype - verify against LifeLabs/BCCDC. Sources: tap Details.'}));
  // anything the legacy renderer produced that has not been placed yet goes in a final expander (should be empty)
  const tcard=part('tests');if(tcard&&!tcard.querySelector('.test-line'))tcard.remove();
  const left=[...L.children];
  if(left.length)host.appendChild(details('Other details',left,{cls:'secdx'}));
  deglyph(host);
  return res;}

CS.render=render;CS.renderPlan=render;
})(typeof self!=='undefined'?self:this);
