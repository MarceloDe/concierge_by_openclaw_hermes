export const AI2UI_BLOCK_CONTRACT_VERSION = "brainstyworkers.ai2ui.blocks.v1";

export const AI2UI_BLOCK_TYPES = Object.freeze({
  ANSWER_MARKDOWN: "answer_markdown",
  WORKFLOW_STATUS: "workflow_status",
  COST_COMPARISON: "cost_comparison",
  PHARMACY_FORMULARY: "pharmacy_formulary",
  PROCEDURE_CHECKLIST: "procedure_checklist",
  PROVIDER_NETWORK: "provider_network",
  APPROVAL_GATE: "approval_gate",
  WORKER_STATUS: "worker_status",
  SOURCE_CITATIONS: "source_citations",
  MEMORY_STATUS: "memory_status",
  HUMAN_HANDOFF: "human_handoff",
  SAFETY_NOTICE: "safety_notice",
  NEXT_STEPS: "next_steps",
  UNKNOWN: "unknown"
});

const SUPPORTED_TYPES = new Set(Object.values(AI2UI_BLOCK_TYPES));

function safeString(value, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function blockId(state, type, index) {
  const root = state?.graph_trace_id ?? state?.session_id ?? "graph";
  return `${root}:${type}:${index}`;
}

function previewPayload(value) {
  try {
    return JSON.stringify(value ?? {}).slice(0, 600);
  } catch {
    return String(value ?? "").slice(0, 600);
  }
}

export function normalizeAi2UiBlock(block, index = 0) {
  const type = safeString(block?.type, AI2UI_BLOCK_TYPES.UNKNOWN);
  if (!SUPPORTED_TYPES.has(type) || type === AI2UI_BLOCK_TYPES.UNKNOWN) {
    return {
      id: safeString(block?.id, `unknown:${index}`),
      type: AI2UI_BLOCK_TYPES.UNKNOWN,
      version: AI2UI_BLOCK_CONTRACT_VERSION,
      title: "Unsupported UI block",
      payload: {
        originalType: type,
        safePreview: previewPayload(block?.payload ?? block)
      },
      renderHints: {
        severity: "warning",
        fallback: "safe_json_preview"
      }
    };
  }
  return {
    id: safeString(block.id, `${type}:${index}`),
    type,
    version: AI2UI_BLOCK_CONTRACT_VERSION,
    title: safeString(block.title, humanTitle(type)),
    payload: block.payload ?? {},
    renderHints: block.renderHints ?? {}
  };
}

export function normalizeAi2UiBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).map((block, index) => normalizeAi2UiBlock(block, index));
}

function humanTitle(type) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourcePointersFromState(state = {}) {
  return (state.source_pointers ?? []).map((pointer) => ({
    table: pointer.table ?? null,
    id: pointer.id ?? pointer.rowId ?? null,
    kind: pointer.kind ?? pointer.table ?? "source_pointer",
    displayLabel: pointer.displayLabel ?? pointer.summary ?? pointer.sourceUrl ?? `${pointer.table ?? "source"}/${pointer.id ?? pointer.rowId ?? "unknown"}`,
    sourceUrl: pointer.sourceUrl ?? null,
    summary: pointer.summary ?? null,
    createdAt: pointer.createdAt ?? pointer.created_at ?? null,
    extractionHash: pointer.extractionHash ?? pointer.sha256 ?? null,
    evidenceFieldCount: Array.isArray(pointer.evidenceFields) ? pointer.evidenceFields.length : 0
  }));
}

function sourcePointerRef(pointer = {}) {
  return [pointer.table ?? pointer.kind ?? "source", pointer.id ?? pointer.rowId ?? "unknown"].filter(Boolean).join("/");
}

function costComparisonRequested(state = {}) {
  const text = `${state.user_input ?? ""} ${state.structured_intent?.intent ?? ""} ${state.llm_orchestration_decision?.primary_intent ?? ""}`.toLowerCase();
  return /\b(cost|costs|estimate|comparison|compare|cheaper|lower[- ]cost|cash price|allowed amount|deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|oop|owe|pay)\b/.test(text);
}

function pharmacyFormularyRequested(state = {}) {
  const text = `${state.user_input ?? ""} ${state.workflow ?? ""} ${state.structured_intent?.intent ?? ""} ${state.structured_intent?.reasoning?.primary_intent ?? ""} ${state.llm_orchestration_decision?.primary_intent ?? ""}`.toLowerCase();
  return /\b(pharmacy|formulary|prescription|medication|medicine|drug list|drug tier|tier\s+\d|rx\b|prior auth(?:orization)? for.*(?:drug|medicine|medication)|mail[- ]order|specialty drug|quantity limit|step therapy)\b/.test(text);
}

function procedureChecklistRequested(state = {}) {
  const text = `${state.user_input ?? ""} ${state.workflow ?? ""} ${state.structured_intent?.intent ?? ""} ${state.structured_intent?.reasoning?.primary_intent ?? ""} ${state.llm_orchestration_decision?.primary_intent ?? ""}`.toLowerCase();
  return /\b(procedure prep|procedure checklist|prep checklist|administrative checklist|pre[- ]op|preop|surgery prep|colonoscopy prep|appointment prep|before (?:my|the) (?:procedure|surgery|appointment)|bring.*(?:id|insurance card)|referral|order|pre[- ]register|registration|arrival time|arrive|driver|transportation|facility instructions|procedure instructions)\b/.test(text);
}

