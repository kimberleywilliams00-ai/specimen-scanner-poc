/* Local practice rules - NOT LifeLabs data. Each rule carries its own source + date and is shown with a distinct
   'Local practice' label. Generic model:
   question rule: {id, kind:'question', source, date, appliesTo:[dictionary ids], question, answers:[{v,label,as?}],
                   effects:{<resolved answer>|'unanswered': {severity:'red'|'info'|'ask', text, excludeFromTubes:true|false, hideStability?:regex of per-test lines that no longer apply}}}
                   'as' maps an answer onto another (e.g. Unsure behaves like Yes). Answers live in memory only for the current summary.
   standing rule: {id, kind:'standing', source, date, scope:'bloodTube', text, detail} - shown on every matching tube card.
   tube rule (v3.4): {id, kind:'tube', appliesTo, tube, mix, shareSets, destination, text} - assigns tubes, overriding the LifeLabs chart.
   handling (v3.5): tube rule field {centrifuge, settingsFrom, source, date, text, reference} - tube-level processing set by local practice.
   refer (ui2): {id, kind:'refer', appliesTo, effect:{severity:'red', excludeFromTubes:true, title, text}, quoteFrom} - always applies, no question.
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
 /* ui2 (2026-10-11) refer rule (kind 'refer'): no question - the test is always taken out of the tube plan and shown as a red
    'refer' item. quoteFrom: a sentence of the test's own LifeLabs page (looked up in js/collection_data.js at render time, never copied here). */
 {id:'hiv_vl_refer_psc', kind:'refer', source:'VCH community practice (K. Williams)', date:'2026-10-11', appliesTo:['hiv_vl'],
  rationale:'Community nurses do not separate plasma.',
  effect:{severity:'red', excludeFromTubes:true, title:'HIV viral load: plasma aliquoting required - refer to a LifeLabs Patient Service Centre',
   text:'HIV viral load: not collected in community - the LifeLabs page requires centrifuging and separating plasma into a second tube, which community does not do. Refer the client to the nearest LifeLabs Patient Service Centre with the requisition.'},
  quoteFrom:{entry:'hiv_viral_load', match:'refer patient to the nearest LifeLabs Patient Service Centre'}},
 /* v3.4 tube rules (kind 'tube'): take priority over the LifeLabs chart (js/tube_rules.js) and per-test entries where they conflict.
    appliesTo: dictionary ids; shareSets: 'all' = every unit covered shares ONE tube, or a list of id sets that share one tube
    (any other covered id gets its own tube). destination is shown on the tube card. */
 /* ui2 (2026-10-11): specimen rule - community practice for a non-blood specimen, overriding part of the BCCDC eLab collection steps.
   {id, kind:'specimen', appliesTo, container, keepSteps:[indexes of the eLab specimen's collection steps shown on the card], labSide:[indexes shown
   in Details as lab-side only], text} */
{id:'ctgc_urine_send_cup', kind:'specimen', source:'VCH community practice (K. Williams)', date:'2026-10-11', appliesTo:['ct_ng_urine','urine_trich'],
 container:'Sterile urine cup (first-catch urine)', keepSteps:[0,1], labSide:[2,3,4],
 text:'Community nurses send the urine cup (first-catch urine, about 20-30 mL). They do not do the 2 mL Aptima urine transfer; the pipette/transfer steps on the eLab page are lab-side.'},
/* ui2 (2026-10-11, turn 10): cupOnly - community sends the urine CUP for these LifeLabs entries (by entry id); the boric acid /
   preservative tube and pour-off on the LifeLabs page are lab-side (shown in Details only). volume: cup volume shown on the card, taken
   from a source whose verbatim sentence is quoteFrom (looked up in js/guide_data.js at render time; not shown if the sentence is missing). */
{id:'urine_culture_send_cup', kind:'cupOnly', source:'VCH community practice (K. Williams)', date:'2026-10-11', entries:['cs_urine','cs_urine_if_indicated'],
 container:'Sterile urine cup (midstream)', volume:'at least 20 mL', quoteFrom:{guide:'ll_doc38130', match:'A minimum of 20mL is required.'},
 short:'Local practice: send the cup, no boric acid tube.',
 text:'Community nurses send the urine cup to LifeLabs. They do not use boric acid (preservative) tubes; the boric acid pour-off on the LifeLabs page is lab-side.'},
