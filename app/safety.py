import re
from typing import Dict, Any, Tuple

class SafetyAgent:
    def __init__(self):
        self.injection_patterns = [
            re.compile(r"ignore\s+(?:all\s+)?(?:previous|above)\s+instructions", re.IGNORECASE),
            re.compile(r"disregard\s+(?:all\s+)?(?:previous|system)\s+(?:instructions|rules)", re.IGNORECASE),
            re.compile(r"reveal\s+(?:hidden|system|all)\s+(?:prompt|instructions|test)", re.IGNORECASE),
            re.compile(r"show\s+(?:customer\s+)?card\s+numbers", re.IGNORECASE),
            re.compile(r"show\s+(?:all\s+)?supplier\s+contract\s+prices", re.IGNORECASE),
            re.compile(r"print\s+(?:the\s+)?(?:entire\s+)?database", re.IGNORECASE),
            re.compile(r"bypass\s+(?:all\s+)?(?:rules|guardrails|safety)", re.IGNORECASE),
            re.compile(r"do\s+not\s+cite\s+(?:sources|policy)", re.IGNORECASE)
        ]
        
        self.restricted_keywords = [
            re.compile(r"card\s+number", re.IGNORECASE),
            re.compile(r"supplier\s+contract\s+price", re.IGNORECASE),
            re.compile(r"customer\s+bank\s+details", re.IGNORECASE),
            re.compile(r"cvv|otp|pin|password", re.IGNORECASE)
        ]

    def pre_screen(self, raw_text: str) -> Dict[str, Any]:
        pii_masked = False
        is_injected = False
        is_restricted = False

        for pattern in self.injection_patterns:
            if pattern.search(raw_text):
                is_injected = True
                break

        lower = raw_text.lower()
        if any(kw.search(raw_text) for kw in self.restricted_keywords):
            if any(term in lower for term in ["show", "give me", "reveal", "print", "list"]):
                is_restricted = True

        cleaned_text = raw_text

        # 1. Card numbers: 13-19 digits
        card_pattern = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,19}\b")
        if card_pattern.search(cleaned_text):
            cleaned_text = card_pattern.sub("[REDACTED_CARD]", cleaned_text)
            pii_masked = True

        # 2. Phone numbers (10 digits)
        phone_pattern = re.compile(r"\b(?:\+91[ -]?)?([6-9]\d{2})\d{4}(\d{3})\b|\b([6-9]\d{5})(\d{4})\b")
        if phone_pattern.search(cleaned_text):
            def mask_phone(m):
                val = re.sub(r"\D", "", m.group(0))
                if len(val) >= 10:
                    return f"******{val[-4:]}"
                return "******[PHONE]"
            cleaned_text = phone_pattern.sub(mask_phone, cleaned_text)
            pii_masked = True

        # 3. Emails
        email_pattern = re.compile(r"\b([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})\b")
        if email_pattern.search(cleaned_text):
            def mask_email(m):
                user, dom, tld = m.group(1), m.group(2), m.group(3)
                if len(user) > 2:
                    masked = user[0] + "*" * (len(user) - 2) + user[-1]
                else:
                    masked = "***"
                return f"{masked}@{dom}.{tld}"
            cleaned_text = email_pattern.sub(mask_email, cleaned_text)
            pii_masked = True

        # 4. CVV / PIN / OTP
        cvv_pattern = re.compile(r"\b(?:cvv|otp|pin|password)[: =]+(\d{3,6})\b", re.IGNORECASE)
        if cvv_pattern.search(cleaned_text):
            cleaned_text = cvv_pattern.sub("[REDACTED]", cleaned_text)
            pii_masked = True

        is_unsafe = is_injected or is_restricted
        refusal_answer = None
        refusal_reason = None

        if is_unsafe:
            refusal_reason = "Prompt injection or restricted confidential data request detected."
            refusal_answer = (
                "I cannot fulfill this request. Company security policy strictly forbids revealing customer card details, "
                "payment credentials, or supplier contract pricing. Flagged for Security review "
                "[02_pos_pricing_returns_policy.md#payment-security;05_responsible_ai_policy.md#prompt-injection]."
            )

        return {
            "is_unsafe": is_unsafe,
            "is_injected": is_injected,
            "is_restricted": is_restricted,
            "pii_masked": pii_masked,
            "cleaned_text": cleaned_text,
            "refusal_reason": refusal_reason,
            "refusal_answer": refusal_answer
        }

    def post_screen(self, answer_text: str) -> Tuple[str, bool]:
        sanitized = answer_text
        pii_detected = False

        card_pattern = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,19}\b")
        if card_pattern.search(sanitized):
            sanitized = card_pattern.sub("[REDACTED_CARD]", sanitized)
            pii_detected = True

        phone_pattern = re.compile(r"\b(?:\+91[ -]?)?[6-9]\d{9}\b")
        if phone_pattern.search(sanitized):
            def mask_phone_post(m):
                digits = re.sub(r"\D", "", m.group(0))
                return f"******{digits[-4:]}" if len(digits) >= 4 else "******[PHONE]"
            sanitized = phone_pattern.sub(mask_phone_post, sanitized)
            pii_detected = True

        return sanitized, pii_detected

safety_agent = SafetyAgent()
