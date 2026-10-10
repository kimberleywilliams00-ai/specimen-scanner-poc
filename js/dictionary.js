/* BC / LifeLabs outpatient test dictionary + fuzzy matcher + note extraction.
   Shared by browser app and Node evaluation. No I/O. */
(function(root){
'use strict';
// [id, display name, category, synonyms...]
const T=[
['cbc_diff','Complete Blood Count + Differential (CBC+Diff)','Hematology','CBC+Diff','CBC + Diff','Complete Blood Count + Diff','CBC with differential','Hematology profile','CBC and Diff'],
['cbc','Complete Blood Count (CBC)','Hematology','CBC','Complete Blood Count'],
['inr','INR (Prothrombin time)','Hematology','INR','PT INR','PT/INR','Prothrombin Time INR'],
['peripheral_smear','Peripheral Blood Smear','Hematology','Peripheral Smear','Blood film','Peripheral blood film'],
['ferritin','Ferritin','Hematology','Ferritin','Ferritin (query iron deficiency)'],
['iron_tibc','Iron and TIBC','Chemistry','Iron and TIBC','Iron & TIBC','Iron TIBC','Iron studies'],
['hfe','HFE Hemochromatosis (DNA)','Hematology','HFE Hemochromatosis','Confirm diagnosis (ferritin first, TS, DNA testing)'],
['ct_ng_urine','Chlamydia & Gonorrhea NAAT - Urine','Microbiology','Chlamydia & Gonorrhea Urine','Chlamydia and Gonorrhea Urine','CT GC Urine','Chlamydia Gonorrhea NAAT Urine'],
['ct_ng_rectal','Chlamydia & Gonorrhea NAAT - Rectal swab','Microbiology','Chlamydia & Gonorrhea NAAT: rectal swab','Chlamydia & Gonorrhea NAT: rectal swab','CT GC rectal swab'],
['ct_ng_throat','Chlamydia & Gonorrhea NAAT - Throat swab','Microbiology','Chlamydia & Gonorrhea NAAT: throat swab','Chlamydia & Gonorrhea NAT: throat swab','CT GC throat swab'],
['ct_ng_vaginal','Chlamydia & Gonorrhea NAAT - Vaginal swab','Microbiology','Chlamydia & Gonorrhea NAAT: vaginal swab','Chlamydia & Gonorrhea NAT: vaginal swab'],
['stool_culture','Stool Culture','Microbiology','Stool Culture'],
['c_diff','Stool - C. difficile','Microbiology','Stool: Clostridium Difficile - Culture','Clostridium Difficile','C. difficile testing','C diff toxin'],
['stool_op','Stool Ova & Parasite','Microbiology','Stool ova & parasite','Stool O&P','Stool ova & parasite exam'],
['hep_chronic','Chronic Viral Hepatitis - undefined etiology (HBsAg, anti-HBc, anti-HBs, anti-HCV)','Hepatitis serology','Hepatitis - Chronic Viral - Undefined Etiology (HBsAg, anti-HBc, anti-HBs; anti-HCV)','Hepatitis Chronic Viral Undefined Etiology','Chronic viral hepatitis undefined etiology'],
['hep_acute','Acute Viral Hepatitis - undefined etiology','Hepatitis serology','Acute viral hepatitis undefined etiology','Hepatitis - Acute Viral - Undefined Etiology'],
['hav_immune','Hepatitis A Immune Status (anti-HAV, total)','Hepatitis serology','Hepatitis A - Immune Status (anti-HAV, total)','Hepatitis A (anti-HAV, total)','Hepatitis A Immune Status'],
['hbv_immune','Hepatitis B Immune Status (anti-HBs)','Hepatitis serology','Hepatitis B (anti-HBs)','Hepatitis B - Immune Status (anti-HBs)','Hepatitis B Immune Status'],
['hbsag','Hepatitis B surface antigen (HBsAg)','Hepatitis serology','HBsAg','Hepatitis B surface antigen'],
['hbv_serology','Hepatitis B Serology','Hepatitis serology','Hepatitis B Serology'],
['hcv_screen','Hepatitis C Screening (anti-HCV)','Hepatitis serology','Hepatitis C - Screening (anti-HCV)','Hepatitis C Screening','anti-HCV','Hepatitis C antibody'],
['hcv_rna_quant','Hepatitis C RNA Quantitative','Hepatitis serology','HCV RNA Quantitative','Hepatitis C RNA Quantitative','Hepatitis C - Quantitative RNA','Hepatitis C RNA Quantitative - (Treatment Related)','HCV Viral Load','Hepatitis C Viral Load'],
['hcv_genotype','Hepatitis C Genotype/subtype','Hepatitis serology','Hepatitis C Genotype/subtype','HCV Genotype','Hepatitis C Genotype'],
['hiv_serology','HIV Serology','HIV','HIV Serology','HIV Test','HIV screen','HIV antibody'],
['hiv_vl','HIV Viral Load','HIV','Viral Load HIV','HIV Viral Load','HIV RNA'],
['cd4','T Cell Profile (CD4)','HIV','T Cell Profile (CD4)','CD4 count','T Cell Profile'],
['syphilis','Syphilis Serology (RPR/EIA)','Serology','Syphilis Serology (RPR) / EIA','Syphilis Serology','Syphilis EIA','RPR'],
['urine_trich','Urine Trichomonas','Microbiology','Urine Trichomonas','Trichomonas Urine','Trichomonas testing'],
['alp','Alkaline Phosphatase (ALP)','Chemistry','Alkaline Phosphatase','Alk phos','ALP'],
['alt','ALT','Chemistry','ALT'],
['ast','AST','Chemistry','AST'],
['ggt','GGT (Gamma GT)','Chemistry','GGT','Gamma GT'],
['alt_ast_ggt','ALT, AST, GGT','Chemistry','ALT , AST , GGT','ALT AST GGT','ALT, AST, GGT'],
['bilirubin','Bilirubin','Chemistry','Bilirubin','Total Bilirubin'],
['albumin','Albumin','Chemistry','Albumin'],
['calcium','Calcium','Chemistry','Calcium'],
['calcium_albumin','Calcium & Albumin','Chemistry','Calcium & Albumin','Calcium and Albumin'],
['creatinine','Creatinine / eGFR','Chemistry','Creatinine (GFR)','creatinine (egfr)','Creatinine/eGFR','Creatinine eGFR','Creatinine'],
['electrolytes','Electrolytes','Chemistry','Electrolytes','Lytes'],
['sodium','Sodium','Chemistry','Sodium'],
['potassium','Potassium','Chemistry','Potassium'],
['bicarbonate','Bicarbonate','Chemistry','Bicarbonate','Total CO2'],
['phosphorus','Phosphorus','Chemistry','Phosphorus','Phosphate'],
['magnesium','Magnesium','Chemistry','Magnesium'],
['urea','Urea','Chemistry','Urea','BUN'],
['glucose_random','Glucose - Random','Chemistry','Glucose Random','Glucose - random','Random Glucose'],
['glucose_fasting','Glucose - Fasting','Chemistry','Glucose Fasting','Glucose - fasting','Fasting Glucose'],
['a1c','Hemoglobin A1c','Chemistry','Hemoglobin A1c','HgbA1c','HbA1c','Hgb A1c','A1c'],
['lipids','Lipid Profile','Chemistry','Lipids','Lipid Profile','Full Lipid Profile','Lipid Profile Non Fasting- MSP (Total, HDL & LDL Cholesterol, Triglycerides)','Lipid Profile-MSP (Total, HDL & LDL Cholesterol, Triglycerides)','Lipid Profile Non Fasting','Lipid Profile MSP'],
['lipids_followup','Follow-up Lipid Profile','Chemistry','Follow-up Lipid Profile'],
['apob','Apo B','Chemistry','Apo B','Apolipoprotein B'],
['tsh_hypo','TSH +/- fT4 (suspected hypothyroidism)','Chemistry','Thyroid: Suspected hypothyroidism (TSH +/- fT4)','Thyroid: Suspected hypothyroidism','TSH +/- fT4 (suspected hypothyroidism)','TSH=/- fTS/T4 (suspected hypothyroidism)','Suspected Hypothyroidism','TSH +/- fT4'],
['tsh_hyper','TSH, fT4 +/- fT3 (suspected hyperthyroidism)','Chemistry','Suspected Hyperthyroidism','Thyroid: Suspected hyperthyroidism'],
['tsh_monitor','TSH (monitor thyroid therapy)','Chemistry','Thyroid: Monitor Therapy - TSH','Monitor thyroid replacement therapy (TSH Only)','TSH Only','TSH'],
['b12','Vitamin B12','Chemistry','Vitamin B12','B12'],
['ck','Creatine Kinase (CK)','Chemistry','CK','Creatine kinase (CK)','Creatine Kinase'],
['bnp','BNP / NT-proBNP','Chemistry','BNP','NT-proBNP','NT proBNP'],
['pth','PTH (Parathyroid hormone)','Chemistry','PTH','Parathyroid Hormone'],
['afp','Alpha Fetoprotein (AFP)','Chemistry','Alpha Fetoprotein','AFP','Alpha-fetoprotein'],
['total_protein','Total Protein','Chemistry','T. Protein','Total Protein'],
['psa','PSA','Chemistry','PSA','PSA - Known or suspected prostate cancer','PSA screening (self-pay)'],
['bhcg','Beta-hCG quantitative','Chemistry','B-HCG - quantitative','Beta HCG','hCG quantitative'],
['pregnancy','Pregnancy Test','Chemistry','Pregnancy Test'],
['acr','Urine Albumin/Creatinine Ratio (ACR)','Urine','Urine ACR','Urine ACR (Albumin Creatinine Ratio)','Albumin/creatinine ratio (ACR) - Urine','Urine Albumin Creatinine Ratio','ACR'],
['urine_macro_micro','Urinalysis: Macroscopic +/- Microscopic','Urine','Urine - Macro +/- Micro (if Macroscopic positive)','Urine Macro Micro','Macroscopic microscopic if dipstick positive'],
['urine_macro_culture','Urinalysis: Macroscopic -> Urine Culture if pyuria/nitrite','Urine','Urine: Macroscopic--Urine Culture if pyria or nitrite present','Urine Macroscopic Urine Culture','Macroscopic urine culture if pyuria or nitrite present','Urine Culture'],
['urinalysis','Urinalysis','Urine','Urinalysis','Urine R&M','Urine Routine'],
['drug_valproic','Drug Level: Valproic Acid','Chemistry','Drug Level: Valproic Acid','Valproic Acid','Valproic Acid level'],
['ecg','ECG','Other','ECG','EKG'],
['fit','FIT (fecal immunochemical test)','Other','FIT','Fecal immunochemical test'],
];
const HEADERS=['HEMATOLOGY','MICROBIOLOGY','CHEMISTRY','OTHER TESTS','URINE TESTS','HEPATITIS SEROLOGY','HIV SEROLOGY'];
const STOP=['signature of practitioner','date signed','collector','date of collection','time of collection','telephone requisition','personal information','practitioner signature'];

function norm(s){
  return (s||'').toLowerCase()
   .replace(/[\u2014\u2013]/g,'-')
   .replace(/&/g,' and ')
   .replace(/\+\s*\/\s*-|=\s*\/\s*-/g,' plusminus ')
   .replace(/[^a-z0-9+ ]+/g,' ')
   .replace(/\s+/g,' ').trim();}
function lev(a,b){if(a===b)return 0;const m=a.length,n=b.length;if(!m)return n;if(!n)return m;
  let p=new Array(n+1),c=new Array(n+1);for(let j=0;j<=n;j++)p[j]=j;
  for(let i=1;i<=m;i++){c[0]=i;const ai=a.charCodeAt(i-1);for(let j=1;j<=n;j++){c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(ai===b.charCodeAt(j-1)?0:1));}[p,c]=[c,p];}
  return p[n];}
function sim(a,b){if(!a.length&&!b.length)return 1;return 1-lev(a,b)/Math.max(a.length,b.length);}
const ENTRIES=[];for(const r of T){for(const syn of r.slice(3)){ENTRIES.push({id:r[0],syn:norm(syn)});}}
const BYID={};for(const r of T)BYID[r[0]]={id:r[0],name:r[1],category:r[2]};

/* match(text) -> {id,name,category,score,matched} best candidate (+ runner-up) */
function match(text,restrictIds){
  const t=norm(text);if(!t)return null;const tt=t.split(' ');
  let best=null,second=null;
  for(const e of ENTRIES){if(restrictIds&&!restrictIds.has(e.id))continue;
    let s=sim(t,e.syn);
    // prefix match: OCR line may carry trailing qualifiers not captured as notes
    const k=e.syn.split(' ').length;
    if(tt.length>k){const pre=tt.slice(0,k).join(' ');const ps=sim(pre,e.syn)*(e.syn.length>=6?0.96:0.9);if(ps>s)s=ps;}
    if(!best||s>best.score){if(best&&best.id!==e.id)second=best;best={id:e.id,score:s,matched:e.syn};}
    else if((!second||s>second.score)&&e.id!==best.id)second={id:e.id,score:s,matched:e.syn};}
  if(!best)return null;
  return Object.assign({},BYID[best.id],{score:+best.score.toFixed(3),matched:best.matched,runnerUp:second?{id:second.id,score:+second.score.toFixed(3)}:null});}

/* ---- standing orders: '[Repeat N month(s), From DD Mon YYYY to DD Mon YYYY]' (EMR suffix) ----
   OCR-tolerant: finds the segment, parses it strictly after fixing common OCR confusions, and returns a normalised text
   or null (caller then shows 'Standing order noted - check paper' instead of garbage). */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const SO_PLACEHOLDER='Standing order noted - check paper';
function fixDigits(t){return t.replace(/[Oo°Q]/g,'0').replace(/[Il|!\]\[i]/g,'1').replace(/[Ss\$]/g,'5').replace(/[Zz]/g,'2').replace(/B/g,'8').replace(/[Gb]/g,'6');}
function monthOf(tok){const t=(tok||'').toLowerCase().replace(/[^a-z]/g,'');if(t.length<3)return null;let best=null,bs=0,second=0;
  for(const m of MONTHS){const ml=m.toLowerCase();const cand=t.length<=4?ml.slice(0,3):ml;let sc=sim(t.length<=4?t.slice(0,3):t,cand);if(t.length===4&&(ml==='june'||ml==='july'))sc=Math.max(sc,sim(t,ml));
    if(sc>bs){second=bs;bs=sc;best=m;}else if(sc>second)second=sc;}
  return bs>=0.99||(bs>=0.66&&bs-second>0.3)?best:null;}
// locate a standing-order segment in raw text -> {index,length} or null
function findStandingOrder(s){
  // anchor 1: a 'Repeat'-like token (OCR variants: RePeat, Repeal, REPEStL, Rapeat ...) near '[' or followed by a number/period word
  const re=/[\[\({|]?\s*\b(R[a-z]{3,6}[A-Za-z]{0,2})\b/gi;let m;
  while((m=re.exec(s))){const w=m[1].toLowerCase().replace(/[^a-z]/g,'');const sc=Math.max(sim(w.slice(0,6),'repeat'),sim(w,'repeat'));
    const after=s.slice(m.index+m[0].length,m.index+m[0].length+30);
    if(sc>=0.66&&(/^[\s,]*[0-9lI|]{1,2}\b|^\s*\S{0,3}\s*(?:day|week|mon|year|annual)/i.test(after)||/[\[\({|]/.test(m[0])||sc>=0.83))return {index:m.index,length:s.length-m.index};}
  // anchor 2: '[... From DD Mon YYYY' without a readable 'Repeat'
  const f=s.match(/\[[^\]]{0,25}\b[Ff]r[o0]m\s+\S{1,3}\s+[A-Za-z]{2,9}/);if(f)return {index:f.index,length:s.length-f.index};
  return null;}
function parseStandingOrder(seg){
  let t=(seg||'').replace(/[\[\]{}()|]/g,' ').replace(/\s+/g,' ').trim();
  const m=t.match(/^\S*?\s*(\S{1,2})\s+([A-Za-z]{3,7})\s*[,.;]?\s*[Ff][rn][o0]m\s+(\S{1,2})\s+([A-Za-z]{3,9})\.?\s+(\S{4})\s*,?\s*t[o0]\s+(\S{1,2})\s+([A-Za-z]{3,9})\.?\s+(\S{4})/);
  if(!m)return null;
  const n=+fixDigits(m[1]);const unitW=m[2].toLowerCase();let unit=null;for(const u of ['day','week','month','year']){if(sim(unitW.replace(/s$/,''),u)>=0.66){unit=u;break;}}
  const d1=+fixDigits(m[3]),d2=+fixDigits(m[6]),y1=+fixDigits(m[5]),y2=+fixDigits(m[8]);const mo1=monthOf(m[4]),mo2=monthOf(m[7]);
  if(!n||n>24||!unit||!mo1||!mo2||!(d1>=1&&d1<=31)||!(d2>=1&&d2<=31)||!(y1>=2020&&y1<=2040)||!(y2>=y1&&y2<=2045))return null;
  const a=new Date(y1,MONTHS.indexOf(mo1),d1),b=new Date(y2,MONTHS.indexOf(mo2),d2);if(b<=a)return null;
  return 'Repeat '+n+' '+unit+(n>1?'s':'')+', from '+d1+' '+mo1+' '+y1+' to '+d2+' '+mo2+' '+y2;}

/* Split raw line text into test-name part and notes (patient instructions, lab notes, standing orders). */
function splitNotes(raw){
  let s=(raw||'').replace(/\s+/g,' ').trim();const notes=[];
  const so=findStandingOrder(s);
  if(so){let seg=s.substr(so.index,so.length);const close=seg.indexOf(']');if(close>0)seg=seg.slice(0,close+1);
    const norm=parseStandingOrder(seg);notes.push(norm?{type:'standing order',text:norm,parsed:true}:{type:'standing order',text:SO_PLACEHOLDER,parsed:false,rawText:seg.replace(/^[\[\s]+|[\]\s]+$/g,'')});
    s=(s.slice(0,so.index)+' '+s.slice(so.index+seg.length)).trim();}
  const markers=[[/\*?\s*PATIENT\s+INSTRUCTIONS?\s*[-:]?/i,'patient instructions'],[/NOTE\s+TO\s+PATIENT\s*\*?/i,'note to patient'],[/NOTE\s+TO\s+LAB\s*[;:]?/i,'note to lab'],[/Standing\s+Order/i,'standing order']];
  let cut=s.length;const found=[];
  for(const [re,type] of markers){const m=s.match(re);if(m){found.push({i:m.index,len:m[0].length,type});}}
  found.sort((a,b)=>a.i-b.i);
  if(found.length){cut=found[0].i;for(let j=0;j<found.length;j++){const f=found[j];const end=j+1<found.length?found[j+1].i:s.length;
      let txt=s.slice(f.i+f.len,end).replace(/^[\s*;:,-]+|[\s*;:,-]+$/g,'');if(f.type==='standing order')txt='Standing Order '+txt;
      if(txt)notes.push({type:f.type,text:txt});}}
  let name=s.slice(0,cut);
  const fr=name.match(/,\s*once every [^,]*$|\bonce every\b.*$/i);if(fr){notes.push({type:'frequency',text:fr[0].replace(/^,\s*/,'')});name=name.slice(0,fr.index);}
  name=name.replace(/[\s*;:,-]+$/,'').trim();
  return {name,notes};}
function headerOf(text){const t=norm(text);if(!t||t.length<5)return null;
  // section headers are printed in capitals; require mostly upper-case letters
  const L=(text.match(/[A-Za-z]/g)||[]);const up=(text.match(/[A-Z]/g)||[]).length;if(L.length<5||up/L.length<0.75)return null;
  let best=null;for(const h of HEADERS){const s=sim(t,norm(h));if(s>=0.75&&(!best||s>best.s))best={h,s};}return best?best.h:null;}
// looser header test for text read from the band BETWEEN two traced test lines (only headers live there): ignore case,
// accept a header's distinctive first word alone (e.g. 'OTHER' when 'TESTS' is cut off)
function headerLoose(text){const toks=(text||'').toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).filter(t=>t.length>=5);let best=null;
  for(const h of HEADERS){const hw=norm(h).split(' ');const full=norm(h).replace(/ /g,'');
    for(let i=0;i<toks.length;i++){const cands=[[toks[i],full]];if(hw[0]==='other')cands.push([toks[i],hw[0]]);/* only 'OTHER' is distinctive alone ('URINE', 'HEPATITIS' are test words) */if(toks[i+1])cands.push([toks[i]+toks[i+1],full]);
      for(const [a,b] of cands){if(b.length<5)continue;const sc=sim(a,b);if(sc>=0.78&&(!best||sc>best.s))best={h,s:sc};}}}
  return best?best.h:null;}
function isStop(text){const t=norm(text);return STOP.some(s=>t.includes(s)||sim(t.slice(0,s.length),s)>0.8);}
const api={TESTS:T,BYID,HEADERS,norm,sim,match,splitNotes,headerOf,headerLoose,isStop,parseStandingOrder,findStandingOrder,SO_PLACEHOLDER};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReqDict=api;
})(typeof self!=='undefined'?self:this);
