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
['chloride','Chloride','Chemistry','Chloride'],
['uric_acid','Uric Acid','Chemistry','Uric Acid','Urate'],
['crp','C-Reactive Protein (CRP)','Chemistry','CRP','C-Reactive Protein','C Reactive Protein'],
['esr','Sedimentation Rate (ESR)','Hematology','ESR','Sedimentation Rate','Erythrocyte Sedimentation Rate','Sed Rate'],
['d_dimer','D-Dimer','Hematology','D-Dimer','D Dimer'],
['fibrinogen','Fibrinogen','Hematology','Fibrinogen'],
['hbeag','Hepatitis Be Antigen (HBeAg)','Hepatitis serology','Hepatitis Be Antigen','Hepatitis B e Antigen','Hep Be Ag'],
['hbv_dna','Hepatitis B DNA (viral load)','Hepatitis serology','Hepatitis B DNA','HBV DNA','Hep B DNA','Hepatitis B Virus DNA'],
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
/* LIFELABS-AKA:BEGIN (generated by tools/build_collection_data.py - do not edit) */
const EXTRA_TESTS=[["hav_igm", "Hepatitis A Antibody IgM", "Hepatitis serology", "Hepatitis A Antibody IgM"], ["hbc_ab", "Hepatitis B Core Antibody (anti-HBc)", "Hepatitis serology", "Hepatitis B Core Antibody (anti-HBc)", "Hepatitis B Core Antibody"], ["ptt", "PTT (aPTT)", "Hematology", "PTT (aPTT)", "PTT", "Partial Thromboplastin Time"], ["free_t4", "Free T4", "Chemistry", "Free T4"], ["ct_ng_cervix", "CT/GC NAAT - Cervix", "Microbiology"], ["ct_ng_urethra", "CT/GC NAAT - Urethra", "Microbiology"], ["culture_urine", "Routine culture - Urine", "Microbiology"], ["gc_culture_cervix", "GC culture - Cervix", "Microbiology"], ["gc_culture_urethra", "GC culture - Urethra", "Microbiology"], ["gc_culture_throat", "GC culture - Throat", "Microbiology"], ["gc_culture_rectum", "GC culture - Rectum", "Microbiology"], ["gc_culture_other", "GC culture - Other site", "Microbiology"], ["bilirubin_direct", "Bilirubin Direct (conjugated)", "Chemistry"], ["bilirubin_indirect", "Bilirubin Indirect (unconjugated)", "Chemistry"], ["urine_macro", "Urinalysis: Macroscopic (dipstick)", "Urine"], ["urine_micro", "Urinalysis: Microscopic", "Urine"], ["vaginitis_chronic", "Vaginitis - chronic/recurrent (C&S Vag Chronic)", "Microbiology", "Vaginitis - chronic/recurrent", "C&S Vag Chronic"]];
const AKA=[["acr", "ACR URINE RANDOM"], ["acr", "ALBUMIN/CREATININE URINE RANDOM"], ["acr", "ALBUMIN/CREATININE RATIO URINE RANDOM"], ["acr", "ALBUMIN/CREATINIE URINE RANDOM"], ["acr", "MACROALBUMINURIA"], ["acr", "MICROALBUMIN"], ["acr", "MICROALBUMIN SCREEN"], ["acr", "MICROALBUMIN URINE QUANTITATIVE"], ["acr", "MICROALBUMIN URINE RANDOM"], ["acr", "MICROALBUMIN URINE SCREEN"], ["acr", "MICROALBUMIN/CREATININE RATIO"], ["acr", "MICROALBUMIN-QUANTITATIVE"], ["acr", "URINE ALBUMIN QUANT"], ["acr", "URINE MICROALBUMIN RANDOM"], ["acr", "ACR - URINE"], ["afp", "ALPHA-1 FETOPROTEIN"], ["afp", "ALPHA-FETOPROTEIN (NON-PREGNANT)"], ["albumin", "ALBUMIN SERUM"], ["albumin", "PLASMA PROTEINS"], ["alp", "ALKALINE PHOSPHATASE SERUM"], ["alt", "GPT"], ["alt", "SGPT"], ["alt", "TRANSAMINASE"], ["alt", "ALANINE AMINOTRANSFERASE"], ["ast", "ASPARTATE TRANSAMINASE"], ["ast", "SGOT"], ["ast", "ASPARTATE AMINOTRANSFERASE"], ["bilirubin_direct", "BILIRUBIN CONJUGATED"], ["bilirubin_direct", "BILIRUBIN DIRECT"], ["bilirubin_indirect", "BILIRUBIN UNCONJUGATED"], ["bilirubin_indirect", "BILIRUBIN INDIRECT"], ["bilirubin", "BILIRUBIN MICRO SERUM"], ["bilirubin", "NEONATAL BILIRUBIN"], ["bilirubin", "INFANT BILIRUBIN"], ["bilirubin", "PAEDIATRIC BILIRUBIN"], ["bilirubin", "BILIRUBIN TOTAL"], ["c_diff", "AADD"], ["c_diff", "ANTIBIOTIC ASSOICATED DIARRHEA"], ["c_diff", "C DIFFICILE CULTURE OR TOXIN ASSAY"], ["c_diff", "C. DIFFICILE CULTURE & TOXIN"], ["c_diff", "C. DIFFICILE TOXIN"], ["c_diff", "CDAD"], ["c_diff", "CDIF"], ["c_diff", "CDIF CULTURE AND TOXIN"], ["c_diff", "CDIF TOXIN"], ["c_diff", "CLOSTRIDIUM DIFFICILE ASSOCIATED DIARRHEA"], ["c_diff", "CLOSTRIDIUM DIFFICILE CULTURE OR TOXIN ASSAY"], ["c_diff", "CLOSTRIDIUM DIFFICILE TOXIN"], ["c_diff", "PSEUDOMEMBRANOUS COLITIS"], ["c_diff", "STOOL CDIF"], ["c_diff", "C DIFFICILE MOLECULAR ASSAY"], ["calcium", "CALCIUM SERUM"], ["cd4", "CD4"], ["cd4", "CD4/CD8 FOR HIV"], ["cd4", "FLOW CYTOMETRY FOR HIV"], ["cd4", "HIV IMMUNOPHENOTYPING"], ["cd4", "IMMUNOPHENOTYPING FOR CD4"], ["cd4", "IMMUNOPHENOTYPING FOR CD8"], ["cd4", "IMMUNOPHENOTYPING FOR HELPER/SUPPRESSOR RATIO"], ["cd4", "IMMUNOPHENOTYPING FOR HIV"], ["cd4", "IMMUNOPHENOTYPING FOR HSR"], ["cd4", "IMMUNOPHENOTYPING FOR LYMPHOCYTE HELPER/SUPPRESSOR RATIO"], ["cd4", "IMMUNOPHENOTYPING FOR T CELL COUNT"], ["cd4", "IMMUNOPHENOTYPING FOR T HELPER CELLS"], ["cd4", "IMMUNOPHENOTYPING FOR T4/T8"], ["cd4", "IMMUNOPHENOTYPING FOR T4/T8 RATIO"], ["cd4", "IMMUNOPHENOTYPING FOR T8 COUNT"], ["cd4", "IMMUNOPHENOTYPING (CD4) - SPH"], ["ck", "CPK"], ["ck", "CREATINE PHOSPHOKINASE"], ["creatinine", "CR FOR CREATININE"], ["creatinine", "CREATININE (CR)"], ["creatinine", "CREATININE SERUM"], ["creatinine", "Egfr"], ["creatinine", "GFR"], ["creatinine", "GLOMERULAR FILTRATION RATE"], ["culture_urine", "C AND S URINE"], ["culture_urine", "MIDSTREAM URINE FOR CULTURE"], ["culture_urine", "MSU FOR CULTURE"], ["culture_urine", "URINE CULTURE"], ["culture_urine", "URINE CULTURE AND SENSITIVITY"], ["culture_urine", "URINE MCS"], ["urine_macro_culture", "C AND S URINE IF INDICATED"], ["urine_macro_culture", "C&S URINE IF PYURIA OR NITRITE PRESENT"], ["urine_macro_culture", "URINALYSIS CULTURE IF PYURIA OR NITRITE PRESENT"], ["urine_macro_culture", "URINE CULTURE IF PYURIA OR NITRITE PRESENT"], ["urine_macro_culture", "URINE CULTURE & SENSITIVITY IF INDICATED"], ["vaginitis_chronic", "C AND S VAGINA CHRONIC"], ["vaginitis_chronic", "CULTURE AND SENSITIVITY VAGINA CHRONIC"], ["vaginitis_chronic", "GAS VAGINA"], ["vaginitis_chronic", "GROUP A STREP VAGINIA"], ["vaginitis_chronic", "GROUP A STREPTOCOCCUS VAGINIA"], ["vaginitis_chronic", "TRICHOMONAS VAG CHRONIC"], ["vaginitis_chronic", "VAGINA C&S CHRONIC"], ["vaginitis_chronic", "VAG CHRONIC AND TRICHOMONAS"], ["ct_ng_urine", "CHLM URINE"], ["ct_ng_urine", "NEISSERIA GONORRHOEAE & CHLAMYDIA URINE"], ["ct_ng_urine", "URINE CTGC"], ["ct_ng_urine", "URINE CHLAMYDIA & GC NAAT"], ["ct_ng_urine", "CHLAMYDIA & GC DNA ASSAY - URINE"], ["chloride", "CHLORIDE AND BICARBONATE"], ["chloride", "CLCO"], ["chloride", "ELECTROLYTES SERUM (CL &CO2)"], ["electrolytes", "SODIUM AND POTASSIUM"], ["electrolytes", "ELECTROLYTES SERUM (Na & K)"], ["fit", "BORDERLINE FIT RETEST"], ["fit", "FECAL IMMUNOCHEMICAL OCCULT BLOOD"], ["fit", "FECAL OCCULT BLOOD"], ["fit", "IMMUNOCHEMICAL OCCULT BLOOD"], ["fit", "OB"], ["fit", "OB1"], ["fit", "OB2"], ["fit", "OB3"], ["fit", "OCCULT BLOOD X3"], ["fit", "IMMUNOCHEMICAL FECAL OCCULT BLOOD"], ["free_t4", "EFFECTIVE THYROID RATIO"], ["free_t4", "ETR"], ["free_t4", "FREE THYROXINE INDEX"], ["free_t4", "FT4"], ["free_t4", "FTI"], ["free_t4", "T3 RESIN UPTAKE (T3U)"], ["free_t4", "T3 UPTAKE"], ["free_t4", "T3RU"], ["free_t4", "T3U"], ["free_t4", "T3UT"], ["gc_culture_other", "C&S GC"], ["gc_culture_other", "GC CULTURE ONLY"], ["gc_culture_other", "GC CULTURE SWAB"], ["gc_culture_other", "Gonorrhea Culture"], ["gc_culture_other", "Neisseria Gonorrhoeae Culture"], ["gc_culture_other", "GC CULTURE"], ["ggt", "GAMMA GLUTAMYL TRANSPEPTIDASE"], ["ggt", "GGTP"], ["ggt", "GT"], ["ggt", "GAMMA GLUTAMYL TRANSFERASE (GGT)"], ["glucose_random", "RANDOM SUGAR"], ["glucose_random", "RBS"], ["glucose_random", "RGLU"], ["glucose_random", "GLUCOSE"], ["hcv_genotype", "GENOTYPING FOR HEPATITIS C"], ["hcv_genotype", "HEP C GENOTYPE"], ["hcv_genotype", "HEP C SUBTYPE"], ["hcv_genotype", "HEPATITIS C SUBTYPE"], ["hcv_rna_quant", "HCV PCR QUANTITATIVE"], ["hcv_rna_quant", "HEP C NAT"], ["hcv_rna_quant", "HEP C RNA QUANTITATIVE"], ["hcv_rna_quant", "HEP C VIRAL LOAD"], ["hcv_rna_quant", "HEPATITIS C QUANTITATIVE NAT"], ["hcv_rna_quant", "HEPATITIS C VIRAL QUANTIFICATION"], ["hcv_rna_quant", "PCR HEPATITIS C QUANTITATIVE"], ["hcv_rna_quant", "VIRAL LOAD HEPATITIS C"], ["cbc", "ABSOLUTE EOSINOPHILS"], ["cbc", "COULTER S"], ["cbc", "DIFFERENTIAL MANUAL"], ["cbc", "EOSINOPHIL COUNT"], ["cbc", "HCT"], ["cbc", "HEMATOCRIT"], ["cbc", "HEMATOLOGY PANEL"], ["cbc", "DIFF & PC"], ["cbc", "HEMATOLOGY PROFILE"], ["cbc", "HGB"], ["cbc", "HP"], ["cbc", "NEUTROPHILS"], ["cbc", "PLATELET COUNT"], ["cbc", "PLATELET ESTIMATE"], ["cbc", "PLATELET INDICES"], ["cbc", "RBC INDICES COUNT"], ["cbc", "RDW"], ["cbc", "RED CELL DISTRIBUTION WIDTH"], ["cbc", "RED CELL INDICES"], ["cbc", "WBC"], ["cbc", "WBC DIFFERENTIAL"], ["cbc", "WHITE BLOOD COUNT"], ["peripheral_smear", "BLOOD FILM OR SMEAR FOR PATHOLOGIST REVIEW"], ["peripheral_smear", "HEMATOPATHOLOGIST"], ["peripheral_smear", "PATHOLOGIST TO REVIEW"], ["peripheral_smear", "SLIDE REVIEW BY HEMATOPATHOLOGIST OR PATHOLOGIST"], ["peripheral_smear", "PERIPHERAL SMEAR BY PATHOLOGIST; PATHOLOGIST PERIPHERAL SMEAR"], ["peripheral_smear", "SMEAR TO PATHOLOGIST"], ["peripheral_smear", "HEMATOLOGY INTERPRETATION"], ["a1c", "GLYCOSYLATED HEMOGLOBIN"], ["a1c", "GLYCOSYLATED HGB A"], ["a1c", "HEMOGLOBIN A1"], ["a1c", "HEMOGLOBIN FRACTION"], ["a1c", "HGA1C"], ["hav_immune", "ANTI HAV"], ["hav_immune", "ANTI HAV IGG"], ["hav_immune", "ANTI HAV TOTAL IgG & IgM"], ["hav_immune", "ANTI HEP A"], ["hav_immune", "ANTI HEP A IgG & IgM AB"], ["hav_immune", "ANTI HEP A IGG AB"], ["hav_immune", "ANTI HEPATITIS A AB"], ["hav_immune", "ANTI HEPATITIS A IgG & IgM AB"], ["hav_immune", "HEP A"], ["hav_immune", "HEP A AB IGG"], ["hav_immune", "HEP A AB TOTAL"], ["hav_immune", "HEP A IGG"], ["hav_immune", "HEP A IMMUNE STATUS"], ["hav_immune", "HEPATITIS A - TWINRIX"], ["hav_immune", "HEP A SCREEN"], ["hav_immune", "HEP A TOTAL IgG & IgM"], ["hav_immune", "HEPATITIS A AB IgG & IgM"], ["hav_immune", "HEPATITIS A ANTIBODY"], ["hav_immune", "HEPATITIS A ANTIBODY IgG & IgM"], ["hav_immune", "HEPATITIS A SCREEN"], ["hav_immune", "HPA"], ["hav_igm", "ANTI HAV IGM"], ["hav_igm", "ANTI HEP A IGM AB"], ["hav_igm", "HEP A AB IGM"], ["hav_igm", "HEP A IGM"], ["hav_igm", "HEPATITIS A AB IGM"], ["hav_igm", "HEPATITIS A IGM"], ["hep_chronic", "CARRIER HEPATITIS B"], ["hep_chronic", "CHRONIC HEPATITIS B"], ["hep_chronic", "HBV"], ["hep_chronic", "HBV SEROLOGY"], ["hep_chronic", "HEP B CARRIER"], ["hep_chronic", "HEP B CHRONIC"], ["hep_chronic", "HEP SCREEN"], ["hep_chronic", "HEPATITIS B CHRONIC"], ["hep_chronic", "HEPATITIS B VIRUS SURFACE ANTIGEN"], ["hep_chronic", "HEPATITIS PROTOCOL - B CARRIER"], ["hep_chronic", "VIRAL HEPATITIS - B CARRIER"], ["hep_chronic", "HEPATITIS B CARRIER"], ["hbc_ab", "ANTI HBc"], ["hbc_ab", "ANTI HBC TOTAL"], ["hbc_ab", "ANTI HEP B CORE AG"], ["hbc_ab", "ANTI HEPATITIS B CORE AG"], ["hbc_ab", "HBC AB TOTAL"], ["hbc_ab", "HBV CAB"], ["hbc_ab", "HEP B CORE AB"], ["hbc_ab", "HEPATITIS B CORE AB"], ["hbv_serology", "HEP B SCREEN"], ["hbv_serology", "HEP B SEROLOGY"], ["hbv_serology", "HEPATITIS B SCREEN"], ["hbsag", "HAA"], ["hbsag", "HBS AG"], ["hbsag", "HBV SAG"], ["hbsag", "HEPATITIS ASSOCIATED ANTIGEN"], ["hbsag", "HEPATITIS AUSTRALIAN ANTIGEN"], ["hbsag", "HPB"], ["hbsag", "HEP B"], ["hbsag", "HEPATITIS B QUERY INFECTION"], ["hep_acute", "HEP ACUTE"], ["hep_acute", "HEPATITIS PROTOCOL - ACUTE"], ["hep_acute", "VIRAL HEPATITIS - ACUTE"], ["hcv_screen", "HCV AB"], ["hcv_screen", "HEP C"], ["hcv_screen", "HEP C Ab"], ["hcv_screen", "HEP C IgG and IgM"], ["hcv_screen", "HEP C IgM and IgG"], ["hcv_screen", "HEP C QUALITITATIVE"], ["hcv_screen", "HEP C REACTIVITY"], ["hcv_screen", "HEP C SCREEN"], ["hcv_screen", "HEP C SUBSET"], ["hcv_screen", "HEP NON-A NON-B"], ["hcv_screen", "HEPATITIS NON-A NON-B"], ["hcv_screen", "REBETRON STUDY"], ["hfe", "DNA SCREEN FOR HEMOCHROMATOSIS"], ["hfe", "GENOTYPING FOR HEMOCHROMATOSIS"], ["hfe", "H63D"], ["hfe", "HEMOCHROMATOSIS"], ["hfe", "HEMOCHROMATOSIS SCREEN"], ["hfe", "HEMOCHROMATOSIS GENE MUTATION"], ["hfe", "HEMOCHROMATOSIS GENOTYPE"], ["hfe", "HEMOCHROMATOSIS GENOTYPING"], ["hfe", "HEMOCHROMATOSIS MOLECULAR DIAGNOSTIC"], ["hfe", "HEREDITARY HEMOCHROMATOSIS (HHC)"], ["hfe", "HFE"], ["hfe", "HFECD"], ["hfe", "HFECDII (Test name on intRlab label)"], ["hfe", "HEMOCHROMATOSIS CONFIRM DIAGNOSIS"], ["hiv_serology", "ANTI HIV 1 & 2"], ["hiv_serology", "ANTI-HIV 1/2"], ["hiv_serology", "HIV AB"], ["hiv_serology", "HIV AB AG"], ["hiv_serology", "HIV 1 & 2"], ["hiv_serology", "HIV 1 & 2 ANTIBODY"], ["hiv_serology", "HIV 1 & HIV 2"], ["hiv_serology", "HIV 1"], ["hiv_serology", "HIV 4TH GENERATION"], ["hiv_serology", "HIV BY EIA"], ["hiv_serology", "HIV NOMINAL"], ["hiv_serology", "HIV POOLED NAT"], ["hiv_serology", "HIV POOLED NAAT"], ["hiv_serology", "HIV POOLED NUCLEIC ACID TESTING (NAAT)"], ["hiv_serology", "HUMAN IMMUNODEFICIENCY VIRUS"], ["hiv_vl", "HIV PLASMA VIRAL LOAD"], ["hiv_vl", "HIV PLASMA VL"], ["hiv_vl", "HIV 1 RNA VIRAL LOAD"], ["hiv_vl", "HIV QUANTITATIVE"], ["hiv_vl", "HIV RNA PCR"], ["stool_culture", "AEROMONAS"], ["stool_culture", "C AND S STOOL CULTURE"], ["stool_culture", "C AND S STOOL FECAL SWAB"], ["stool_culture", "CAMPYLOBACTER"], ["stool_op", "CRYPTOSPORIDIUM"], ["stool_op", "CYCLOSPORA"], ["stool_culture", "DIARRHEA ASSOCIATED E COLI"], ["stool_culture", "E.COLI 0157/STEC/SHIGA TOXIN PRODUCING E.COLI"], ["stool_op", "ENTAMOEBA HISTOLYTICA"], ["stool_culture", "ENTERO-INVASIVE E.COLI"], ["stool_culture", "GASTROINTESTINAL PANEL"], ["stool_culture", "GI PANEL"], ["stool_op", "GIARDIA"], ["stool_culture", "GPMP"], ["stool_culture", "IDP"], ["stool_op", "OVA AND PARASITES"], ["stool_op", "O AND P"], ["stool_op", "PARASITES STOOL"], ["stool_culture", "SALMONELLA"], ["stool_culture", "SHIGELLA"], ["stool_culture", "STOOL FOR ADENOVIRUS"], ["stool_culture", "STOOL FOR ASTROVIRUS"], ["stool_culture", "STOOL FOR NOROVIRUS"], ["stool_culture", "STOOL FOR ROTAVIRUS"], ["stool_op", "STOOL OVA AND PARASITE EXAM (HIGH RISK)"], ["stool_culture", "STOOL PCR PANEL"], ["stool_culture", "STOOL VIRAL CULTURE"], ["stool_culture", "STOOL VIRUS (OTHER THAN ENTEROVIRUS)"], ["stool_culture", "VIBRIO"], ["stool_culture", "YERSINIA"], ["stool_culture", "INFECTIOUS DIARRHEA PANEL"], ["iron_tibc", "FE"], ["iron_tibc", "IBC"], ["iron_tibc", "IRON"], ["iron_tibc", "IRON BINDING CAPACITY"], ["iron_tibc", "IRON PROFILE"], ["iron_tibc", "TIBC"], ["iron_tibc", "TOTAL IRON BINDING CAPACITY"], ["iron_tibc", "UIBC"], ["iron_tibc", "UNCONJUGATED IRON-BINDING CAPACITY"], ["lipids", "BASELINE CARDIOVASCULAR RISK ASSESSMENT FULL"], ["lipids", "LDL FULL"], ["lipids", "LDL PROFILE FULL"], ["lipids", "LIPID PROFILE FULL"], ["lipids", "LIPOGRAM"], ["lipids", "LOW DENSITY LIPOPROTEIN FULL"], ["lipids", "NON HDL CHOLESTEROL FULL"], ["lipids", "SELF PAY LIPID PROFILE FULL"], ["magnesium", "MAGNESIUM SERUM"], ["magnesium", "MG"], ["bnp", "BRAIN NATRIURETIC PEPTIDE"], ["bnp", "BRAIN-TYPE NATRIURETIC PEPTIDE"], ["bnp", "BNP (B-TYPE NATRIURETIC PEPTIDE)"], ["bnp", "Natriuretic Peptide B Prohormone"], ["bnp", "NTproNP"], ["bnp", "pro BNP"], ["bnp", "NT pro BNP"], ["phosphorus", "INORGANIC PHOSPHATE"], ["phosphorus", "PO4"], ["phosphorus", "PO4 SERUM"], ["phosphorus", "PHOSPHORUS - SERUM"], ["potassium", "POTASSIUM SERUM"], ["potassium", "K SERUM"], ["inr", "COUMADIN"], ["inr", "INR ONLY"], ["inr", "INTERNATIONAL NORMALIZED RATIO"], ["inr", "PROTHROMBIN TIME"], ["inr", "PT"], ["psa", "PROSTATE SPECIFIC AG"], ["psa", "PROSTATE SPECIFIC ANTIGEN"], ["psa", "PSA TOTAL"], ["psa", "TANDEM E"], ["psa", "ULTRA-SENSITIVE PSA"], ["pth", "INTACT PARATHYROID HORMONE (IPTH)"], ["pth", "PARATHYROID HORMONE INTACT"], ["ptt", "ACTIVATED PARTIAL THROMBPLASTIN TIME (aPTT)"], ["ptt", "aPTT"], ["ptt", "(a)PTT"], ["ptt", "little a PTT"], ["syphilis", "ART"], ["syphilis", "FLUORESCENT TREPONEMAL ANTIBODY ABSORPTION"], ["syphilis", "FTA ANTIBODIES"], ["syphilis", "MHA-TP"], ["syphilis", "MICROHEMAGGLUTINATION TREPONEMA PALLIDUM"], ["syphilis", "RPR BY EIA"], ["syphilis", "STS"], ["syphilis", "SYPHILIS (BCCDC) BY EIA"], ["syphilis", "SYPHILIS CONFIRMATORY"], ["syphilis", "SYPHILIS SEROLOGY (IgG and/or IgM)"], ["syphilis", "TPPA"], ["syphilis", "TREPONEMAL AB"], ["syphilis", "TREPONEMA PALLIDUM SEROLOGY"], ["syphilis", "VDRL"], ["syphilis", "SYPHILIS SCREEN (BLOOD)"], ["tsh_monitor", "THYROID FUNCTION TEST"], ["tsh_monitor", "THYROID STIMULATING HORMONE"], ["tsh_monitor", "THYROID STUDIES"], ["tsh_monitor", "THYROTROPIN"], ["urea", "BLOOD UREA NITROGEN"], ["urea", "UREA NITROGEN"], ["urea", "UREA SERUM"], ["urine_macro", "URINALYSIS MACROSCOPIC"], ["urine_macro", "URINE ACETONE"], ["urine_macro", "URINE BILE PIGMENT"], ["urine_macro", "URINE CHEMISTRY"], ["urine_macro", "URINE DIP STICK"], ["urine_macro", "URINE DIPSTICK"], ["urine_macro", "URINE KETO ACIDS"], ["urine_macro", "URINE KETONES"], ["urine_macro", "URINE SPECIFIC GRAVITY"], ["urine_macro", "URINE MACROSCOPIC"], ["urine_macro_micro", "URINALYSIS"], ["urine_macro_micro", "URINALYSIS MACROSCOPIC + MACROSCOPIC/MICROSCOPIC IF INDICATED"], ["urine_macro_micro", "URINALYSIS MACROSCOPIC + MICROSCOPIC"], ["urine_macro_micro", "URINALYSIS MACROSCOPIC/MICROSCOPIC IF INDICATED"], ["urine_macro_micro", "URINALYSIS MICROSCOPIC + MACROSCOPIC/MICROSCOPIC IF INDICATED"], ["urine_macro_micro", "URINALYSIS - ROUTINE & MICROSCOPIC"], ["urine_macro_micro", "URINE CHEMISTRY & MICROSCOPIC"], ["urine_macro_micro", "URINE MICRO IF IND"], ["urine_macro_micro", "URINE MICRO II"], ["urine_macro_micro", "URINE MICROSCOPIC IF INDICATED"], ["urine_micro", "URINALYSIS MICROSCOPIC"], ["urine_micro", "URINE CASTS"], ["urine_micro", "URINE MICROSCOPIC"], ["pregnancy", "PG"], ["pregnancy", "PREG TEST"], ["pregnancy", "PREGNANCY URINE"], ["pregnancy", "URINE HCG"], ["pregnancy", "URINE PREGNANCY TEST"], ["drug_valproic", "DEPAKENE"], ["drug_valproic", "DIVALPROEX"], ["drug_valproic", "EPIVAL"], ["drug_valproic", "VALPROATE"], ["b12", "COBALAMINE"], ["b12", "CYANOCOBALAMINE"], ["b12", "TOTAL B12"], ["b12", "TOTAL VITAMIN B12"], ["b12", "VITAMIN B12 TOTAL"], ["hcv_screen", "Acute Hepatitis"], ["hcv_screen", "Anti Hepatitis C antibody"], ["hcv_screen", "Chronic Hepatitis"], ["hcv_screen", "Convalescent Hepatitis"], ["hcv_screen", "Recent Hepatitis"], ["hcv_screen", "HCV"], ["hiv_serology", "Acquired immune deficiency syndrome"], ["hiv_serology", "AIDS"], ["hiv_serology", "Anti HIV 1 and 2 antibody"], ["hiv_serology", "p24 antigen"], ["syphilis", "FTA (Fluorescent Treponemal Antibody)"], ["syphilis", "RPR (Rapid Plasma Reagin)"], ["syphilis", "Treponema pallidum"], ["syphilis", "TPPA (Treponema pallidum Particle Agglutination)"], ["syphilis", "Routine prenatal infectious disease screen"], ["urine_trich", "Trich"], ["urine_trich", "Trichomoniasis"], ["hcv_genotype", "HCV genotyping"], ["hcv_genotype", "Genotype"]];
/* LIFELABS-AKA:END */
// v3.2: extra tests from the LifeLabs Lab Test Information exports are appended AFTER the base list, and their AKA synonyms are
// added after all base synonyms, so on an exact tie the original synonym still wins (scanner behaviour unchanged).
for(const r of EXTRA_TESTS)T.push(r);
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
for(const [id,syn] of AKA){const n=norm(syn);if(!ENTRIES.some(e=>e.id===id&&e.syn===n))ENTRIES.push({id,syn:n,aka:true});}
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