function providerNetworkRequested(state = {}) {
  const text = `${state.user_input ?? ""} ${state.workflow ?? ""} ${state.structured_intent?.intent ?? ""} ${state.structured_intent?.reasoning?.primary_intent ?? ""} ${state.llm_orchestration_decision?.primary_intent ?? ""}`.toLowerCase();
  return /\b(provider|doctor|clinician|facility|hospital|clinic|lab|imaging center|specialist|directory|network|in[- ]network|out[- ]of[- ]network|participating|non[- ]participating|accepting new patients|npi)\b/.test(text);
}

function costText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function firstCostValue(text) {
  const match = costText(text).match(/\$\s?\d[\d,]*(?:\.\d{2})?|\b\d{1,3}%\b|\b\d+\s?percent\b/i);
  return match?.[0] ?? null;
}

function costConfidence(pointer = {}, field = {}) {
  return field.confidence ?? pointer.confidence ?? pointer.citation?.confidence ?? "source_backed";
}

function pointerEvidenceTexts(pointer = {}) {
  const fields = Array.isArray(pointer.evidenceFields) ? pointer.evidenceFields : [];
  return [
    pointer.summary,
    pointer.displayLabel,
    pointer.balanceType,
    pointer.shareAmount,
    pointer.totalAmount,
    pointer.spentAmount,
    pointer.remainingAmount,
    ...fields.map((field) => `${field.label ?? "field"} ${field.value ?? ""}`)
  ].map(costText).filter(Boolean);
}

function buildCostRowsFromPointer(pointer = {}) {
  const ref = sourcePointerRef(pointer);
  const rows = [];
  if (pointer.table === "coverage_balances" && (pointer.remainingAmount !== undefined || pointer.totalAmount !== undefined || pointer.spentAmount !== undefined)) {
    rows.push({
      optionLabel: pointer.summary?.split(":")[0] ?? pointer.balanceType ?? "Coverage balance",
      costSignal: [
        pointer.totalAmount !== undefined ? `total ${pointer.totalAmount}` : null,
        pointer.spentAmount !== undefined ? `spent ${pointer.spentAmount}` : null,
        pointer.remainingAmount !== undefined ? `remaining ${pointer.remainingAmount}` : null
      ].filter(Boolean).join("; "),
      assumption: "Accumulator values are displayed exactly as stored from the cited portal/source pointer.",
      evidenceSummary: pointer.summary ?? "Coverage balance source pointer.",
      sourcePointerIds: [ref],
      confidence: "source_backed",
      tradeoff: "Use this as a plan accumulator signal, not a provider price quote."
    });
  }
  if (pointer.table === "claim_items" && pointer.shareAmount !== undefined && pointer.shareAmount !== null) {
    rows.push({
      optionLabel: pointer.description ?? "Claim or EOB item",
      costSignal: `patient share ${pointer.shareAmount}`,
      assumption: "Claim share is historical evidence and may not predict a future service price.",
      evidenceSummary: pointer.summary ?? "Claim source pointer.",
      sourcePointerIds: [ref],
      confidence: "source_backed",
      tradeoff: "Useful for comparing prior responsibility, not for guaranteeing future cost."
    });
  }
  const fields = Array.isArray(pointer.evidenceFields) ? pointer.evidenceFields : [];
  for (const field of fields) {
    const text = costText(`${field.label ?? ""} ${field.value ?? ""}`);
    if (!/\b(cost|estimate|price|allowed amount|deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|oop|patient responsibility|cash price|pay|owe)\b|\$\s?\d|\b\d{1,3}%\b/i.test(text)) continue;
    rows.push({
      optionLabel: costText(field.label) || pointer.displayLabel || pointer.summary?.slice(0, 72) || "Source-backed cost signal",
      costSignal: firstCostValue(text) ?? costText(field.value ?? text).slice(0, 96),
      assumption: "This row quotes only the cited evidence. It is not a new price estimate.",
      evidenceSummary: costText(field.value ?? text).slice(0, 220),
      sourcePointerIds: [ref],
      confidence: costConfidence(pointer, field),
      tradeoff: "Compare with current plan terms, provider network status, and claim context before acting."
    });
  }
  if (!rows.length) {
    const evidence = pointerEvidenceTexts(pointer).find((text) => /\b(cost|estimate|price|allowed amount|deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|oop|patient responsibility|cash price|pay|owe)\b|\$\s?\d|\b\d{1,3}%\b/i.test(text));
    if (evidence) {
      rows.push({
        optionLabel: pointer.displayLabel ?? pointer.summary?.slice(0, 72) ?? "Source-backed cost signal",
        costSignal: firstCostValue(evidence) ?? "cost term found",
        assumption: "Evidence contains a cost-related signal but not enough structured data for an exact estimate.",
        evidenceSummary: evidence.slice(0, 220),
        sourcePointerIds: [ref],
        confidence: pointer.citation?.confidence ?? pointer.confidence ?? "source_backed",
        tradeoff: "Use as a comparison clue; request more evidence before choosing an option."
      });
    }
  }
  return rows;
}

