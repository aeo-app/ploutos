locals {
  tables = {
    "ploutos-analyze" = {
      description = "Cached company analysis profiles"
    }
    "ploutos-schedule" = {
      description = "Cached content schedules"
    }
    "ploutos-config" = {
      description = "Per-user feature configuration"
    }
  }
}

resource "aws_dynamodb_table" "this" {
  for_each = local.tables

  name         = each.key
  billing_mode = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5

  hash_key  = "userId"
  range_key = "url"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "url"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = each.key
    Environment = var.environment
    Project     = var.project_name
  }
}
