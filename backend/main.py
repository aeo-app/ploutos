"""
main.py — APAC SEO Intelligence API v4
AWS Bedrock + Cognito + DynamoDB
"""
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv() 

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

    # Auto-create DynamoDB table in local dev mode
    if os.getenv("DYNAMODB_ENDPOINT_URL"):
        logger.info(f"[startup] Local DynamoDB at {os.getenv('DYNAMODB_ENDPOINT_URL')}")
        from db import create_table_if_not_exists
        create_table_if_not_exists()

    # Log active model and architecture
    model = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
    logger.info(f"[startup] Bedrock model: {model}")
    logger.info("[startup] Anti-hallucination: knowledge-declaration pipeline (no external search APIs)")
    logger.info("[startup] APAC SEO Intelligence API v4 ready")
    yield
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

## SEO Analysis (requires auth)
```
POST /api/v1/seo/competitors
POST /api/v1/seo/keywords
POST /api/v1/seo/profile
POST /api/v1/seo/domain-authority
POST /api/v1/seo/full-report
POST /api/v1/seo/content-strategy   — keyword → competitor → content strategy generator
POST /api/v1/seo/content-strategy/stream — same, streamed via SSE
```

## Social Media Content (requires auth + payment)
```
POST /api/v1/social/relocation-calendar         — relocation content calendar for a date range (blocking)
POST /api/v1/social/relocation-calendar/stream  — same, streamed via SSE (day-by-day)
```

## Payments (Airwallex) — gates every endpoint above except auth
```
POST /api/v1/payment/create-intent  — requires auth only; creates a PaymentIntent
GET  /api/v1/payment/status         — requires auth only; current entitlement (+ optional live poll)
GET  /api/v1/payment/history        — requires auth only; past transactions
POST /api/v1/payment/webhook        — no auth; verified via Airwallex HMAC signature instead
```
All SEO and Social endpoints above now require `core.security.require_paid_access`
instead of plain auth — a 402 Payment Required is returned until the user
completes payment. Only auth endpoints (login/signup/forgot-password) and the
four payment endpoints above are exempt.
```

## History (requires auth)
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
    version="4.0.0",
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

app.include_router(auth_router)
app.include_router(seo_router)
app.include_router(social_router)
app.include_router(payment_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "service":  "APAC SEO Intelligence API",
        "version":  "4.0.0",
        "ai":       os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
        "auth":     "AWS Cognito",
        "db":       f"DynamoDB / {os.getenv('APAC_SEO_TABLE', 'apac_seo_analyses')}",
        "region":   os.getenv("AWS_REGION", "ap-southeast-1"),
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "4.0.0"}