function buildCostComparisonPayload(state = {}) {
  const requested = costComparisonRequested(state);
  const rows = (state.source_pointers ?? [])
    .flatMap(buildCostRowsFromPointer)
    .filter((row) => row.sourcePointerIds.length > 0)
    .slice(0, 6);
  if (!requested && !rows.length) return null;
  const rowSourcePointerRefs = [...new Set(rows.flatMap((row) => row.sourcePointerIds))];
  return {
    status: rows.length ? (rows.length > 1 ? "source_backed_comparison_ready" : "single_source_backed_cost_signal") : "blocked_missing_source_pointers",
    requested,
    rows,
    rowCount: rows.length,
    sourcePointerIds: rowSourcePointerRefs,
    assumptions: rows.length
      ? [
          "Rows show only cited cost signals already present in source pointers.",
          "Exact future prices are not guaranteed without current provider, service, network, claim, and plan evidence."
        ]
      : [
          "A cost comparison needs a cited plan document, claim/EOB, portal accumulator, provider estimate, or trusted reviewed research source.",
          "The system will not fabricate exact prices without source pointers."
        ],
    safety: {
      noFabricatedExactPrices: true,
      everyRowHasSourcePointer: rows.every((row) => row.sourcePointerIds.length > 0),
      externalActionsTaken: false
    }
  };
}

function pharmacyEvidenceText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function firstMedicationName(text) {
  const cleaned = pharmacyEvidenceText(text);
  const generic = /^(coverage|formulary|status|benefit|snippet|evidence|listed|covered|plan)$/i;
  const quoted = cleaned.match(/["']([^"']{3,48})["']/);
  if (quoted?.[1]) return quoted[1].trim();
  const questionSubject = cleaned.match(/\b(?:is|does|will|would|can)\s+([A-Z][A-Za-z0-9-]{2,})\b.{0,80}\b(?:formulary|covered|tier|drug|prescription|pharmacy)\b/i);
  if (questionSubject?.[1] && !generic.test(questionSubject[1])) return questionSubject[1].trim();
  const explicit = cleaned.match(/\b(?:medication|medicine|drug|prescription|rx)\s*(?:name|for|:)?\s+([A-Z][A-Za-z0-9-]{2,})/i);
  const candidate = explicit?.[1]?.trim();
  if (candidate && !generic.test(candidate)) return candidate;
  return null;
}

function pharmacySignalFromText(text) {
  const lower = pharmacyEvidenceText(text).toLowerCase();
  if (!lower) return null;
  if (/\bnot covered|excluded|non[- ]formulary|not on formulary\b/.test(lower)) return "not_covered_or_non_formulary_signal";
  if (/\bcovered|on formulary|preferred|generic covered|brand covered\b/.test(lower)) return "covered_or_on_formulary_signal";
  if (/\bformulary|drug list|pharmacy benefit|prescription coverage|rx\b/.test(lower)) return "formulary_signal_found";
  return null;
}

function pharmacyRequirementsFromText(text) {
  const lower = pharmacyEvidenceText(text).toLowerCase();
  return [
    /\bprior auth(?:orization)?|pa required\b/.test(lower) ? "prior_authorization_signal" : null,
    /\bquantity limit|ql\b/.test(lower) ? "quantity_limit_signal" : null,
    /\bstep therapy\b/.test(lower) ? "step_therapy_signal" : null,
    /\bspecialty\b/.test(lower) ? "specialty_pharmacy_signal" : null,
    /\bmail[- ]order\b/.test(lower) ? "mail_order_signal" : null,
    /\btier\s*(?:1|2|3|4|5|one|two|three|four|five)\b/.test(lower) ? "tier_signal" : null
  ].filter(Boolean);
}

function strongestPharmacySignal(text) {
  const signals = [
    pharmacySignalFromText(text),
    ...pharmacyEvidenceText(text)
      .split(/[.;]/)
      .map(pharmacySignalFromText)
      .filter(Boolean)
  ];
  if (signals.includes("not_covered_or_non_formulary_signal")) return "not_covered_or_non_formulary_signal";
  if (signals.includes("covered_or_on_formulary_signal")) return "covered_or_on_formulary_signal";
  return signals[0] ?? null;
}

