/**
 * infra/cloudfront-functions/append-index-html.js
 * ============================================================================
 * NOT wired into any deployment automatically — this repo has no Terraform
 * for the frontend's actual CloudFront distribution (only for the
 * backend's separate media-upload S3 bucket), so I can't confirm from the
 * code alone whether this is already handled or still needed.
 *
 * Why this might matter: scripts/prerender/index.js writes files like
 * build/blog/why-your-h1-doesnt-matter/index.html — for a request to
 * /blog/why-your-h1-doesnt-matter to actually find that file, SOMETHING
 * needs to append "/index.html" to the request path first. Whether that
 * already happens depends entirely on how the S3 bucket is exposed:
 *
 *   - If CloudFront's origin is the bucket's S3 WEBSITE ENDPOINT
 *     (bucket.s3-website-<region>.amazonaws.com, with the bucket's own
 *     "static website hosting" feature enabled and an Index Document
 *     configured) — S3 already does this automatically. Nothing more
 *     needed; this function would be redundant.
 *   - If CloudFront's origin is the bucket's REGULAR REST API endpoint
 *     (bucket.s3.<region>.amazonaws.com, the more common/modern setup,
 *     often paired with Origin Access Control) — S3 does NOT append
 *     index.html to subdirectory requests on its own. Without something
 *     rewriting the URI, a request to /blog/my-post 404s at the S3
 *     origin, and (if there's a SPA fallback rule redirecting 403/404 to
 *     the root index.html) it would silently serve the GENERIC landing
 *     page shell instead of the pre-rendered post — exactly the failure
 *     this whole feature is meant to prevent, just moved one layer deeper.
 *
 * This function handles that second case. Attach it as a CloudFront
 * Function (Functions tab in the CloudFront console, or via the
 * aws_cloudfront_function + function_association Terraform resources) on
 * the distribution's default cache behavior, event type "viewer-request".
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Already has a real file extension (.html, .js, .css, .png, ...) or is
  // the API path — leave it alone.
  if (/\.[a-zA-Z0-9]+$/.test(uri)) {
    return request;
  }

  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else {
    request.uri = uri + '/index.html';
  }

  return request;
}
