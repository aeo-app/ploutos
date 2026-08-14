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

  # Custom attributes captured at signup (or via profile completion for
  # existing users who signed up before this existed) — the source of truth
  # for "which domain/company does this account belong to", used to
  # prepopulate every analysis form and enforce the one-to-one user<->domain
  # mapping (see db.dynamo.check_and_lock_domain, which validates against
  # whatever ends up here).
  #
  # IMPORTANT: Cognito custom attribute schemas are immutable once a User
  # Pool is created — adding these `schema` blocks via `terraform apply`
  # against an ALREADY-DEPLOYED pool will fail (Cognito rejects schema
  # changes to existing pools). For an existing production pool, either
  # (a) provision a new pool with this schema and migrate users, or
  # (b) fall back to storing company_name/domain in DynamoDB only (already
  # implemented — see db.dynamo's domain-lock functions) without the Cognito
  # attributes. This schema is here for fresh deployments.
  schema {
    name                = "company_name"
    attribute_data_type = "String"
    developer_only_attribute = false
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 200
    }
  }

  schema {
    name                = "domain"
    attribute_data_type = "String"
    developer_only_attribute = false
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 253
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

  # Explicit about exactly what this client can read/write (otherwise Cognito
  # defaults to "all schema attributes", which works but is less clear about
  # intent) — must list the new custom:company_name/custom:domain attributes
  # here too, or AdminUpdateUserAttributes/GetUser calls for them will fail.
  read_attributes  = ["email", "name", "custom:company_name", "custom:domain"]
  write_attributes = ["email", "name", "custom:company_name", "custom:domain"]
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

# ─── Admin RBAC — Cognito Group ───────────────────────────────────────────────
# Chosen over a custom attribute (like custom:company_name/custom:domain
# above) specifically because Groups can be added to an EXISTING user pool
# at any time — no schema-immutability issue. Membership is embedded
# directly in the JWT as the `cognito:groups` claim (see
# core.security.require_admin, which checks this first, falling back to a
# DynamoDB mirror — db.dynamo.is_admin/set_admin — for immediate effect
# without waiting on a token refresh, and for local/dev mode).
#
# Manage membership via services/cognito_service.py's add_user_to_group/
# remove_user_from_group (called from POST /api/v1/admin/users/{id}/set-admin),
# or directly in the AWS Console under this user pool's Groups tab.
resource "aws_cognito_user_group" "admins" {
  name         = "Admins"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Full admin access to the app's admin panel — review/edit every user's social media calendars and blog posts, bypass payment. See core/security.py's require_admin."
  precedence   = 1
}

output "admin_group_name" {
  value       = aws_cognito_user_group.admins.name
  description = "Set as COGNITO_ADMIN_GROUP in .env if you rename this group"
}