function buildPharmacyRowsFromPointer(pointer = {}, queryText = "") {
  const ref = sourcePointerRef(pointer);
  const fields = Array.isArray(pointer.evidenceFields) ? pointer.evidenceFields : [];
  const texts = [
    { label: "Source summary", value: pointer.summary, confidence: pointer.confidence ?? pointer.citation?.confidence },
    { label: "Source label", value: pointer.displayLabel, confidence: pointer.confidence ?? pointer.citation?.confidence },
    ...fields.map((field) => ({
      label: field.label ?? "Evidence field",
      value: field.value ?? field.text ?? field.summary ?? "",
      confidence: field.confidence ?? pointer.confidence ?? pointer.citation?.confidence
    }))
  ];
  const combined = texts.map((item) => pharmacyEvidenceText(`${item.label ?? ""} ${item.value ?? ""}`)).filter(Boolean).join(" ");
  const formularySignal = strongestPharmacySignal(combined);
  const requirements = [...new Set(texts.flatMap((item) => pharmacyRequirementsFromText(`${item.label ?? ""} ${item.value ?? ""}`)))];
  if (!formularySignal && !requirements.length) return [];
  return [
    {
      medicationLabel: firstMedicationName(combined) ?? firstMedicationName(queryText) ?? "Medication or pharmacy benefit",
      formularySignal: formularySignal ?? "pharmacy_requirement_signal_found",
      requirements,
      evidenceSummary: texts.map((item) => pharmacyEvidenceText(item.value ?? "")).filter(Boolean).join(" ").slice(0, 240),
      sourcePointerIds: [ref],
      confidence: texts.find((item) => item.confidence)?.confidence ?? pointer.confidence ?? pointer.citation?.confidence ?? "source_backed",
      userAction:
        "Use the cited plan, portal, upload, or reviewed research evidence; ask the prescriber or pharmacist for clinical substitutions."
    }
  ];
}

function buildPharmacyFormularyPayload(state = {}) {
  const requested = pharmacyFormularyRequested(state);
  const rows = (state.source_pointers ?? [])
    .flatMap((pointer) => buildPharmacyRowsFromPointer(pointer, state.user_input))
    .filter((row) => row.sourcePointerIds.length > 0)
    .slice(0, 6);
  if (!requested && !rows.length) return null;
  const sourcePointerIds = [...new Set(rows.flatMap((row) => row.sourcePointerIds))];
  return {
    status: rows.length ? "source_backed_pharmacy_answer_ready" : "blocked_missing_source_pointers",
    requested,
    rows,
    rowCount: rows.length,
    sourcePointerIds,
    missingEvidence: rows.length
      ? []
      : [
          "cited formulary or drug-list evidence",
          "plan pharmacy-benefit document",
          "trusted reviewed research artifact",
          "approved read-only portal or uploaded document source pointer"
        ],
    safety: {
      noMedicationAdvice: true,
      noClinicalSubstitutionAdvice: true,
      everyRowHasSourcePointer: rows.every((row) => row.sourcePointerIds.length > 0),
      externalActionsTaken: false
    }
  };
}

function procedureEvidenceText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function procedureCategoryFromText(text) {
  const lower = procedureEvidenceText(text).toLowerCase();
  if (/\b(prior auth|prior authorization|precert|precertification|authorization|referral|order)\b/.test(lower)) return "insurance_authorization";
  if (/\b(id card|insurance card|photo id|document|paperwork|forms?|consent)\b/.test(lower)) return "documents_and_id";
  if (/\b(arrive|arrival|check[- ]?in|register|pre[- ]register|appointment time|schedule|location|facility)\b/.test(lower)) return "scheduling_and_arrival";
  if (/\b(cost|estimate|deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|oop)\b/.test(lower)) return "cost_or_benefit_confirmation";
  if (/\b(driver|transportation|ride|escort|responsible adult)\b/.test(lower)) return "transportation_or_support";
  if (/\b(fast|fasting|prep instructions?|medicine|medication|clinical|diet|lab|testing)\b/.test(lower)) return "clinical_instruction_pointer";
  return "administrative_preparation";
}

function procedureTaskFromText(text) {
  const lower = procedureEvidenceText(text).toLowerCase();
  if (/\b(prior auth|prior authorization|precert|precertification|authorization)\b/.test(lower)) return "Confirm whether prior authorization or precertification is documented.";
  if (/\breferral\b/.test(lower)) return "Confirm the referral requirement and source.";
  if (/\border\b/.test(lower)) return "Confirm the provider order or procedure order is available.";
  if (/\b(id card|insurance card|photo id)\b/.test(lower)) return "Bring the cited ID or insurance card materials.";
  if (/\b(pre[- ]register|registration|check[- ]?in)\b/.test(lower)) return "Complete or review the cited registration/check-in step.";
  if (/\b(arrive|arrival|appointment time|location|facility)\b/.test(lower)) return "Review the cited arrival time, location, or facility instruction.";
  if (/\b(cost|estimate|deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|oop)\b/.test(lower)) return "Review the cited cost or benefit confirmation.";
  if (/\b(driver|transportation|ride|escort|responsible adult)\b/.test(lower)) return "Confirm the cited transportation or support requirement.";
  if (/\b(fast|fasting|prep instructions?|medicine|medication|clinical|diet|lab|testing)\b/.test(lower)) return "Follow only the cited clinician/facility instruction and confirm clinical questions with the care team.";
  return procedureEvidenceText(text).slice(0, 140) || "Review the cited procedure preparation evidence.";
}

function procedureTimingFromText(text) {
  const cleaned = procedureEvidenceText(text);
  const match = cleaned.match(/\b(?:\d+\s*(?:day|days|hour|hours|hr|hrs)|day before|night before|morning of|before arrival|before the appointment|before the procedure|at least \d+\s*(?:day|days|hour|hours))\b/i);
  return match?.[0] ?? null;
}

