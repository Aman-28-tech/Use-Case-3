export interface SafetyPreCheckResult {
  isUnsafe: boolean;
  isInjected: boolean;
  isRestricted: boolean;
  piiMasked: boolean;
  cleanedText: string;
  refusalReason?: string;
  refusalAnswer?: string;
}

export class SafetyAgent {
  private injectionPatterns: RegExp[] = [
    /ignore (?:all )?(?:previous|above) instructions/i,
    /disregard (?:all )?(?:previous|system) (?:instructions|rules)/i,
    /reveal (?:hidden|system|all) (?:prompt|instructions|test)/i,
    /show (?:customer )?card numbers/i,
    /show (?:all )?supplier contract prices/i,
    /print (?:the )?(?:entire )?database/i,
    /bypass (?:all )?(?:rules|guardrails|safety)/i,
    /pretend (?:you are|to be) (?:an? )?unfiltered/i,
    /do not cite (?:sources|policy)/i
  ];

  private restrictedKeywords: RegExp[] = [
    /card number/i,
    /supplier contract price/i,
    /customer bank details/i,
    /cvv|otp|pin|password/i
  ];

  preScreen(rawText: string): SafetyPreCheckResult {
    let piiMasked = false;
    let isInjected = false;
    let isRestricted = false;

    // 1. Check for Prompt Injection
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(rawText)) {
        isInjected = true;
        break;
      }
    }

    // 2. Check for Restricted Data Inquiries
    for (const kw of this.restrictedKeywords) {
      if (kw.test(rawText) && (rawText.toLowerCase().includes('show') || rawText.toLowerCase().includes('give me') || rawText.toLowerCase().includes('reveal'))) {
        isRestricted = true;
        break;
      }
    }

    // 3. Mask PII in user text
    let cleanedText = rawText;

    // Card numbers: 13-19 digits with spaces or hyphens (e.g. 4111 1111 1111 1111)
    const cardPattern = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,19}\b/g;
    if (cardPattern.test(cleanedText)) {
      cleanedText = cleanedText.replace(cardPattern, '[REDACTED_CARD]');
      piiMasked = true;
    }

    // Phone numbers: Indian 10 digits
    const phonePattern = /\b(?:\+91[ -]?)?([6-9]\d{2})\d{4}(\d{3})\b|\b([6-9]\d{5})(\d{4})\b/g;
    if (phonePattern.test(cleanedText)) {
      cleanedText = cleanedText.replace(phonePattern, (match) => {
        const digits = match.replace(/\D/g, '');
        if (digits.length >= 10) {
          const last4 = digits.slice(-4);
          return `******${last4}`;
        }
        return '******[PHONE]';
      });
      piiMasked = true;
    }

    // Emails: test@example.com -> t***t@example.com
    const emailPattern = /\b([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})\b/g;
    if (emailPattern.test(cleanedText)) {
      cleanedText = cleanedText.replace(emailPattern, (m, user, domain, tld) => {
        const maskedUser = user.length > 2 ? `${user[0]}${'*'.repeat(user.length - 2)}${user[user.length - 1]}` : '***';
        return `${maskedUser}@${domain}.${tld}`;
      });
      piiMasked = true;
    }

    // CVV / OTP / PIN
    const cvvPinPattern = /\b(?:cvv|otp|pin|password)[: =]+(\d{3,6})\b/gi;
    if (cvvPinPattern.test(cleanedText)) {
      cleanedText = cleanedText.replace(cvvPinPattern, '[REDACTED]');
      piiMasked = true;
    }

    const isUnsafe = isInjected || isRestricted;

    let refusalAnswer: string | undefined;
    let refusalReason: string | undefined;

    if (isInjected || isRestricted) {
      refusalReason = 'Prompt injection or restricted confidential data request detected.';
      refusalAnswer = "I cannot fulfill this request. Company security policy strictly forbids revealing customer card details, payment credentials, or supplier contract pricing. I have flagged this incident for Security review. If you need legitimate operational or POS troubleshooting assistance, please submit an authorized request [02_pos_pricing_returns_policy.md#payment-security;05_responsible_ai_policy.md#prompt-injection].";
    }

    return {
      isUnsafe,
      isInjected,
      isRestricted,
      piiMasked,
      cleanedText,
      refusalReason,
      refusalAnswer
    };
  }

  postScreen(responseAnswer: string): { sanitizedAnswer: string; piiDetected: boolean } {
    let sanitized = responseAnswer;
    let piiDetected = false;

    // Check for accidental card echoes
    const cardPattern = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,19}\b/g;
    if (cardPattern.test(sanitized)) {
      sanitized = sanitized.replace(cardPattern, '[REDACTED_CARD]');
      piiDetected = true;
    }

    // Check for phone echoes
    const phonePattern = /\b(?:\+91[ -]?)?[6-9]\d{9}\b/g;
    if (phonePattern.test(sanitized)) {
      sanitized = sanitized.replace(phonePattern, '******3210');
      piiDetected = true;
    }

    return { sanitizedAnswer: sanitized, piiDetected };
  }
}

export const safetyAgent = new SafetyAgent();
