/* BCCDC PHL eLab Handbook entries (v3.5) - verbatim text, kept separate from LifeLabs data and shown with a 'BCCDC eLab Handbook' source label.
   Source: eLab Handbook public view page printed by K. Williams 2026-10-11 (PDF not in this repository; strings checked against its text by
   tools/check_elab.py). URL printed on the page: www.elabhandbook.info/phsa (no per-test URL printed).
   specimens[].preferred: true only where the page prints '(Preferred)'; the page prints no label on other specimen rows. */
(function(root){'use strict';
const E={source:'BCCDC PHL eLab Handbook', urlText:'www.elabhandbook.info/phsa', lastChecked:'2026-10-11', entries:[
 {id:'elab_hepatitis_c_serology', dictIds:['hcv_screen'], title:'Hepatitis C Serology', lastChanged:'Thursday, May 22, 2025', version:null,
  testMethod:'Serology',
  alternateNames:['Acute Hepatitis','Anti Hepatitis C antibody','Chronic Hepatitis','Convalescent Hepatitis','Recent Hepatitis','HCV'],
  testIncludes:'This commercial assay has been validated for specimens listed in SPECIMEN REQUIREMENTS.',
  quickTip:['If the initial screen test is reactive, a supplemental test on an alternative platform is performed to confirm status.',
   'If patient is positive for anti-HCV antibodies by serology HCV NAT is automatically reflexed on the original serum sample if the patient is first time anti-HCV positive or has never had HCV RNA performed. A follow up EDTA sample will only be requested if no HCV RNA is detected.'],
  unacceptable:['Unlabelled samples','Leaking samples','Grossly hemolysed blood samples.','Grossly lipemic samples','Patient name on the sample does not match name on requisition','Samples accompanied by undecipherable, blank or no requisitions','Sample collected in wrong container'],
  processing:'M-F (varies with STAT holidays and operations)',
  requisition:'PHRQ_HVS_0001F_Serology_Screening_Requisition (Version 1.0 August 2026)',
  turnaround:'1-3 days',
  patientPrep:'Collect approximately 7 mL of venous blood (at least one hour after a meal).',
  specimens:[
   {specimen:'Clotted blood', preferred:true, container:'SST (gold top) blood tube', optimal:'N/A', min:'3 mL', centrifuge:false, clot:'about one hour',
    collection:['Collect approximately 7 mL of venous blood (at least one hour after a meal).',
     'Allow blood to clot in the tube, standing upright at room temperature for about one hour.',
     'Submit the sample after ensuring that instructions on the requisition are followed.',
     'Tests performed on the sample will be determined by the request entered on the requisition, the clinical information provided and any follow-up discussions with the clinician.',
     'Blood samples that had been inadvertently frozen during transport are not acceptable for serology testing. If there is a risk that a blood sample will freeze during transport, please submit only the serum fraction for testing.']},
   {specimen:'Serum', preferred:false, container:'Sterile tube', optimal:'N/A', min:'1 mL', centrifuge:true, clot:'about one hour', spinMinutes:10, rcf:1200, transfer:true,
    collection:['Collect approximately 7 mL of venous blood (at least one hour after a meal).',
     'Allow blood to clot in the tube, standing upright at room temperature for about one hour.',
     'Centrifuge the tube for 10 minutes at 1200 rcf.',
     'Transfer the serum fraction to a sterile tube.',
     'Submit the sample after ensuring that instructions on the requisition are followed.',
     'Tests performed on the sample will be determined by the request entered on the requisition, the clinical information provided and any follow-up discussions with the clinician.']}],
  shipping:'REFRIGERATE SAMPLE WHERE APPROPRIATE (UNLESS SPECIFIED) PRIOR TO AND DURING TRANSPORT',
  shipTo:'BCCDC Lane Level Receiving/drop-off, Rear of BCCDC building, 655 West 12th Ave, Vancouver, BC',
  stability:null, // no stability times printed on the page (only: inadvertently frozen blood not acceptable)
  printedNote:'If printed, this version of the test may be out of date. For the most recent version of the test, please refer to the test online at the www.elabhandbook.info/phsa.'}
]};
E.byDict={};for(const e of E.entries)for(const i of e.dictIds)E.byDict[i]=e;
if(typeof module!=='undefined'&&module.exports)module.exports=E;else root.ElabData=E;
})(typeof self!=='undefined'?self:this);
