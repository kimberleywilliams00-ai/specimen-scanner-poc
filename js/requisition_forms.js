/* Requisition forms (not LifeLabs data). Transcribed from the form PDF provided by Kimberley Williams; every quoted string is checked
   verbatim against the form text by tools/check_tube_rules.py. The form PDF itself is not part of this repository.
   tests[].ids = scanner dictionary ids; specimen = key into specimens. */
(function(root){'use strict';
const F={forms:[
 {id:'PHL_SER', title:'Serology Screening Requisition', issuer:'Public Health Laboratory', org:'BCCDC (PHSA)', number:'PHRQ_HVS_0001F', version:'Version 1.0 August 2026',
  display:'BCCDC PHL Serology Screening Requisition (PHRQ_HVS_0001F, Version 1.0 August 2026)',
  source:'BCCDC Public Health Laboratory Serology Screening Requisition PHRQ_HVS_0001F (Version 1.0 August 2026)', lastChecked:'2026-10-11',
  // names used for this form in LifeLabs Lab Test Information entries (same title, PHL is a PHSA laboratory)
  aliases:['PHSA Serology Screening Requisition','PHL - Serology Screening Requisition'],
  labelling:'Two matching unique patient identifiers on sample container and requisition are required for sample processing',
  moreInfo:'For other available tests and sample collection information, consult the Public Health Laboratory\'s eLab Handbook',
  specimens:{
   serum:{tube:'serum separator tube', css:'gold', texts:['HIV Testing -Please provide 1 serum separator tube.','Hepatitis Serology Testing -Please provide 1 serum separator tube.'],
          combine:'Combinations of Syphilis, HIV, Hepatitis Serology and Other Serology -Please provide 1 serum separator tube.'},
   edta:{tube:'EDTA plasma (lavender-top) tube', css:'lav', texts:['For HCV RNA and HCV genotyping requests, please provide 1 EDTA plasma (lavender-top) tube.'],
         combine:'For HCV RNA and HCV genotyping requests, please provide 1 EDTA plasma (lavender-top) tube.'}},
  tests:[
   {onForm:'Acute—undefined etiology', section:'HEPATITIS SEROLOGY', ids:['hep_acute'], specimen:'serum'},
   {onForm:'Chronic—undefined etiology', section:'HEPATITIS SEROLOGY', ids:['hep_chronic'], specimen:'serum'},
   {onForm:'Hepatitis B Screen Panel', section:'HEPATITIS SEROLOGY', ids:['hbv_serology'], specimen:'serum'},
   {onForm:'Anti-HAV Total', section:'HEPATITIS SEROLOGY', ids:['hav_immune'], specimen:'serum'},
   {onForm:'Anti-HAV IgM', section:'HEPATITIS SEROLOGY', ids:['hav_igm'], specimen:'serum'},
   {onForm:'HBsAg Only', section:'HEPATITIS SEROLOGY', ids:['hbsag'], specimen:'serum'},
   {onForm:'Anti-HBs', section:'HEPATITIS SEROLOGY', ids:['hbv_immune'], specimen:'serum'},
   {onForm:'HBeAg', section:'HEPATITIS SEROLOGY', ids:['hbeag'], specimen:'serum'},
   {onForm:'Anti-HCV', section:'HEPATITIS SEROLOGY', ids:['hcv_screen'], specimen:'serum'},
   {onForm:'HCV RNA Quantitative', section:'HEPATITIS C PCR', ids:['hcv_rna_quant'], specimen:'edta'},
   {onForm:'HCV Genotyping', section:'HEPATITIS C PCR', ids:['hcv_genotype'], specimen:'edta'},
   {onForm:'HIV', section:'HIV (Non-prenatal)', ids:['hiv_serology'], specimen:'serum'},
   {onForm:'Routine', section:'SYPHILIS ANTIBODY', ids:['syphilis'], specimen:'serum'}]}
]};
F.byId={};for(const f of F.forms)for(const t of f.tests)for(const id of t.ids)if(!F.byId[id])F.byId[id]={form:f,test:t,spec:f.specimens[t.specimen]};
F.formOfName=n=>{const k=(n||'').toLowerCase();return F.forms.find(f=>f.aliases.some(a=>a.toLowerCase()===k))||null;};
if(typeof module!=='undefined'&&module.exports)module.exports=F;else root.RequisitionForms=F;
})(typeof self!=='undefined'?self:this);
