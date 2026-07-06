data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${var.project_name}-${var.environment}-ec2"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-${var.environment}-ec2"
  role = aws_iam_role.ec2.name
}

# DynamoDB - full access to project tables
data "aws_iam_policy_document" "dynamodb" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      for t in aws_dynamodb_table.this : t.arn
    ]
  }
}

resource "aws_iam_policy" "dynamodb" {
  name   = "${var.project_name}-${var.environment}-dynamodb"
  policy = data.aws_iam_policy_document.dynamodb.json
}

resource "aws_iam_role_policy_attachment" "dynamodb" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.dynamodb.arn
}

# Bedrock - invoke model
data "aws_iam_policy_document" "bedrock" {
  statement {
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/*",
    ]
  }
}

resource "aws_iam_policy" "bedrock" {
  name   = "${var.project_name}-${var.environment}-bedrock"
  policy = data.aws_iam_policy_document.bedrock.json
}

resource "aws_iam_role_policy_attachment" "bedrock" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.bedrock.arn
}

# SES - send email
data "aws_iam_policy_document" "ses" {
  statement {
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "ses" {
  name   = "${var.project_name}-${var.environment}-ses"
  policy = data.aws_iam_policy_document.ses.json
}

resource "aws_iam_role_policy_attachment" "ses" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.ses.arn
}

# Cognito - read pool + trigger admin operations
data "aws_iam_policy_document" "cognito" {
  statement {
    effect = "Allow"
    actions = [
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminUpdateUserAttributes",
      "cognito-idp:AdminConfirmSignUp",
      "cognito-idp:ForgotPassword",
      "cognito-idp:ConfirmForgotPassword",
      "cognito-idp:SignUp",
      "cognito-idp:ConfirmSignUp",
      "cognito-idp:InitiateAuth",
      "cognito-idp:RevokeToken",
    ]
    resources = [aws_cognito_user_pool.main.arn]
  }
}

resource "aws_iam_policy" "cognito" {
  name   = "${var.project_name}-${var.environment}-cognito"
  policy = data.aws_iam_policy_document.cognito.json
}

resource "aws_iam_role_policy_attachment" "cognito" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.cognito.arn
}

# STS - needed if BEDROCK_ASSUME_ROLE_ARN is set
data "aws_iam_policy_document" "sts" {
  count = var.bedrock_assume_role_arn != null ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "sts:AssumeRole",
    ]
    resources = [var.bedrock_assume_role_arn]
  }
}

resource "aws_iam_policy" "sts" {
  count  = var.bedrock_assume_role_arn != null ? 1 : 0
  name   = "${var.project_name}-${var.environment}-sts"
  policy = data.aws_iam_policy_document.sts[0].json
}

resource "aws_iam_role_policy_attachment" "sts" {
  count      = var.bedrock_assume_role_arn != null ? 1 : 0
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.sts[0].arn
}

# Secrets Manager - read Tavily API key
data "aws_iam_policy_document" "secrets" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.tavily_api_key_secret_name}*",
    ]
  }
}

data "aws_caller_identity" "current" {}

resource "aws_iam_policy" "secrets" {
  name   = "${var.project_name}-${var.environment}-secrets"
  policy = data.aws_iam_policy_document.secrets.json
}

resource "aws_iam_role_policy_attachment" "secrets" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.secrets.arn
}
