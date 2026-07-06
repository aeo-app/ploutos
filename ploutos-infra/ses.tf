resource "aws_ses_email_identity" "sender" {
  email = var.contact_sender
}

resource "aws_ses_domain_identity" "sender_domain" {
  domain = split("@", var.contact_sender)[1]
}
