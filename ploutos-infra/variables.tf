variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g. dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "ploutos"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "ssh_key_name" {
  description = "Name of an existing EC2 key pair for SSH access"
  type        = string
  default     = null
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the API (port 8000)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "bedrock_assume_role_arn" {
  description = "Optional IAM role ARN for Bedrock assume-role (leave empty to use instance profile credentials)"
  type        = string
  default     = null
}

variable "contact_email" {
  description = "Email address that receives contact form submissions"
  type        = string
  default     = "sales@aeo-app.ai"
}

variable "contact_sender" {
  description = "Verified SES sender email address"
  type        = string
  default     = "noreply@aeo-app.ai"
}

variable "tavily_api_key_secret_name" {
  description = "Name of the Secrets Manager secret containing TAVILY_API_KEY"
  type        = string
  default     = "ploutos/tavily-api-key"
}

variable "domain_name" {
  description = "Optional custom domain for the API (creates Route53 record)"
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID (required if domain_name is set)"
  type        = string
  default     = null
}