/* ui2 (2026-10-11, turn 11): collector - which swab sites community nurses may collect (CT/GC NAAT and GC culture swabs). sites: scanner
   id -> 'ok' | 'cert' | 'confirm' | 'unknownSite'; flags: amber text per status (no flag for 'ok'). Replaces the GC CULTURE page's generic
   "Medical Practitioner to collect specimen" amber (the page quote stays in Details). */
{id:'swab_collector_sites', kind:'collector', source:'VCH community practice (K. Williams)', date:'2026-10-11',
 sites:{ct_ng_vaginal:'ok', ct_ng_rectal:'ok', ct_ng_throat:'ok', gc_culture_rectum:'ok', gc_culture_throat:'ok',
        ct_ng_cervix:'cert', gc_culture_cervix:'cert', ct_ng_urethra:'confirm', gc_culture_urethra:'confirm', gc_culture_other:'unknownSite'},
 flags:{cert:'Requires STI certified practice (cervical/endocervical swab).', confirm:'Confirm whether community nurses may collect urethral swabs.',
        unknownSite:'Site not stated: cervical swabs require STI certified practice; confirm whether community nurses may collect urethral swabs.'},
 text:'Community nurses can collect vaginal, rectal and throat swabs. Cervical/endocervical swabs require STI certified practice. Urethral swabs: not yet confirmed.'},
/* ui2 (2026-10-11, turn 11): kitSource - the kit shown on the card comes from a named guide row (verbatim, js/guide_data.js), not the
   LifeLabs page. The LifeLabs container stays in Details as a quiet 'sources differ' note (no amber). */
/* ui2 (2026-10-11, turn 19): handOut - FIT (K. Williams): the kit is the Eiken FIT tube in her illustration; community nurses hand out FIT kits.
   The LifeLabs page's "Refer patient to the nearest LifeLabs Patient Service Centre." is a quiet Details note, not amber. */
{id:'fit_eiken_handout', kind:'handOut', source:'VCH community practice (K. Williams)', date:'2026-10-11', entries:['fit_ll'],
 img:'eiken_fit_tube_teal_cap', alt:'Eiken FIT tube', text:'Community nurses hand out FIT kits. FIT kit: Eiken FIT tube.'},
{id:'gc_culture_eswab', kind:'kitSource', source:'VCH community practice (K. Williams)', date:'2026-10-11', entries:['gc_culture'],
 guide:'bccdc_sti_quickref', kit:'gc_culture', short:'eSwab (green top)', img:'eswab_green_cap',
 text:'GC culture swab: COPAN green-top eSwab, as in the BCCDC Quick Reference STI Screening and Testing Guide (May 2026).'},
