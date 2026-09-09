// The golden eval set for AI-assisted draft generation.
//
// 13 hand-written cases, not hundreds — the goal isn't statistical
// significance, it's a repeatable, inspectable check that catches
// regressions and characterizes failure modes when the prompt, schema, or
// model changes. Each case pins down what "correct" means for that input.
//
// Industries are deliberately varied (SaaS, telecom, manufacturing,
// logistics, healthcare) to test schema/prompt generalization, not as a
// claim about real-world validation coverage.

export interface EvalCase {
  id: string;
  industry: string;
  description: string;
  rubric: {
    minStages: number;
    maxStages: number;
    minApprovalStages: number;
    expectedRoleKeywords: string[];
    expectedFieldTypes: string[];
    expectsThreshold: boolean;
    expectsNoThresholdOnApprovals: boolean;
    // If set, average stage confidence must be >= this value. Omit for
    // cases where confidence isn't the point of the test.
    minAvgConfidence?: number;
    // If set, average stage confidence must be <= this value WHEN the model
    // drafts directly (not when it asks for clarification instead) — used
    // for the deliberately underspecified case, where the system prompt
    // explicitly says to reflect inferred structure via lower confidence.
    maxAvgConfidenceIfDrafted?: number;
    // If true, this case is expected to plausibly trigger
    // request_clarification per the system prompt's own stated bar
    // (multiple distinct products with no stated branching, or text too
    // vague for any stage sequence). Not a hard requirement — the model's
    // judgment call is itself part of what's being observed — but reported
    // distinctly in the summary rather than folded into pass/fail.
    clarificationPlausible?: boolean;
  };
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "saas-enterprise-onboarding",
    industry: "SaaS",
    description: `We're setting up the onboarding journey for new enterprise accounts on our data analytics platform. It starts with our sales rep collecting basic account information — company name, primary contact email, and the subscription tier the customer signed up for, which is either Starter, Growth, or Enterprise. The rep also records the annual contract value, since that number determines what happens later. Once that's captured, the deal moves to our solutions engineering team, who scope the technical implementation. They need to know the customer's expected data volume in gigabytes per month, whether the customer requires a dedicated VPC deployment, and they upload a signed technical requirements document. If the annual contract value is $75,000 or more, our VP of Solutions Engineering has to review and approve the implementation plan before it proceeds — anything under that threshold can move forward without that extra sign-off. After implementation is scoped, the account moves to our legal team for contract finalization. Legal needs the final redlined contract uploaded, and they record the contract effective date and whether any custom data processing addendum was required. Every enterprise-tier contract requires legal review and sign-off from our General Counsel before it can be marked complete, regardless of deal size. Once legal signs off, the account is handed to the customer success team for kickoff scheduling. CS records the planned kickoff date, assigns a dedicated customer success manager by name, and notes any special onboarding requirements the customer flagged. If at any point the assigned solutions engineer becomes unavailable, the deal should be reassignable to another solutions engineer or to the solutions engineering manager directly.`,
    rubric: {
      minStages: 3,
      maxStages: 5,
      minApprovalStages: 2,
      expectedRoleKeywords: ["sales", "solutions", "legal", "success"],
      expectedFieldTypes: ["text", "dropdown", "currency", "date"],
      expectsThreshold: true,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "telecom-enterprise-line-provisioning",
    industry: "Telecom",
    description: `This journey covers provisioning a new leased line circuit for an enterprise customer. The account manager starts by capturing the customer's company name, GSTIN, the site address where the circuit needs to be installed, and the required bandwidth in Mbps. They also record whether this is a new site or an upgrade to an existing connection. Once submitted, the request goes to our network planning team, who determine last-mile feasibility. They record the nearest point of presence, the estimated fiber run distance in kilometers, and whether a right-of-way permission is needed from local authorities. If the estimated installation cost exceeds two lakh rupees, the regional network head must approve the plan before work begins; below that threshold, the planning team can proceed on their own authority. After planning is approved, the request moves to the field operations team, who schedule the actual installation. They capture the installation date, the technician assigned, and upload a site survey report as a required document. Finally, the account moves to billing activation, where the finance team confirms the monthly recurring charge, the contract tenure in months, and activates billing. If the assigned field technician is unavailable on the scheduled date, the job should be reassignable to another technician or to the field operations supervisor.`,
    rubric: {
      minStages: 3,
      maxStages: 5,
      minApprovalStages: 1,
      expectedRoleKeywords: ["network", "field", "billing", "finance"],
      expectedFieldTypes: ["text", "number", "date", "file"],
      expectsThreshold: true,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "manufacturing-supplier-onboarding",
    industry: "Manufacturing",
    description: `This is our new supplier onboarding process for raw material vendors. Procurement starts by collecting the supplier's company name, business registration number, primary category of materials supplied, and their proposed unit pricing. They also upload the supplier's ISO certification document if one exists. The request then goes to quality assurance, who conduct a supplier audit. QA records the audit score out of 100, notes any corrective actions required, and uploads the completed audit report. Any supplier scoring below 70 on the audit must be reviewed and explicitly approved by the head of quality before onboarding can continue — suppliers scoring 70 or above can proceed automatically. After quality clears the supplier, the request moves to finance for payment terms setup, where they record the agreed payment terms in days, the credit limit extended to the supplier, and the currency for transactions. Finally, the supplier record moves to the procurement lead for final activation, where they confirm the supplier's active status and assign a supplier code. If the assigned QA auditor is unavailable, the audit should be reassignable to another QA auditor or the QA team lead.`,
    rubric: {
      minStages: 3,
      maxStages: 5,
      minApprovalStages: 1,
      expectedRoleKeywords: ["procurement", "quality", "finance"],
      expectedFieldTypes: ["text", "number", "file"],
      expectsThreshold: true,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "logistics-carrier-contract",
    industry: "Logistics",
    description: `This journey handles onboarding a new freight carrier partner. Our carrier relations team begins by capturing the carrier's company name, fleet size, primary regions served, and their proposed rate per kilometer. They also record whether the carrier has cold-chain capability, since that affects which routes they're eligible for. The request then goes to our compliance team, who verify the carrier's insurance coverage and safety certification, uploading both as required documents, and recording the insurance coverage amount. If the carrier does not have valid cargo insurance of at least five million rupees, compliance must escalate to the head of compliance for a manual risk exception before approval — carriers meeting the minimum can be cleared directly by the compliance team. Once compliance clears the carrier, the request moves to operations for route assignment, where they record which distribution hubs the carrier will service and the expected weekly capacity in tonnes. Finally, finance sets up the carrier for payment, recording the payment cycle and banking details reference. If the assigned compliance reviewer becomes unavailable mid-review, the case should be reassignable to another compliance reviewer or the head of compliance directly.`,
    rubric: {
      minStages: 3,
      maxStages: 5,
      minApprovalStages: 1,
      expectedRoleKeywords: ["compliance", "operations", "finance"],
      expectedFieldTypes: ["text", "number", "boolean", "file"],
      expectsThreshold: true,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "healthcare-provider-credentialing",
    industry: "Healthcare",
    description: `This journey covers credentialing a new healthcare provider to join our network. Provider relations starts by collecting the provider's full name, medical license number, specialty, and years of practice. They also upload the provider's malpractice insurance certificate. The request then moves to our credentialing committee, who verify board certification and check for any disciplinary history, recording their findings as notes and uploading a background check report. Any provider with a disciplinary history on record must be reviewed and approved by the medical director personally before being credentialed — providers with a clean record can be approved by the credentialing committee directly. Once credentialing clears, the request moves to contracting, where they record the provider's proposed reimbursement rate and contract effective date, and upload the signed provider agreement. Finally, the network operations team activates the provider in the directory, recording which office locations they'll practice at and their accepted insurance plans. If the assigned credentialing reviewer is unavailable, the case should be reassignable to another committee member or the credentialing committee chair.`,
    rubric: {
      minStages: 3,
      maxStages: 5,
      minApprovalStages: 1,
      expectedRoleKeywords: ["credentialing", "contracting", "operations"],
      expectedFieldTypes: ["text", "file", "date"],
      expectsThreshold: false,
      expectsNoThresholdOnApprovals: true,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "saas-smb-selfserve-no-approval",
    industry: "SaaS",
    description: `We want a lightweight journey for our self-serve small-business plan signups, where nothing requires manual approval at all. A prospective customer fills in their company name, work email, company size bucket (1-10, 11-50, 51-200), and picks a plan from Basic, Pro, or Team. They also indicate whether they want to opt into our monthly product newsletter. Once submitted, the request goes straight to our onboarding automation team, who just need to confirm the account was provisioned correctly, note the auto-generated account ID, and record the provisioning timestamp. There is no manual review or sign-off step anywhere in this flow — every account provisions automatically once the signup form is complete. Finally, the customer success team gets a lightweight record showing the plan selected and the signup date, purely for their own tracking dashboard, with no action required from them. If the automated provisioning fails for some reason, the case should be reassignable to a support engineer for manual handling.`,
    rubric: {
      minStages: 2,
      maxStages: 4,
      minApprovalStages: 0,
      expectedRoleKeywords: ["onboarding", "success"],
      expectedFieldTypes: ["text", "dropdown", "boolean"],
      expectsThreshold: false,
      expectsNoThresholdOnApprovals: true,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "telecom-vague-underspecified",
    industry: "Telecom",
    description: `We need a journey for handling customer complaints about network outages. Someone reports an issue, we look into it, and then we fix it or explain why we can't. There's a support team that takes the initial complaint, a technical team that investigates what happened, and eventually someone tells the customer the outcome. Big outages affecting a lot of customers probably need a manager to sign off on the response before it goes out, but small individual issues can just get handled directly by whoever's working on it. We track things like how long it took to resolve, what the root cause was, and whether the customer was satisfied with the outcome. If a large regional outage is involved, this might also need to loop in the network operations center for a broader incident review, though the details of that process aren't fully worked out yet — for now we just need to know it happened and who's responsible if the current person is out.`,
    rubric: {
      minStages: 2,
      maxStages: 5,
      minApprovalStages: 0,
      expectedRoleKeywords: ["support", "network"],
      expectedFieldTypes: ["text"],
      expectsThreshold: false,
      expectsNoThresholdOnApprovals: false,
      // The point of this case: it HAS a rough stage sequence (support ->
      // investigate -> outcome), so per the system prompt's own bar this
      // should NOT trigger clarification — but it's genuinely underspecified
      // on details, so confidence should be visibly lower than the clean cases.
      maxAvgConfidenceIfDrafted: 0.7,
      clarificationPlausible: false,
    },
  },
  {
    id: "manufacturing-complex-multi-gate",
    industry: "Manufacturing",
    description: `This is our new product introduction journey for launching a new SKU on the factory floor. Product engineering starts it by recording the SKU name, target category, bill of materials reference number, and estimated unit production cost. They upload a design specification document. If the estimated unit production cost exceeds five hundred rupees, the head of product engineering must approve the design before it proceeds to costing — designs below that cost can move forward without that gate. Next, the costing team reviews and confirms the final unit cost, the target retail price, and the projected gross margin percentage; if the projected gross margin falls below twenty percent, the finance director must approve the pricing before manufacturing can begin, otherwise costing can clear it themselves. After costing, the request moves to production planning, who record the target production line, the planned launch quantity, and the planned production start date, and upload a production readiness checklist. Every new SKU requires sign-off from the plant manager before production planning is finalized, regardless of cost or margin, since it affects the whole line schedule. Finally, quality assurance does a pre-launch inspection, recording the inspection result and uploading the inspection certificate, before the SKU is marked ready for full production. If the plant manager is unavailable for sign-off, this should be reassignable to the deputy plant manager.`,
    rubric: {
      minStages: 4,
      maxStages: 6,
      minApprovalStages: 3,
      expectedRoleKeywords: ["engineering", "costing", "finance", "production", "quality", "plant"],
      expectedFieldTypes: ["text", "number", "file"],
      expectsThreshold: true,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "logistics-single-stage-minimal",
    industry: "Logistics",
    description: `We just need a very simple intake form for reporting damaged shipments. A warehouse worker fills in the shipment tracking number, the customer name, a description of the damage, and uploads a photo of the damaged item as a required document. They also select a damage severity level from Minor, Moderate, or Severe. That's really the whole process for now — the form just gets submitted and someone from claims processing looks at it afterward outside of this system. There's no approval step and no handoff to another team within this particular journey; it's purely a single intake point. If the warehouse worker filling this out is out sick, anyone else on the shift should be able to fill it in instead, so there's no specific person it needs to be reassigned to beyond general warehouse staff.`,
    rubric: {
      minStages: 1,
      maxStages: 2,
      minApprovalStages: 0,
      expectedRoleKeywords: ["warehouse"],
      expectedFieldTypes: ["text", "dropdown", "file"],
      expectsThreshold: false,
      expectsNoThresholdOnApprovals: true,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "healthcare-boundary-word-count-short",
    industry: "Healthcare",
    description: `This journey handles patient referrals to our specialty clinic network. A referring physician's office submits the patient's name, date of birth, referring diagnosis code, and the specialty being requested, choosing from Cardiology, Orthopedics, Neurology, or Dermatology. They upload the referral letter as a required document. The request then goes to our scheduling coordinators, who record the appointment date offered and whether the patient accepted or needs rescheduling. Referrals marked as urgent by the referring physician must be reviewed and approved by the on-call specialist before scheduling proceeds, to confirm clinical appropriateness; routine referrals can be scheduled directly by the coordinators without that review. Finally, our billing team verifies the patient's insurance coverage and records the authorization status before the appointment is confirmed as active. If the assigned scheduling coordinator is out, this should be reassignable to any other coordinator on the team.`,
    rubric: {
      minStages: 3,
      maxStages: 4,
      minApprovalStages: 1,
      expectedRoleKeywords: ["scheduling", "billing", "specialist"],
      expectedFieldTypes: ["text", "date", "dropdown", "file"],
      expectsThreshold: false,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "saas-partner-channel-onboarding",
    industry: "SaaS",
    description: `This journey covers onboarding a new reseller partner into our channel program. Partnerships starts by capturing the partner company's name, region of operation, and the tier they're applying for — Silver, Gold, or Platinum — along with their proposed annual sales commitment in dollars. They upload a signed partner application form. If the proposed annual sales commitment is below one hundred thousand dollars, the partnerships manager can approve the application directly; commitments of one hundred thousand dollars or more require approval from the VP of Partnerships before the partner is accepted, given the larger revenue exposure. Once approved, the request moves to legal, who finalize the reseller agreement, recording the agreement effective date and uploading the countersigned contract. Legal review and sign-off is required for every partner regardless of tier or commitment size, since these are binding reseller contracts. Finally, partner enablement sets the partner up operationally, recording their assigned partner portal login and the enablement training completion date. If the assigned partnerships manager is unavailable, the application should be reassignable to another partnerships manager or the VP of Partnerships directly.`,
    rubric: {
      minStages: 3,
      maxStages: 5,
      minApprovalStages: 2,
      expectedRoleKeywords: ["partnerships", "legal", "enablement"],
      expectedFieldTypes: ["text", "currency", "date", "file"],
      expectsThreshold: true,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "manufacturing-warranty-claims",
    industry: "Manufacturing",
    description: `This journey processes warranty claims from customers for defective products. Customer support starts by recording the product serial number, purchase date, the customer's description of the defect, and uploading a photo of the defective item. They also record whether the product is still within the standard one-year warranty period. The claim then moves to our technical assessment team, who inspect the reported issue and record their assessment outcome as either confirmed defect, not covered, or needs further inspection, along with an assessment cost estimate. If the assessment cost estimate exceeds ten thousand rupees, the warranty manager must approve the claim before a replacement or refund is issued; claims below that threshold can be resolved directly by the technical assessment team. Once approved, the claim moves to fulfillment, who record whether the resolution is a replacement or refund, the fulfillment date, and upload proof of shipment or refund confirmation. If the assigned technical assessor is unavailable, the claim should be reassignable to another assessor or the warranty manager.`,
    rubric: {
      minStages: 3,
      maxStages: 4,
      minApprovalStages: 1,
      expectedRoleKeywords: ["support", "technical", "warranty", "fulfillment"],
      expectedFieldTypes: ["text", "date", "file", "boolean"],
      expectsThreshold: true,
      expectsNoThresholdOnApprovals: false,
      minAvgConfidence: 0.6,
    },
  },
  {
    id: "saas-multi-product-ambiguous-branching",
    industry: "SaaS",
    description: `We sell two very different products — a project management tool and a separate time-tracking add-on — and we're not sure yet how the onboarding journey should work across both. Customers can buy either one alone or both together. Sales collects the company name, contact email, and which product or products the customer purchased. After that, implementation happens somehow, and then the account goes live. We haven't figured out whether project-management-only customers, time-tracking-only customers, and bundle customers should go through the exact same stages with different fields, or whether they need genuinely different stage sequences because the implementation work is completely different for each product. There's also a vague idea that bigger deals need some kind of technical review, but we haven't nailed down what counts as "bigger" or who does that review.`,
    rubric: {
      minStages: 1,
      maxStages: 6,
      minApprovalStages: 0,
      expectedRoleKeywords: [],
      expectedFieldTypes: [],
      expectsThreshold: false,
      expectsNoThresholdOnApprovals: false,
      // This case is purpose-built to hit the system prompt's explicit
      // clarification trigger: two distinct products, no stated branching
      // logic. Whether the model actually asks (vs. picks one reasonable
      // structure and flags it with low confidence) is itself the
      // interesting observation — reported, not scored pass/fail.
      clarificationPlausible: true,
    },
  },
];
