# ─── DynamoDB Table — APAC SEO Intelligence ─────────────────────────────────
#
# terraform init && terraform apply
#
# This creates:
#   - The apac_seo_analyses table (PAY_PER_REQUEST billing)
#   - GSI on analysis_id (for direct lookup)
#   - TTL attribute (expires_at)
#   - Point-in-time recovery
#   - Server-side encryption (AWS-managed key)
#
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_region" {
  default = "ap-southeast-1"
}

variable "table_name" {
  default = "apac_seo_analyses"
}

variable "ttl_days" {
  description = "Days before auto-deleting records (0 = keep forever)"
  default     = 0
}

provider "aws" {
  region = var.aws_region
}

resource "aws_dynamodb_table" "apac_seo" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "analysis_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  # ── GSI: look up any analysis by its UUID ─────────────────────────────────
  global_secondary_index {
    name            = "gsi_analysis_id"
    hash_key        = "analysis_id"
    range_key       = "user_id"
    projection_type = "ALL"
  }

  # ── TTL (set expires_at in Unix epoch seconds) ────────────────────────────
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  # ── Point-in-time recovery ────────────────────────────────────────────────
  point_in_time_recovery {
    enabled = true
  }

  # ── Encryption at rest ────────────────────────────────────────────────────
  server_side_encryption {
    enabled = true
  }

  tags = {
    Project     = "apac-seo-intelligence"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

output "table_name" {
  value = aws_dynamodb_table.apac_seo.name
}

output "table_arn" {
  value = aws_dynamodb_table.apac_seo.arn
}

output "gsi_name" {
  value = "gsi_analysis_id"
}
