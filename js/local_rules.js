/* Local practice rules - NOT LifeLabs data. Each rule carries its own source + date and is shown with a distinct
   'Local practice' label. Generic model:
   question rule: {id, kind:'question', source, date, appliesTo:[dictionary ids], question, answers:[{v,label,as?}],
                   effects:{<resolved answer>|'unanswered': {severity:'red'|'info'|'ask', text, excludeFromTubes:true|false, hideStability?:regex of per-test lines that no longer apply}}}
                   'as' maps an answer onto another (e.g. Unsure behaves like Yes). Answers live in memory only for the current summary.
   standing rule: {id, kind:'standing', source, date, scope:'bloodTube', text, detail} - shown on every matching tube card. */
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
]};
if(typeof module!=='undefined'&&module.exports)module.exports=L;else root.LocalRules=L;
})(typeof self!=='undefined'?self:this);