function procedureRowSignals(text) {
  const lower = procedureEvidenceText(text).toLowerCase();
  return [
    /\b(prior auth|prior authorization|precert|precertification|authorization)\b/.test(lower) ? "authorization_signal" : null,
    /\breferral\b/.test(lower) ? "referral_signal" : null,
    /\border\b/.test(lower) ? "order_signal" : null,
    /\b(id card|insurance card|photo id|document|paperwork|forms?|consent)\b/.test(lower) ? "document_signal" : null,
    /\b(arrive|arrival|check[- ]?in|register|pre[- ]register|appointment time|location|facility)\b/.test(lower) ? "arrival_or_registration_signal" : null,
    /\b(driver|transportation|ride|escort|responsible adult)\b/.test(lower) ? "transportation_signal" : null,
    /\b(cost|estimate|deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|oop)\b/.test(lower) ? "cost_or_benefit_signal" : null,
    /\b(fast|fasting|prep instructions?|medicine|medication|clinical|diet|lab|testing)\b/.test(lower) ? "clinical_instruction_pointer_signal" : null
  ].filter(Boolean);
}

function buildProcedureRowsFromPointer(pointer = {}) {
  const ref = sourcePointerRef(pointer);
  const fields = Array.isArray(pointer.evidenceFields) ? pointer.evidenceFields : [];
  const texts = [
    { label: "Source summary", value: pointer.summary, confidence: pointer.confidence ?? pointer.citation?.confidence },
    { label: "Source label", value: pointer.displayLabel, confidence: pointer.confidence ?? pointer.citation?.confidence },
    ...fields.map((field) => ({
      label: field.label ?? "Evidence field",
      value: field.value ?? field.text ?? field.summary ?? "",
      confidence: field.confidence ?? pointer.confidence ?? pointer.citation?.confidence
    }))
  ];
  return texts
    .map((item) => {
      const text = procedureEvidenceText(`${item.label ?? ""} ${item.value ?? ""}`);
      const signals = procedureRowSignals(text);
      if (!signals.length) return null;
      return {
        taskLabel: procedureTaskFromText(text),
        category: procedureCategoryFromText(text),
        timing: procedureTimingFromText(text),
        signals,
        evidenceSummary: procedureEvidenceText(item.value ?? text).slice(0, 260),
        sourcePointerIds: [ref],
        confidence: item.confidence ?? pointer.confidence ?? pointer.citation?.confidence ?? "source_backed",
        userAction:
          procedureCategoryFromText(text) === "clinical_instruction_pointer"
            ? "Confirm clinical or medication questions with the care team; the agent is only pointing to cited instructions."
            : "Use the cited source pointer to prepare questions or documents before the appointment."
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function buildProcedureChecklistPayload(state = {}) {
  const requested = procedureChecklistRequested(state);
  const rows = (state.source_pointers ?? [])
    .flatMap(buildProcedureRowsFromPointer)
    .filter((row) => row.sourcePointerIds.length > 0)
    .slice(0, 8);
  if (!requested && !rows.length) return null;
  const sourcePointerIds = [...new Set(rows.flatMap((row) => row.sourcePointerIds))];
  return {
    status: rows.length ? "source_backed_procedure_checklist_ready" : "blocked_missing_source_pointers",
    requested,
    rows,
    rowCount: rows.length,
    sourcePointerIds,
    missingEvidence: rows.length
      ? []
      : [
          "cited procedure or facility instruction",
          "plan authorization/referral evidence",
          "uploaded pre-procedure document",
          "approved read-only portal or reviewed research source pointer"
        ],
    safety: {
      administrativeSupportOnly: true,
      noMedicalAdvice: true,
      noClinicalInstructionCreation: true,
      everyRowHasSourcePointer: rows.every((row) => row.sourcePointerIds.length > 0),
      externalActionsTaken: false
    }
  };
}

function providerNetworkEvidenceText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function providerNetworkSignalFromText(text) {
  const lower = providerNetworkEvidenceText(text).toLowerCase();
  if (/\b(out[- ]of[- ]network|non[- ]participating|not participating|not in network|excluded from network)\b/.test(lower)) return "out_of_network_signal";
  if (/\b(in[- ]network|participating|network provider|network facility|listed in (?:the )?(?:network|directory)|directory lists|covered provider)\b/.test(lower)) return "in_network_signal";
  if (/\baccepting new patients\b/.test(lower)) return "accepting_new_patients_signal";
  if (/\b(provider directory|network directory|directory evidence|plan directory)\b/.test(lower)) return "network_directory_signal";
  return null;
}

function providerNetworkDetailsFromText(text) {
  const lower = providerNetworkEvidenceText(text).toLowerCase();
  return [
    /\bnpi\b|\bnational provider identifier\b/.test(lower) ? "npi_signal" : null,
    /\b(specialty|specialist|cardiology|orthopedics|dermatology|imaging|radiology|laboratory|lab)\b/.test(lower) ? "specialty_or_service_signal" : null,
    /\b(facility|hospital|clinic|imaging center|lab|laboratory)\b/.test(lower) ? "facility_signal" : null,
    /\baccepting new patients\b/.test(lower) ? "accepting_new_patients_signal" : null,
    /\b(referral required|referral may be required|referral requirement|requires referral)\b/.test(lower) ? "referral_signal" : null,
    /\b(prior auth|prior authorization|authorization|precert|precertification)\b/.test(lower) ? "authorization_signal" : null,
    /\b(address|location|distance|miles|nearby|zip|city|state)\b/.test(lower) ? "location_signal" : null
  ].filter(Boolean);
}

function providerLabelFromText(text) {
  const cleaned = providerNetworkEvidenceText(text);
  const quoted = cleaned.match(/["“]([^"”]{3,90})["”]/);
  if (quoted?.[1]) return quoted[1].trim();
  const facilitySuffix = cleaned.match(/\b([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,6}\s+(?:Imaging Center|Medical Center|Health Center|Surgery Center|Hospital|Clinic|Laboratory|Lab|Facility|Group|Practice))\b/);
  if (facilitySuffix?.[1]) return facilitySuffix[1].trim();
  const leading = cleaned.match(/^([A-Z][A-Za-z0-9&'. -]{3,90}?)\s+(?:is|appears|was|shows|lists|listed)\b/);
  if (leading?.[1]) return leading[1].trim();
  const inlineListed = cleaned.match(/\b([A-Z][A-Za-z0-9&'. -]{3,90}?)\s+(?:is|appears|was)\s+(?:listed|shown|marked|identified)\b/);
  if (inlineListed?.[1]) return inlineListed[1].trim();
  const named = cleaned.match(/\b(?:provider|doctor|clinician|facility|hospital|clinic|lab|imaging center|specialist)\s*(?:name|for|:)?\s+([A-Z][A-Za-z0-9&'. -]{3,90})/);
  if (named?.[1]) return named[1].replace(/\s+(?:is|appears|was|shows|lists|listed)\b.*$/i, "").trim();
  const query = cleaned.match(/\b(?:is|does|can)\s+([A-Z][A-Za-z0-9&'. -]{3,90}?)\s+(?:in[- ]network|out[- ]of[- ]network|accepting|participating|covered|listed)\b/);
  if (query?.[1]) return query[1].trim();
  return null;
}

function buildProviderNetworkRowsFromPointer(pointer = {}, queryText = "") {
  const ref = sourcePointerRef(pointer);
  const fields = Array.isArray(pointer.evidenceFields) ? pointer.evidenceFields : [];
  const primaryEvidenceText = providerNetworkEvidenceText(fields[0]?.value ?? fields[0]?.text ?? fields[0]?.summary ?? pointer.summary ?? "");
  const combinedText = providerNetworkEvidenceText(
    [
      pointer.summary,
      pointer.displayLabel,
      ...fields.map((field) => `${field.label ?? "Evidence field"} ${field.value ?? field.text ?? field.summary ?? ""}`)
    ].filter(Boolean).join(" ")
  );
  const signal = providerNetworkSignalFromText(combinedText);
  const details = providerNetworkDetailsFromText(combinedText);
  const providerSpecificDetails = details.filter((detail) =>
    ["npi_signal", "accepting_new_patients_signal", "location_signal"].includes(detail)
  );
  if (!signal && !providerSpecificDetails.length) return [];
  return [
    {
      providerLabel: providerLabelFromText(primaryEvidenceText) ?? providerLabelFromText(combinedText) ?? providerLabelFromText(queryText) ?? "Provider or facility option",
      networkSignal: signal ?? "network_evidence_signal_found",
      details,
      evidenceSummary: providerNetworkEvidenceText(primaryEvidenceText || pointer.summary || combinedText).slice(0, 280),
      sourcePointerIds: [ref],
      confidence: fields[0]?.confidence ?? pointer.confidence ?? pointer.citation?.confidence ?? "source_backed",
      userAction: "Use the cited directory, plan, portal, or document pointer to confirm status before scheduling or care decisions."
    }
  ];
}

function buildProviderNetworkPayload(state = {}) {
  const requested = providerNetworkRequested(state);
  const rows = (state.source_pointers ?? [])
    .flatMap((pointer) => buildProviderNetworkRowsFromPointer(pointer, state.user_input ?? ""))
    .filter((row) => row.sourcePointerIds.length > 0)
    .slice(0, 8);
  if (!requested && !rows.length) return null;
  const sourcePointerIds = [...new Set(rows.flatMap((row) => row.sourcePointerIds))];
  return {
    status: rows.length ? "source_backed_provider_network_ready" : "blocked_missing_source_pointers",
    requested,
    rows,
    rowCount: rows.length,
    sourcePointerIds,
    missingEvidence: rows.length
      ? []
      : [
          "cited provider directory or network directory evidence",
          "member plan/network context",
          "uploaded referral, provider, or facility document",
          "approved read-only portal or reviewed research source pointer"
        ],
    safety: {
      evidenceNavigationOnly: true,
      noNetworkGuarantee: true,
      noProviderContact: true,
      noSchedulingAction: true,
      everyRowHasSourcePointer: rows.every((row) => row.sourcePointerIds.length > 0),
      externalActionsTaken: false
    }
  };
}

function approvalPayload(state = {}) {
  const proposal = state.openclaw_skill_proposal ?? {};
  const evidence = state.evidence_observation ?? {};
  const validation = state.openclaw_skill_validation ?? {};
  const approval = evidence.approval ?? state.approval_resume ?? {};
  const status =
    approval.status ??
    (String(evidence.status ?? "").includes("waiting_for_approval") ? "needed" : null) ??
    proposal.task?.status ??
    proposal.status ??
    "not_requested";
  return {
    status,
    taskId: evidence.workerContinuation?.taskId ?? proposal.task?.id ?? null,
    approvalTokenConsumed: ["consumed", "approved_consumed"].includes(status) || Boolean(state.source_pointers?.length),
    approvalScope: approval.approvalScope ?? evidence.approvalScope ?? validation.approvalScope ?? "read_only_observation",
    allowedAction: approval.allowedAction ?? evidence.allowedAction ?? null,
    approvalsRequired: validation.approvalsRequired ?? [],
    executionMode: validation.executionMode ?? proposal.executionMode ?? "proposal_only",
    actionsTaken: validation.actionsTaken ?? evidence.actionsTaken ?? []
  };
}

function workerPayload(state = {}) {
  const evidence = state.evidence_observation ?? {};
  return {
    status: evidence.status ?? "not_requested",
    terminalOutcome: evidence.workerTerminalOutcome ?? evidence.terminalOutcome ?? state.workflow_outcome ?? "not_reported",
    actionsTaken: evidence.actionsTaken ?? [],
    sourcePointerCount: state.source_pointers?.length ?? 0,
    continuationId: evidence.workerContinuation?.id ?? state.worker_continuation?.id ?? null,
    blocker: evidence.blocker ?? evidence.reason ?? evidence.error ?? evidence.officialOpenClaw?.blocker ?? null,
    evidenceChannels: evidence.evidenceChannels ?? [],
    discoveryAvailable: Boolean(evidence.discoveryReport)
  };
}

function memoryPayload(state = {}, productMemory = {}) {
  const retain = state.product_memory_retain ?? productMemory.retain ?? {};
  const recall = state.product_memory_recall ?? productMemory.recall ?? {};
  return {
    adapter: retain.adapter ?? recall.adapter ?? "graphiti",
    recallStatus: recall.ok === false ? "recall_failed" : recall.status ?? (recall.enabled === false ? "disabled" : "available"),
    recalledFactCount: recall.facts?.length ?? 0,
    retainStatus: retain.status ?? retain.repairStatus ?? (retain.retained ? "retained" : retain.enabled === false ? "disabled" : "not_reported"),
    retained: Boolean(retain.retained),
    episodeUuid: retain.episodeUuid ?? null,
    nextAction: retain.repairPlan?.nextAction ?? retain.message ?? retain.error ?? null,
    cortexProductMemory: false
  };
}

function nextStepsForState(state = {}) {
  const approval = approvalPayload(state);
  const worker = workerPayload(state);
  const pointers = sourcePointersFromState(state);
  if (state.human_handoff?.handoff) {
    return [
      "Use emergency or urgent-care channels now if there may be immediate danger.",
      "Review the created handoff item in the Safety panel.",
      "Do not wait for portal evidence before seeking urgent help."
    ];
  }
  if (approval.status === "pending_approval" || approval.status === "needed") {
    return [
      "Review the read-only approval scope.",
      "Approve only if the authenticated portal or document candidate is ready.",
      "The worker remains idle until approval is consumed."
    ];
  }
  if (worker.blocker) {
    return [
      "Resolve the blocker shown by the worker.",
      "Keep login, passkey, 2FA, captcha, and password-manager steps user-controlled.",
      "Retry the same session after the approved source is available."
    ];
  }
  if (pointers.length) {
    return [
      "Review the cited source pointer cards.",
      "Use feedback if the answer needs follow-up.",
      "Open the operator proof dashboard for the full audit trail."
    ];
  }
  return [
    "Ask an insurance benefits, claim, authorization, or document question.",
    "Attach evidence or approve a read-only worker observation when requested.",
    "Wait for a sourced answer or a precise blocker."
  ];
}

export function buildAi2UiBlocksFromState(state = {}, options = {}) {
  const productMemory = options.productMemory ?? {};
  const handoff = state.human_handoff?.handoff ?? null;
  const costComparison = buildCostComparisonPayload(state);
  const pharmacyFormulary = buildPharmacyFormularyPayload(state);
  const procedureChecklist = buildProcedureChecklistPayload(state);
  const providerNetwork = buildProviderNetworkPayload(state);
  const blocks = [
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.ANSWER_MARKDOWN, 0),
      type: AI2UI_BLOCK_TYPES.ANSWER_MARKDOWN,
      title: "Answer",
      payload: {
        markdown: state.final_response ?? "",
        workflow: state.workflow ?? null,
        outcome: state.workflow_outcome ?? null
      },
      renderHints: { priority: "primary" }
    },
    ...(costComparison
      ? [
          {
            id: blockId(state, AI2UI_BLOCK_TYPES.COST_COMPARISON, 1),
            type: AI2UI_BLOCK_TYPES.COST_COMPARISON,
            title: "Cost Comparison",
            payload: costComparison,
            renderHints: { severity: costComparison.rows.length ? "info" : "warning" }
          }
        ]
      : []),
    ...(pharmacyFormulary
      ? [
          {
            id: blockId(state, AI2UI_BLOCK_TYPES.PHARMACY_FORMULARY, 1),
            type: AI2UI_BLOCK_TYPES.PHARMACY_FORMULARY,
            title: "Pharmacy Formulary",
            payload: pharmacyFormulary,
            renderHints: { severity: pharmacyFormulary.rows.length ? "info" : "warning" }
          }
        ]
      : []),
    ...(procedureChecklist
      ? [
          {
            id: blockId(state, AI2UI_BLOCK_TYPES.PROCEDURE_CHECKLIST, 1),
            type: AI2UI_BLOCK_TYPES.PROCEDURE_CHECKLIST,
            title: "Procedure Checklist",
            payload: procedureChecklist,
            renderHints: { severity: procedureChecklist.rows.length ? "info" : "warning" }
          }
        ]
      : []),
    ...(providerNetwork
      ? [
          {
            id: blockId(state, AI2UI_BLOCK_TYPES.PROVIDER_NETWORK, 1),
            type: AI2UI_BLOCK_TYPES.PROVIDER_NETWORK,
            title: "Provider Network",
            payload: providerNetwork,
            renderHints: { severity: providerNetwork.rows.length ? "info" : "warning" }
          }
        ]
      : []),
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.WORKFLOW_STATUS, 2),
      type: AI2UI_BLOCK_TYPES.WORKFLOW_STATUS,
      title: "Workflow",
      payload: {
        workflow: state.workflow ?? null,
        intent: state.structured_intent?.intent ?? state.intent ?? null,
        confidence: state.structured_intent?.confidence ?? null,
        routeReason: state.route_reason ?? null,
        traceId: state.graph_trace_id ?? null,
        llmDecisionMode: state.llm_orchestration_decision?.mode ?? state.model_invocation?.mode ?? "not_reported"
      }
    },
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.APPROVAL_GATE, 3),
      type: AI2UI_BLOCK_TYPES.APPROVAL_GATE,
      title: "Approval Gate",
      payload: approvalPayload(state),
      renderHints: { severity: approvalPayload(state).status === "pending_approval" ? "warning" : "neutral" }
    },
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.WORKER_STATUS, 4),
      type: AI2UI_BLOCK_TYPES.WORKER_STATUS,
      title: "Worker",
      payload: workerPayload(state)
    },
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.SOURCE_CITATIONS, 5),
      type: AI2UI_BLOCK_TYPES.SOURCE_CITATIONS,
      title: "Citations",
      payload: {
        sourcePointers: sourcePointersFromState(state),
        sourcePointerCount: state.source_pointers?.length ?? 0,
        evidenceStatus: state.evidence_observation?.status ?? "not_requested"
      }
    },
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.MEMORY_STATUS, 6),
      type: AI2UI_BLOCK_TYPES.MEMORY_STATUS,
      title: "Product Memory",
      payload: memoryPayload(state, productMemory)
    },
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.SAFETY_NOTICE, 7),
      type: AI2UI_BLOCK_TYPES.SAFETY_NOTICE,
      title: "Safety Boundary",
      payload: {
        healthcareDomain: state.policy_result?.healthcareDomain ?? true,
        urgentEscalationRequired: Boolean(state.policy_result?.urgentEscalationRequired),
        blockedActions: [
          "credential_entry",
          "passkey_or_2fa_handling",
          "captcha_bypass",
          "payer_contact_without_gate",
          "form_submission_without_gate",
          "account_record_change",
          "medical_advice"
        ],
        message: "Read-only evidence work is allowed only after the matching approval gate is consumed."
      },
      renderHints: { severity: state.policy_result?.urgentEscalationRequired ? "critical" : "info" }
    },
    {
      id: blockId(state, AI2UI_BLOCK_TYPES.NEXT_STEPS, 8),
      type: AI2UI_BLOCK_TYPES.NEXT_STEPS,
      title: "Next Steps",
      payload: {
        items: nextStepsForState(state)
      }
    }
  ];
  if (handoff) {
    blocks.splice(5, 0, {
      id: blockId(state, AI2UI_BLOCK_TYPES.HUMAN_HANDOFF, 9),
      type: AI2UI_BLOCK_TYPES.HUMAN_HANDOFF,
      title: "Human Handoff",
      payload: {
        id: handoff.id ?? null,
        taskId: handoff.taskId ?? handoff.task_id ?? null,
        status: handoff.status ?? "open",
        priority: handoff.priority ?? "urgent",
        handoffType: handoff.handoffType ?? handoff.handoff_type ?? "human_handoff",
        summary: handoff.summary ?? "Handoff created."
      },
      renderHints: { severity: "critical" }
    });
  }
  return normalizeAi2UiBlocks(blocks);
}
