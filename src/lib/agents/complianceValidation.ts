// ------------------------------------------------------------------
// Advertising-claim compliance validation — master audit Part C1.1
// ------------------------------------------------------------------
// Same architecture as brandVoiceValidation.ts: lightweight,
// deterministic, pattern-matched, non-blocking. Scans generated text
// for unverifiable/unsubstantiated advertising claims in the spirit
// of ASCI's guidelines — "best in India," "No. 1," "clinically
// proven," "guaranteed results," etc. Before this, there was no check
// of any kind for this claim class anywhere in the content pipeline —
// confirmed by the audit and unrelated to brand-voice validation,
// which only checks tone/style preferences, not legal-risk language.
//
// Deliberately NOT an LLM call — a second Claude call per generation
// would double latency/cost for every text-generation tool, and
// pattern-matching this class of phrase is reliable enough not to
// need one, same reasoning brandVoiceValidation.ts gives for its own
// pattern-matchable rules.
//
// Deliberately advisory, not blocking, for this first pass: flags the
// content so a human sees it before publish (the actual audit finding
// was "zero automated first pass," not "generation should be
// prevented") — blocking generation outright is a bigger behavior
// change than closing the visibility gap the audit flagged.
// ------------------------------------------------------------------

import { flattenResultText } from "./brandVoiceValidation";

export interface ComplianceViolation {
  rule: string;
  detail: string;
}

export interface ComplianceCheckResult {
  compliant: boolean;
  violations: ComplianceViolation[];
}

// Each entry: a pattern + why it's risky. Deliberately conservative —
// flags actual superlative/absolute/unsubstantiated-claim PATTERNS,
// not every mention of quality, so the flag stays trustworthy rather
// than noisy (an advisory nobody trusts is worse than none).
const CLAIM_PATTERNS: { rule: string; re: RegExp; detail: string }[] = [
  { rule: "unverifiable_ranking_claim", re: /\b(no\.?\s?1|number\s?one|#1)\b/i, detail: "Claims to be \"No. 1\" / \"number one\" — needs real, citable data behind it (e.g. a named sales/ranking source), or it's an unsubstantiated ranking claim." },
  { rule: "unverifiable_superlative_claim", re: /\bbest\s+in\s+(india|the\s+world|the\s+country|the\s+city)\b/i, detail: "Claims to be \"best in India\" / \"best in the world\" — an absolute superlative with no comparative data is a commonly-challenged claim type." },
  { rule: "unverifiable_medical_claim", re: /\bclinically\s+(proven|tested)\b/i, detail: "\"Clinically proven/tested\" requires real, citable clinical evidence to back it up." },
  { rule: "unverifiable_absolute_claim", re: /\b100%\s+(guaranteed|effective|safe|natural|satisfaction)\b/i, detail: "A \"100%\" absolute claim (guaranteed/effective/safe/natural) is very hard to substantiate for every customer." },
  { rule: "unverifiable_scientific_claim", re: /\bscientifically\s+proven\b/i, detail: "\"Scientifically proven\" needs real, citable evidence behind it." },
  { rule: "unverifiable_outcome_guarantee", re: /\bguaranteed\s+results?\b/i, detail: "\"Guaranteed results\" promises a specific outcome that can't honestly be guaranteed for every customer." },
  { rule: "unverifiable_award_claim", re: /\baward[- ]winning\b/i, detail: "\"Award-winning\" needs a real, named award behind it — flagged so it can be checked, not assumed fabricated." },
  { rule: "unverifiable_endorsement_claim", re: /\bdoctor\s+recommended\b/i, detail: "\"Doctor recommended\" is a professional-endorsement claim that needs real substantiation." },
];

export function validateAdvertisingClaimCompliance(text: string): ComplianceCheckResult {
  const violations: ComplianceViolation[] = [];
  if (!text) return { compliant: true, violations };
  for (const pattern of CLAIM_PATTERNS) {
    const match = text.match(pattern.re);
    if (match) {
      violations.push({ rule: pattern.rule, detail: `${pattern.detail} (found: "${match[0]}")` });
    }
  }
  return { compliant: violations.length === 0, violations };
}

// Same merge-only-when-there's-something-to-flag pattern as
// withBrandVoiceCheck — no `_complianceCheck: {compliant: true, ...}`
// noise on every generation, and this must never throw or alter
// `output` beyond adding this one advisory field.
export function withComplianceCheck<T extends object>(output: T): T {
  try {
    const check = validateAdvertisingClaimCompliance(flattenResultText(output));
    if (check.compliant) return output;
    return { ...output, _complianceCheck: check };
  } catch {
    return output;
  }
}
