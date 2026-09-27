# SQLSense AI - Security Architecture

SQLSense AI is engineered with defense-in-depth security principles across credential handling, network boundaries, and execution safety.

## 1. Application-Level Credential Encryption
- All stored target database passwords are encrypted at the application layer using **AES-256-GCM** with randomized 12-byte initialization vectors (IV) and authentication tags.
- Keys are loaded from `ENCRYPTION_KEY` in environment variables.
- Passwords are never returned in plaintext in any REST API response.

## 2. Safe Read-Only Execution & Guardrails
- **Read-Only Target Default**: Connections default to read-only semantics.
- **Destructive Query Protection**: Benchmarking and execution runners strictly refuse to execute `DROP`, `TRUNCATE`, `ALTER`, or `DELETE`/`UPDATE` without a `WHERE` clause.
- **Query Sandboxing**: All user and benchmark queries run with strict statement timeouts (`statement_timeout = 5000ms`) and result row limits to prevent denial-of-service or connection pool exhaustion.

## 3. API & Transport Security
- **JWT Authentication**: REST endpoints require signed JSON Web Tokens.
- **Helmet**: Secures HTTP headers against XSS and sniffing.
- **CORS**: Configured to restrict origin requests.
- **Rate Limiting**: Protects backend endpoints against brute-force attacks.
- **Backend-Only AI Execution**: `GEMINI_API_KEY` is strictly confined to the backend process and never exposed to the frontend browser runtime.
