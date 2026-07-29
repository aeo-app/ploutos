# ─── Cognito User Pool — APAC SEO Intelligence ──────────────────────────────
#
# Creates:
#   - User Pool with email-as-username, SES email, OTP verification
#   - App Client (confidential, with client secret)
#   - Required auth flows
#
# After apply, copy outputs to .env:
#   COGNITO_USER_POOL_ID = output.user_pool_id
#   COGNITO_CLIENT_ID    = output.client_id
#   COGNITO_CLIENT_SECRET = output.client_secret  (mark sensitive)

variable "cognito_ses_email" {
  description = "Verified SES email address for sending OTPs"
  type        = string
  # e.g. "noreply@yourdomain.com"
}

variable "app_name" {
  default = "apac-seo-intelligence"
}

# ── User Pool ─────────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool" "main" {
  name = "${var.app_name}-pool"

  # Use email as the login identifier
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Email configuration (uses SES in production)
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
    # For production, switch to SES:
    # email_sending_account = "DEVELOPER"
    # source_arn            = aws_ses_email_identity.noreply.arn
    # from_email_address    = var.cognito_ses_email
  }

  # Verification OTP message
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your APAC Intel verification code"
    email_message        = "Your verification code is {####}. It expires in 24 hours."
  }

  # Password policy — sync with auth_models.py _validate_password()
  password_policy {
    minimum_length                   = 8
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # Required attributes
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    string_attribute_constraints { 
          min_length = 3 
          max_length = 254 
      }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints { 
            min_length = 1 
            max_length = 100 
        }
  }

  # Token lifetimes
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  tags = {
    Project   = var.app_name
    ManagedBy = "terraform"
  }
}

# ── App Client ────────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool_client" "api" {
  name         = "${var.app_name}-api-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = true      # confidential client (server-side)

  # Auth flows needed by cognito_service.py
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",   # for login()
    "ALLOW_REFRESH_TOKEN_AUTH",   # for refresh_tokens()
    "ALLOW_USER_SRP_AUTH",        # optional but recommended for enhanced security
  ]

  # Token validity
  access_token_validity  = 60          # minutes
  id_token_validity      = 60          # minutes
  refresh_token_validity = 30          # days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Prevent user existence errors from leaking
  prevent_user_existence_errors = "ENABLED"
}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "user_pool_id" {
  value       = aws_cognito_user_pool.main.id
  description = "Set as COGNITO_USER_POOL_ID in .env"
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.main.arn
}

output "client_id" {
  value       = aws_cognito_user_pool_client.api.id
  description = "Set as COGNITO_CLIENT_ID in .env"
}

output "client_secret" {
  value       = aws_cognito_user_pool_client.api.client_secret
  sensitive   = true
  description = "Set as COGNITO_CLIENT_SECRET in .env (terraform output -raw client_secret)"
}

output "jwks_url" {
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
  description = "Used by core/security.py for JWT verification"
}
