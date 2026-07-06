output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.main.id
}

output "dynamodb_tables" {
  description = "DynamoDB table names"
  value = {
    for k, t in aws_dynamodb_table.this : k => t.name
  }
}

output "ec2_public_ip" {
  description = "EC2 instance public IP"
  value       = aws_eip.api.public_ip
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.api.id
}

output "iam_role_arn" {
  description = "EC2 IAM role ARN"
  value       = aws_iam_role.ec2.arn
}

output "ses_sender_email" {
  description = "SES verified sender email"
  value       = aws_ses_email_identity.sender.email
}
