import re
import dns.resolver

# Common free personal email domains
FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "live.com",
    "zoho.com",
    "protonmail.com",
    "proton.me",
    "mail.com",
    "yandex.com",
}

# Known temporary / disposable email providers
# In production, load a larger list (e.g. from a file or GitHub repository)
DISPOSABLE_DOMAINS = {
    "tempmail.com",
    "10minutemail.com",
    "guerrillamail.com",
    "mailinator.com",
    "yopmail.com",
    "trashmail.com",
}


def validate_business_email(email: str) -> dict:
    """Validates whether an email is a legitimate business email address."""
    email = email.strip().lower()

    # 1. Basic Syntax Validation
    email_regex = r"^[^\s@]+@([^\s@]+\.[^\s@]+)$"
    match = re.match(email_regex, email)

    if not match:
        return {"is_valid_business": False, "reason": "Invalid email syntax"}

    domain = match.group(1)

    # 2. Check for Personal / Free Email Providers
    if domain in FREE_EMAIL_DOMAINS:
        return {
            "is_valid_business": False,
            "reason": "Personal email addresses are not allowed",
        }

    # 3. Check for Disposable / Temporary Email Providers
    if domain in DISPOSABLE_DOMAINS:
        return {
            "is_valid_business": False,
            "reason": "Disposable email addresses are not allowed",
        }

    # 4. DNS MX Record Lookup
    try:
        answers = dns.resolver.resolve(domain, "MX")
        print(f"MX records for {domain}: {[r.exchange.to_text() for r in answers]}")

        if not answers:
            return {
                "is_valid_business": False,
                "reason": "Domain has no valid MX records",
            }
    except (
        dns.resolver.NoAnswer,
        dns.resolver.NXDOMAIN,
        dns.resolver.NoNameservers,
    ):
        return {
            "is_valid_business": False,
            "reason": "Domain does not exist or has no mail servers",
        }
    except Exception as e:
        return {
            "is_valid_business": False,
            "reason": f"DNS lookup failed: {str(e)}",
        }

    return {"is_valid_business": True}


# Example Usage
if __name__ == "__main__":
    test_emails = [
        "alex@gmail.com",  # Personal
        "user@10minutemail.com",  # Disposable
        "fake@nonexistent-domain-999.com",  # Invalid MX
        "sarah@stripe.com",  # Valid Business Email
    ]

    for email in test_emails:
        result = validate_business_email(email)
        print(f"{email:<35} -> {result}")