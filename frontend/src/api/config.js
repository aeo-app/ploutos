// Configurable via REACT_APP_AIRWALLEX_ENV (see .env.example) — defaults to
// "prod" since that's this app's actual deployed configuration. Must match
// whatever environment the BACKEND's own AIRWALLEX_ENV is set to (see the
// backend's .env.example) — a mismatch here is exactly what produces
// Airwallex's "Access denied, authentication failed" error client-side,
// since a PaymentIntent's client_secret is only valid in the same
// environment (demo/sandbox vs prod) it was created in.
export const AIRWALLEX_ENV = "prod";