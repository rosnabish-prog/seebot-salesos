/** Shared stage ordering + field metadata. Never infer win probability from this ordering. */
export const STAGES = [
  { id: 'ACCOUNT_RESEARCHED', label: 'Account Researched', short: 'Research', icon: 'search' },
  { id: 'DECISION_MAKER_IDENTIFIED', label: 'Decision-Maker Identified', short: 'Contacts', icon: 'contact-round' },
  { id: 'OUTREACH_INITIATED', label: 'Outreach Initiated', short: 'Outreach', icon: 'send' },
  { id: 'INTEREST_ESTABLISHED', label: 'Interest Established', short: 'Interest', icon: 'message-circle-heart' },
  { id: 'DISCOVERY_COMPLETED', label: 'Discovery Completed', short: 'Discovery', icon: 'clipboard-list' },
  { id: 'PILOT_QUALIFIED', label: 'Pilot Qualified', short: 'Pilot Qualified', icon: 'flask-conical' },
  { id: 'PILOT_PROPOSED', label: 'Pilot Proposed', short: 'Proposal', icon: 'file-check-2' },
  { id: 'PILOT_CONTRACTED', label: 'Pilot Contracted', short: 'Pilot Signed', icon: 'file-signature' },
  { id: 'PILOT_DELIVERED', label: 'Pilot Delivered', short: 'Pilot Delivered', icon: 'package-check' },
  { id: 'PRODUCTION_NEGOTIATED', label: 'Production Negotiated', short: 'Negotiation', icon: 'handshake' },
  { id: 'CLOSED_WON', label: 'Closed Won', short: 'Won', icon: 'trophy' }
] as const;
export type StageId = typeof STAGES[number]['id'];
export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'checkbox';
export type StageField = { key: string; label: string; type: FieldType; required?: boolean; options?: string[]; help?: string };

/** These are evidence fields. Contact, activity, proposal and contract gates are independently verified by the API. */
export const STAGE_FIELDS: Record<StageId, StageField[]> = {
  ACCOUNT_RESEARCHED: [
    { key: 'companySummary', label: 'Company research summary', type: 'textarea', required: true },
    { key: 'opportunityHypothesis', label: 'Why our company may help', type: 'textarea', required: true },
    { key: 'researchSource', label: 'Research source URL or citation', type: 'text', required: true },
    { key: 'nextAction', label: 'Next specific action', type: 'text', required: true }
  ],
  DECISION_MAKER_IDENTIFIED: [],
  OUTREACH_INITIATED: [ { key: 'followupDate', label: 'Planned follow-up date', type: 'date', required: true } ],
  INTEREST_ESTABLISHED: [ { key: 'interestDetails', label: 'Confirmed interest and next step', type: 'textarea', required: true } ],
  DISCOVERY_COMPLETED: [
    { key: 'painPoint', label: 'Confirmed customer need', type: 'textarea', required: true },
    { key: 'technicalScope', label: 'Potential technical scope', type: 'textarea', required: true },
    { key: 'buyingProcess', label: 'Buyer and approval process', type: 'text', required: true },
    { key: 'budgetStatus', label: 'Budget status', type: 'select', required: true, options: ['Confirmed', 'Under review', 'Not yet confirmed', 'No budget'] },
    { key: 'decisionTimeline', label: 'Target decision timeline', type: 'text', required: true }
  ],
  PILOT_QUALIFIED: [
    { key: 'pilotScope', label: 'Pilot scope', type: 'textarea', required: true },
    { key: 'feasibility', label: 'Technical/resource feasibility', type: 'textarea', required: true },
    { key: 'dataAuthorization', label: 'Approved data-handling approach', type: 'textarea', required: true },
    { key: 'qaPlan', label: 'Proposed QA and success criteria', type: 'textarea', required: true }
  ],
  PILOT_PROPOSED: [],
  PILOT_CONTRACTED: [ { key: 'securityApproval', label: 'Security/procurement approval reference', type: 'text', required: true } ],
  PILOT_DELIVERED: [
    { key: 'deliveryDate', label: 'Actual delivery date', type: 'date', required: true },
    { key: 'qaResults', label: 'Measured QA outcome', type: 'textarea', required: true },
    { key: 'clientAcceptance', label: 'Client acceptance status', type: 'select', options: ['Accepted', 'Changes requested', 'Rejected'], required: true }
  ],
  PRODUCTION_NEGOTIATED: [
    { key: 'commercialTerms', label: 'Agreed commercial terms', type: 'textarea', required: true },
    { key: 'pricingModel', label: 'Pricing model', type: 'select', options: ['Fixed fee', 'Unit based', 'Retainer', 'Hybrid'], required: true },
    { key: 'handoffOwner', label: 'Named delivery handoff owner', type: 'text', required: true }
  ],
  CLOSED_WON: []
};
export const STAGE_INDEX = Object.fromEntries(STAGES.map((s,i)=>[s.id,i])) as Record<StageId,number>;
export const INDUSTRIES = ['Sports Computer Vision','Autonomous Systems','Industrial AI','AI / NLP','Aerial Imagery','Insurance','Other'];
export const ROLE_NAMES = ['SUPER_ADMIN','CEO','DIRECTOR','SALES_MANAGER','SALES_REP','TECHNICAL_REVIEWER'] as const;
export type UserRole = typeof ROLE_NAMES[number];
export const OPEN_STATUSES = ['OPEN', 'NURTURE'] as const;
