locals {
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    environment            = var.environment
    project_name           = var.project_name
    aws_region             = var.aws_region
    cognito_user_pool_id   = aws_cognito_user_pool.main.id
    cognito_client_id      = aws_cognito_user_pool_client.main.id
    tavily_api_key_secret  = var.tavily_api_key_secret_name
    contact_email          = var.contact_email
    contact_sender         = var.contact_sender
    bedrock_assume_role_arn = var.bedrock_assume_role_arn
  })
}
resource "aws_security_group" "api" {
  name        = "${var.project_name}-${var.environment}-api"
  description = "Security group for ${var.project_name} API"

  tags = {
    Name        = "${var.project_name}-${var.environment}-api"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_vpc_security_group_ingress_rule" "api" {
  security_group_id = aws_security_group.api.id
  cidr_ipv4         = each.value
  from_port         = 8000
  ip_protocol       = "tcp"
  to_port           = 8000

  for_each = toset(var.allowed_cidr_blocks)
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.api.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "api" {
  ami                  = data.aws_ami.ubuntu.id
  instance_type        = var.instance_type
  iam_instance_profile = aws_iam_instance_profile.ec2.name
  key_name             = var.ssh_key_name
  user_data            = local.user_data

  vpc_security_group_ids = [aws_security_group.api.id]

  associate_public_ip_address = true

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_eip" "api" {
  domain   = "vpc"
  instance = aws_instance.api.id

  tags = {
    Name        = "${var.project_name}-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_route53_record" "api" {
  count   = var.domain_name != null ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_eip.api.public_ip]
}