/* ui2 (2026-10-11): community transport. urineCup: every non-blood urine container (any urine test) is refrigerated. dropoff: where all community samples go. */
{id:'urine_cup_fridge', kind:'urineCup', source:'VCH community practice (K. Williams)', date:'2026-10-11', temp:'Refrigerate',
 text:'Urine cups are always refrigerated.'},
{id:'dropoff_lifelabs', kind:'dropoff', source:'VCH community practice (K. Williams)', date:'2026-10-11',
 text:'Community samples are dropped off at LifeLabs. LifeLabs transports BCCDC tests to BCCDC; the BCCDC requisition (e.g. BAM requisition) still goes with them.'},
{id:'viral_load_own_edta', kind:'tube', source:'VCH community practice (K. Williams)', date:'2026-10-11', overrides:'LifeLabs Quick Reference Chart',
  appliesTo:['hcv_rna_quant','hcv_genotype','hiv_vl'],
  tube:{type:'EDTA',sizeMl:6.0,colour:'lavender',css:'lav',rank:5,label:'EDTA lavender top 6.0 mL'}, mix:'8-10',
  shareSets:[['hcv_rna_quant','hcv_genotype']], destination:'BCCDC',
  text:'HCV RNA (Hep C viral load / PCR) and HIV Viral Load each need their OWN 6.0 mL EDTA lavender tube.',
  shareText:'HCV genotyping shares the HCV RNA tube per the BCCDC PHL Serology Screening Requisition (“For HCV RNA and HCV genotyping requests, please provide 1 EDTA plasma (lavender-top) tube.”).'},
 {id:'bccdc_serology_one_sst', kind:'tube', source:'VCH community practice (K. Williams)', date:'2026-10-11', overrides:'LifeLabs Quick Reference Chart',
  appliesTo:['syphilis','hiv_serology','hcv_screen','hav_immune'], /* turn 44 (BCCDC reply to K. Williams 2026-10-14): tube sharing follows the LifeLabs Quick Reference Chart - Hep A IgM/Hep B tests use the chart's LifeLabs SST; Hepatitis Acute/Chronic get the chart's two SSTs each (one LifeLabs, one BCCDC, per their pages). Was: all hepatitis serology in this one SST. */
  tube:{type:'SST',sizeMl:5.0,colour:'gold',css:'gold',rank:3,label:'SST gold top 5.0 mL'}, mix:null, /* turn 34: 'Mix 5-6x' dropped - no BCCDC source */
  shareSets:[['hcv_screen','hiv_serology','syphilis']] /* turn 49 K. Williams: syphilis shares (BCCDC Serology Screening Req section 7) */ /* turn 44: chart SST50_HCV_HIV; syphilis / Hep A immune (not on the chart) own tube */, destination:'BCCDC', form:'PHL_SER', formSpec:'serum',
  text:'BCCDC serology tube: any combination of syphilis, HIV, hepatitis A/B/C serology and other serology goes in ONE SST, following the BCCDC PHL Serology Screening Requisition guidance (LifeLabs sends all of these to BCCDC). Overrides the LifeLabs chart’s separate Hep A IgM / Hep B tube and two tubes per hepatitis profile.',
  prenatal:'Prenatal panel: 2 SSTs (BCCDC PHL Serology Screening Requisition: “Prenatal Testing -Please provide 2 serum separator tubes.”) - no prenatal panel test in the scanner dictionary yet.',
  pcr:'HCV RNA / genotyping: EDTA, see the viral-load rule.',
  /* v3.5 handling rule (VCH community practice, K. Williams, 2026-10-11): the BCCDC serology SST is CENTRIFUGED in community - allow to
     clot first, then spin. Clot time / centrifuge settings (derived in summary.js, never hard-coded here): BCCDC eLab Handbook entry
     (js/elab_data.js) when a test in the tube has one (BCCDC-bound tube), otherwise the LifeLabs SST settings in js/collection_data.js;
     differences are shown. Replaces the v3.4 amber 'LifeLabs pages differ on centrifuging' note and the red 'Do NOT centrifuge' banner for
     this tube; each test's LifeLabs page wording stays visible in its test details, labelled as LifeLabs page text.
     v3.6 (VCH community practice, K. Williams, 2026-10-11): community nurses NEVER transfer serum to a separate tube - the SST is sent as
     is after centrifuging. The verbatim eLab text (incl. its serum-transfer option) stays in the Hep C test details, labelled as eLab text. */
  /* turn 34 (K. Williams, 2026-10-14): NOT centrifuged in community - clotted blood preferred per BCCDC eLab; still never transfer serum */
  handling:{centrifuge:false, source:'VCH community practice (K. Williams)', date:'2026-10-14', elabUrl:'https://www.elabhandbook.info/phsa',
   text:'Not centrifuged in community: clotted blood (BCCDC eLab Handbook Preferred specimen), refrigerate. Send in the original SST; do not transfer serum (VCH community practice).'}},
 /* ui2 (2026-10-11, turn 14): companion - CD4 REQUIRES a CBC collected at the same time (K. Williams). CD4 itself is the ACD yellow tube.
    The CD4 page's 4 mL EDTA slot "(one for the Hematology Panel performed at LifeLabs)" is NOT a CD4 tube: if a CBC is on the requisition no
    extra tube (note on the CD4 card); if not, one lavender 4 mL CBC tube is added, labelled as required for CD4, with an amber reminder.
    That tube uses the LifeLabs Hematology Panel handling (entry hematology_panel). The page quote stays in Details. */
 {id:'cd4_requires_cbc', kind:'companion', source:'VCH community practice (K. Williams)', date:'2026-10-11', entries:['cd4_sph'], slotMatch:'EDTA', group:'EDTA40', handlingEntry:'hematology_panel',
  reqName:'CBC (required for CD4)', note:'Requires a CBC collected at the same time.', satisfiedNote:'Requires a CBC collected at the same time - the CBC tube covers it.',
  text:'CD4 requires a CBC (lavender EDTA 4 mL) collected at the same time.',
  missingText:'CBC not on the requisition: a CBC must be collected and ordered with CD4.'},
 /* ui2 (turn 14): shareSpecimen - ONE specimen for these LifeLabs entries (K. Williams). Supporting wording (verbatim) from a guide source in
    js/guide_data.js (quotes are looked up there; not shown if missing). */
 {id:'idp_cdiff_one_swab', kind:'shareSpecimen', source:'BC Gov guidance', sourceUrl:'https://www2.gov.bc.ca/gov/content?id=9C231B7C58E54FF4999A2B52AD396043', notLocal:true, date:'2026-10-11', /* turn 34: was mislabelled 'Local practice' - source is BC government guidance */ entries:['infectious_diarrhea_panel','c_diff'],
  guide:'bc_gpac_infectious_diarrhea', short:'One swab for both tests.',
  text:'One Copan FecalSwab covers both C. difficile and the Infectious Diarrhea Panel.'},
 /* ui2 (2026-10-12, turn 21): prepVolume - K. Williams' decision: the CT/GC urine prep line always shows the first-catch volume from
    LifeLabs Doc#31847 (quoteFrom, looked up verbatim in js/guide_data.js; the line shows no volume if the sentence is missing), even when a
    requisition note says 15-20 mL or LifeLabs Doc.#38123 says 30 mL. All source wordings stay verbatim in Details. */
 {id:'ctgc_urine_volume', kind:'prepVolume', source:'K. Williams decision, per LifeLabs Doc#31847', date:'2026-10-12', appliesTo:['ct_ng_urine'],
  volume:'20–30 mL', quoteFrom:{guide:'ll_doc31847', match:'Collect the first 20-30 mL of voided urine (NOT midstream)'},
  text:'CT/GC urine volume: the plan shows "first 20–30 mL" (LifeLabs Doc#31847) even when the requisition or another source states a different volume.'},
 /* ui2 (2026-10-12, turn 22): shareCup - K. Williams local practice: urinalysis (macroscopic/dipstick, microscopic, micro-if-indicated) and
    Urine ACR share ONE urine cup when both are ordered (overrides the per-page noShare default for this pairing only; no LifeLabs page
    states this either way). If urine culture already shares the UA cup (LifeLabs C&S page), ACR joins that cup. CT/GC urine stays separate.
    groups: every group must be present for the rule to apply. */
 {id:'ua_acr_share_cup', kind:'shareCup', source:'K. Williams local practice', date:'2026-10-12',
  groups:[['urine_macroscopic','urine_microscopic','urine_micro_if_indicated'],['acr_urine']], hostFirst:['cs_urine','cs_urine_if_indicated','urine_macroscopic','urine_micro_if_indicated','urine_microscopic'],
  short:'One cup for urinalysis and ACR: mid-stream, first morning preferred – put all the labels on it.',
  text:'Urinalysis and Urine ACR share one urine cup (mid-stream collection, first morning sample preferred, refrigerated, all labels on the cup). If urine culture shares the urinalysis cup (LifeLabs C&S page), ACR goes in that cup too. CT/GC urine stays in its own first-catch cup.'},
 /* ui2 (turn 14): drawLast - tubes whose container matches are drawn last (local practice). */
 {id:'acd_draw_last', kind:'drawLast', source:'VCH community practice (K. Williams)', date:'2026-10-11', match:'ACD', text:'ACD yellow tube: draw last (local practice).'},
 /* ui2 (2026-10-11, turn 16): chartJoin - AFP tube (K. Williams): when other chemistry is ordered AFP shares the chemistry 5 mL SST
    (chart group joinGroup); when AFP is alone in its tube, SST gold 3.5 mL (as on the LifeLabs ALPHA FETOPROTEIN page). If it shares its own
    chart group (SST50_ENDO) with other tests, that 5 mL tube is kept. The page/chart size difference is a quiet Details note. */
 {id:'afp_tube', kind:'chartJoin', source:'VCH community practice (K. Williams)', date:'2026-10-11', ids:['afp'], fromGroup:'SST50_ENDO', joinGroup:'SST50_CHEM',
  alone:{sizeMl:3.5, label:'SST gold top 3.5 mL'},
  text:'AFP: SST gold 3.5 mL when it is alone in its tube; 5 mL when it shares the chemistry SST with other tests.'},
 /* ui2 (turn 16): tubeSize - tube size not printed on the page; size from local practice (container match on the named entries). */
 {id:'cd4_acd_8_5', kind:'tubeSize', source:'VCH community practice (K. Williams)', date:'2026-10-11', entries:['cd4_sph'], match:'ACD', label:'ACD-A yellow 8.5 mL',
  text:'CD4 ACD tube: ACD-A 8.5 mL.'},
 /* constraint: communicable disease tests never share a tube with non-communicable tests (enforced in summary.js plan()). */
 /* ui2 turn 28 (K. Williams decisions 2026-10-13) */
 {id:'hep_b_lifelabs', kind:'note', source:'K. Williams decision', date:'2026-10-13', appliesTo:['hbeag','hbv_dna'],
  text:'HBeAg and Hepatitis B viral load are processed by LifeLabs, not BCCDC: LifeLabs pages and the LifeLabs requisition are used (not the BCCDC serology SST).'},
 {id:'lab_processing_redirect', kind:'redirect', source:'K. Williams decision', date:'2026-10-13',
  rationale:'Spinning/centrifuging is fine in community, but community does not separate serum/plasma (aliquot off the cells), freeze specimens, or make blood films.',
  text:'Redirect to LifeLabs: send the client to the nearest LifeLabs Patient Service Centre with the requisition.'},
 {id:'page_vs_chart_date', kind:'precedence', source:'K. Williams decision', date:'2026-10-13', chartDate:'2024-04-08',
  text:'When a LifeLabs directory page conflicts with the Quick Reference Chart (Doc#49141, effective 2024-04-08), the more recent source wins (page Last Published date vs chart date). Chart newer or page date missing: chart kept and the conflict stays flagged.'},
 {id:'sst_size_alone_shared', kind:'sstSize', source:'K. Williams decision (generalises afp_tube)', date:'2026-10-13', alone:3.5, shared:5.0,
  exceptIds:['hav_igm','hav_immune','hbsag','hbeag','hbv_serology','hbv_immune','hbc_ab','hcv_screen','hep_acute','hep_chronic'], /* turn 46 K. Williams: hepatitis serology always Gold SST 5 mL (every LifeLabs page + chart Doc#49141) */
  text:'SST gold: 3.5 mL when the test is alone in its SST, 5 mL when the SST is shared.'},
 {id:'communicable_separate', kind:'constraint', source:'VCH community practice (K. Williams)', date:'2026-10-11',
  ids:['syphilis','hiv_serology','hiv_vl','hcv_screen','hcv_rna_quant','hcv_genotype','hav_immune','hav_igm','hbc_ab','hbv_immune','hbsag','hbv_serology','hep_acute','hep_chronic'], /* turn 28: hbeag, hbv_dna removed - LifeLabs-processed (hep_b_lifelabs) */
  text:'All communicable disease tests (HIV, hepatitis, syphilis) go to BCCDC and never share a tube with non-communicable tests (lipids, chemistry, etc.).'}
]};
L.commShareOnly=['hbeag']; /* turn 46: HBeAg + HBsAg share one LifeLabs SST (identical page handling; chart Doc#49141 hepatitis SST block) */
L.communicable=new Set([].concat(...L.rules.filter(r=>r.kind==='constraint').map(r=>r.ids)));
if(typeof module!=='undefined'&&module.exports)module.exports=L;else root.LocalRules=L;
})(typeof self!=='undefined'?self:this);
