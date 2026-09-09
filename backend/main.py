"""
main.py — APAC SEO Intelligence API v4
AWS Bedrock + Cognito + DynamoDB
"""
import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

print("CURRENT DIR:", os.getcwd())

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warn about missing Cognito config
    for var in ("COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID"):
        if not os.getenv(var):
            logger.warning(f"[startup] {var} not set — auth endpoints will fail")

    # Warn about missing Bedrock config
    if not os.getenv("AWS_ACCESS_KEY_ID") and not os.getenv("DYNAMODB_ENDPOINT_URL"):
        logger.warning(
            "[startup] No explicit AWS credentials — relying on IAM role "
            "(correct for EC2/ECS/Lambda; set creds for local dev)"
        )

    # Auto-create DynamoDB tables in local dev mode — analyses table AND
    # the separate payments table (db/payments_dynamo.py).
    if os.getenv("DYNAMODB_ENDPOINT_URL"):
        logger.info(f"[startup] Local DynamoDB at {os.getenv('DYNAMODB_ENDPOINT_URL')}")
        from db import create_table_if_not_exists, create_payments_table_if_not_exists
        create_table_if_not_exists()
        create_payments_table_if_not_exists()

    # Log active model and architecture
    model = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
    logger.info(f"[startup] Bedrock model: {model}")
    # Background job for scheduled social posts (Facebook + Instagram — see
    # services/social_publish/scheduler.py for why this exists at all:
    # Instagram's API has no native "post later" parameter, so something
    # has to hold the post and trigger it at the right time. Runs
    # in-process via APScheduler rather than requiring separate cron/
    # EventBridge infrastructure — fine as long as this app runs as a
    # persistent process (not a per-request serverless invocation, which
    # would spin up a fresh scheduler on every request and never let a job
    # actually fire between requests).
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from services.social_publish.scheduler import process_due_scheduled_posts

    def _run_due_posts_job():
        try:
            count = process_due_scheduled_posts()
            if count:
                logger.info(f"[scheduler] processed {count} due scheduled post(s)")
        except Exception as e:
            logger.error(f"[scheduler] job run failed: {e}", exc_info=True)

    scheduler = AsyncIOScheduler()
    poll_seconds = int(os.getenv("SCHEDULED_POSTS_POLL_SECONDS", "60"))
    scheduler.add_job(_run_due_posts_job, "interval", seconds=poll_seconds, id="process_due_scheduled_posts")
    scheduler.start()
    logger.info(f"[startup] Scheduled-posts background job running every {poll_seconds}s")

    logger.info("[startup] Anti-hallucination: knowledge-declaration pipeline (no external search APIs)")
    logger.info("[startup] APAC SEO Intelligence API v4 ready")
    yield
    scheduler.shutdown(wait=False)
    logger.info("[shutdown] Goodbye")


app = FastAPI(
    title="APAC SEO Intelligence API",
    description="""
AI-powered SEO competitive intelligence — **AWS Bedrock · Cognito · DynamoDB**.

## Authentication
All SEO and history endpoints require a valid Cognito access token.

```
1. POST /api/v1/auth/signup      → register, get OTP by email
2. POST /api/v1/auth/verify      → confirm OTP → account activated
3. POST /api/v1/auth/login       → returns access_token + refresh_token
4. Use: Authorization: Bearer <access_token> on all other requests
5. POST /api/v1/auth/refresh     → renew access_token without password
```

## SEO Analysis (requires auth — free-preview partial results for unpaid users)
```
POST /api/v1/seo/competitors
POST /api/v1/seo/keywords
POST /api/v1/seo/profile
POST /api/v1/seo/domain-authority
POST /api/v1/seo/full-report
POST /api/v1/seo/content-strategy   — keyword → competitor → content strategy generator
POST /api/v1/seo/content-strategy/stream — same, streamed via SSE
```
None of these require payment to call. Unpaid users get a real but partial
result — a couple of real rows per table (or, for content-strategy, one
fully-generated keyword), with the rest returned as zero-Bedrock-cost locked
placeholder rows/items (`locked: true`) padded back up to the normal display
count. Paid users get every row/item unlocked. See services/bedrock_service.py's
free-preview row limits and services/social_service.py's day limits.

## Social Media Content (requires auth — same free-preview behaviour)
```
POST /api/v1/social/relocation-calendar         — relocation content calendar for a date range (blocking)
POST /api/v1/social/relocation-calendar/stream  — same, streamed via SSE (day-by-day)
```

## Payments (Airwallex) — triggered contextually, never as a blanket gate
```
GET  /api/v1/payment/plans          — the plan catalog (Starter/Growth/Scale)
POST /api/v1/payment/create-intent  — {"plan_id": ...} creates a PaymentIntent
GET  /api/v1/payment/status         — current entitlement (+ optional live poll)
GET  /api/v1/payment/history        — past transactions
POST /api/v1/payment/webhook        — no auth; verified via Airwallex HMAC signature instead
```
No endpoint in this API requires payment to be *called* — payment is only
ever triggered by the frontend explicitly (a locked row's "Unlock" button),
never by the backend blocking a request outright. This also means signing
up, logging in, and browsing the app never forces a payment screen.

## History (requires auth only)
```
GET    /api/v1/history            — your analyses (paginated)
GET    /api/v1/history/stats      — counts by type
GET    /api/v1/history/{id}       — full result payload
DELETE /api/v1/history/{id}       — delete record
```

## Data quality — Knowledge Declaration Architecture
No external search APIs required. Uses a two-call anti-hallucination pipeline:
1. **Call 1** — Bedrock audits its own knowledge, assigning `confirmed / approximate / unknown` to every fact.
2. **Call 2** — Structures output from confirmed facts only. Unknown facts → `null`.

`null` numeric fields = Bedrock could not confirm this value from training data.
`"not found"` string fields = not in Bedrock's confirmed knowledge.
`current_da = 0` = DA score not confirmed — check Moz/Ahrefs directly.
""",
    version="4.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://api.aeo-app.ai",
        "https://www.aeo-app.ai"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers.auth_router import router as auth_router
from routers.seo_router  import router as seo_router
from routers.social_router import router as social_router
from routers.payment_router import router as payment_router
from routers.canva_router import router as canva_router
from routers.admin_router import router as admin_router
from routers.blog_router import router as blog_router
from routers.social_publish_router import router as social_publish_router
from routers.article_router import router as article_router

app.include_router(auth_router)
app.include_router(seo_router)
app.include_router(social_router)
app.include_router(payment_router)
app.include_router(canva_router)
app.include_router(admin_router)
app.include_router(blog_router)
app.include_router(social_publish_router)
app.include_router(article_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "service":  "APAC SEO Intelligence API",
        "version":  "4.1.0",
        "ai":       os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
        "auth":     "AWS Cognito",
        "db":       f"DynamoDB / {os.getenv('APAC_SEO_TABLE', 'apac_seo_analyses')}",
        "region":   os.getenv("AWS_REGION", "ap-southeast-1"),
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "4.1.0"}
