/* Local practice rules - NOT LifeLabs data. Each rule carries its own source + date and is shown with a distinct
   'Local practice' label. Generic model:
   question rule: {id, kind:'question', source, date, appliesTo:[dictionary ids], question, answers:[{v,label,as?}],
                   effects:{<resolved answer>|'unanswered': {severity:'red'|'info'|'ask', text, excludeFromTubes:true|false, hideStability?:regex of per-test lines that no longer apply}}}
                   'as' maps an answer onto another (e.g. Unsure behaves like Yes). Answers live in memory only for the current summary.
   standing rule: {id, kind:'standing', source, date, scope:'bloodTube', text, detail} - shown on every matching tube card.
   tube rule (v3.4): {id, kind:'tube', appliesTo, tube, mix, shareSets, destination, text} - assigns tubes, overriding the LifeLabs chart.
   constraint (v3.4): {id, kind:'constraint', ids, text} - communicable disease tests never share a tube with other tests. */
(function(root){'use strict';
const L={rules:[
 {id:'full_tube_default', kind:'standing', source:'VCH community practice (K. Williams)', date:'2026-10-10', scope:'bloodTube',
  text:'Collect a full tube',
  detail:'By default we always collect a full tube for all tests. Per-test minimum volumes in LifeLabs entries are lab minimums, not the amount to draw.'},
 {id:'ptt_heparin_community', kind:'question', source:'VCH community practice (K. Williams)', date:'2026-10-10', appliesTo:['ptt'],
  rationale:'Community nurses do not freeze plasma.',
  question:'Client on heparin or unknown anticoagulant?',
  answers:[{v:'yes',label:'Yes'},{v:'no',label:'No'},{v:'unsure',label:'Unsure',as:'yes'}],
  effects:{
   yes:{severity:'red',excludeFromTubes:true,
        text:'PTT on heparin / unknown anticoagulant: cannot be collected in community (requires double spin, aliquot and freezing). Redirect client to a LifeLabs Patient Service Centre.'},
   no:{severity:'info',excludeFromTubes:false,hideStability:'heparin|unknown anticoagulant',text:'Not on heparin / unknown anticoagulant: PTT can be collected in community in the citrate tube below.'},
   unanswered:{severity:'ask',excludeFromTubes:true,text:'Answer this question to see the PTT collection instructions. PTT is not included in the tubes below until you answer No.'}}}
,
 /* v3.4 tube rules (kind 'tube'): take priority over the LifeLabs chart (js/tube_rules.js) and per-test entries where they conflict.
    appliesTo: dictionary ids; shareSets: 'all' = every unit covered shares ONE tube, or a list of id sets that share one tube
    (any other covered id gets its own tube). destination is shown on the tube card. */
 {id:'viral_load_own_edta', kind:'tube', source:'VCH community practice (K. Williams)', date:'2026-10-11', overrides:'LifeLabs Quick Reference Chart',
  appliesTo:['hcv_rna_quant','hcv_genotype','hiv_vl'],
  tube:{type:'EDTA',sizeMl:6.0,colour:'lavender',css:'lav',rank:5,label:'EDTA lavender top 6.0 mL'}, mix:'8-10',
  shareSets:[['hcv_rna_quant','hcv_genotype']], destination:'BCCDC',
  text:'HCV RNA (Hep C viral load / PCR) and HIV Viral Load each need their OWN 6.0 mL EDTA lavender tube.',
  shareText:'HCV genotyping shares the HCV RNA tube per the BCCDC PHL Serology Screening Requisition (“For HCV RNA and HCV genotyping requests, please provide 1 EDTA plasma (lavender-top) tube.”).'},
 {id:'bccdc_serology_one_sst', kind:'tube', source:'VCH community practice (K. Williams)', date:'2026-10-11', overrides:'LifeLabs Quick Reference Chart',
  appliesTo:['syphilis','hiv_serology','hcv_screen','hav_immune','hav_igm','hbc_ab','hbv_immune','hbsag','hbeag','hbv_serology','hep_acute','hep_chronic'],
  tube:{type:'SST',sizeMl:5.0,colour:'gold',css:'gold',rank:3,label:'SST gold top 5.0 mL'}, mix:'5-6',
  shareSets:'all', destination:'BCCDC', form:'PHL_SER', formSpec:'serum',
  text:'BCCDC serology tube: any combination of syphilis, HIV, hepatitis A/B/C serology and other serology goes in ONE SST, following the BCCDC PHL Serology Screening Requisition guidance (LifeLabs sends all of these to BCCDC). Overrides the LifeLabs chart’s separate Hep A IgM / Hep B tube and two tubes per hepatitis profile.',
  prenatal:'Prenatal panel: 2 SSTs (BCCDC PHL Serology Screening Requisition: “Prenatal Testing -Please provide 2 serum separator tubes.”) - no prenatal panel test in the scanner dictionary yet.',
  pcr:'HCV RNA / genotyping: EDTA, see the viral-load rule.',
  centrifugeConflict:'LifeLabs pages differ on centrifuging for some of these tests - confirm with BCCDC/LifeLabs'},
 /* constraint: communicable disease tests never share a tube with non-communicable tests (enforced in summary.js plan()). */
 {id:'communicable_separate', kind:'constraint', source:'VCH community practice (K. Williams)', date:'2026-10-11',
  ids:['syphilis','hiv_serology','hiv_vl','hcv_screen','hcv_rna_quant','hcv_genotype','hav_immune','hav_igm','hbc_ab','hbv_immune','hbsag','hbeag','hbv_serology','hbv_dna','hep_acute','hep_chronic'],
  text:'All communicable disease tests (HIV, hepatitis, syphilis) go to BCCDC and never share a tube with non-communicable tests (lipids, chemistry, etc.).'}
]};
L.communicable=new Set([].concat(...L.rules.filter(r=>r.kind==='constraint').map(r=>r.ids)));
if(typeof module!=='undefined'&&module.exports)module.exports=L;else root.LocalRules=L;
})(typeof self!=='undefined'?self:this);
