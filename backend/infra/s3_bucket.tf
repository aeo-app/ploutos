# ─── S3 — user-uploaded media for direct social posting ─────────────────────
# See services/media_upload_service.py — a public-read bucket for images a
# user uploads directly (not created via Canva) so Facebook/Instagram's
# posting APIs have a public URL to fetch the image from.

variable "media_upload_bucket_name" {
  default = "aeo-app-media-uploads"
}

resource "aws_s3_bucket" "media_uploads" {
  bucket = var.media_upload_bucket_name

  tags = {
    Project     = "aeo-app"
    Environment = "production"
    ManagedBy   = "terraform"
    Purpose     = "user-uploaded social media post images"
  }
}

resource "aws_s3_bucket_public_access_block" "media_uploads" {
  bucket = aws_s3_bucket.media_uploads.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_ownership_controls" "media_uploads" {
  bucket = aws_s3_bucket.media_uploads.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_cors_configuration" "media_uploads" {
  bucket = aws_s3_bucket.media_uploads.id
  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
  }
}

# Lifecycle: uploaded post images don't need to live forever — clean up
# after 180 days to control storage cost. Adjust/remove if you need longer
# retention for compliance reasons.
resource "aws_s3_bucket_lifecycle_configuration" "media_uploads" {
  bucket = aws_s3_bucket.media_uploads.id
  rule {
    id     = "expire-old-uploads"
    status = "Enabled"
    filter {
      prefix = "uploads/"
    }
    expiration {
      days = 180
    }
  }
}

output "media_upload_bucket_name" {
  value = aws_s3_bucket.media_uploads.bucket
}
