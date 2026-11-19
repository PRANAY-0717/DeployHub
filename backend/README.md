# DeployHub — Backend Module

The backend for DeployHub is an Express-based Node.js engine responsible for user authentication, repository ingestion, automated containerization, Kubernetes manifest rendering, cluster rollout management, and GitHub webhook event processing.

---

## Architecture Overview

```
backend/
├── server.js               # Application bootstrap, session manager & middleware routing
├── middleware/
│   └── requireAuth.js      # Session guard ensuring authenticated GitHub identity
├── routes/
│   ├── auth.js             # OAuth2 handshake, CSRF state verification & session life-cycle
│   ├── repos.js            # Repository inspection, branch listing & stack detection API
│   ├── deploy.js           # Trigger deployment jobs & stream deployment telemetry
│   └── webhook.js          # Ingest GitHub push events with HMAC-SHA256 signature verification
├── services/
│   ├── pipeline.js         # Core 7-stage deployment orchestration engine
│   ├── detector.js         # Language & runtime stack detection heuristic engine
│   ├── dockerfiles.js      # On-the-fly Dockerfile & .dockerignore generators
│   ├── manifest.js         # Kubernetes Deployment & Service manifest generator
│   ├── github.js           # Octokit client wrapper (OAuth, repo access, webhooks)
│   ├── store.js            # State store with AES-256-GCM token encryption
│   ├── shell.js            # Hardened subprocess runner (spawn-based with token redaction)
│   └── access.js           # GitHub user allowlist / authorization checker
├── scripts/
│   ├── preflight.js        # Environment and infrastructure verification script
│   └── smoke.js            # Offline unit & integration test suite
├── .env.example            # Environment configuration template
└── package.json            # Dependencies and npm scripts
```

---

## 7-Stage Pipeline Lifecycle (`services/pipeline.js`)

When a deployment is requested (manually or via push webhook), DeployHub runs an asynchronous 7-stage pipeline:

```
[0. Clone] ──> [1. Detect] ──> [2. Generate] ──> [3. Build] ──> [4. Push] ──> [5. Deploy] ──> [6. Live]
```

1. **Clone (`0`)**: Performs shallow clone (`--depth 1 --branch <ref>`) into a temporary workspace (`/tmp/deployhub/<id>`) using the authenticated GitHub token. The commit SHA is resolved.
2. **Detect (`1`)**: Evaluates repository files to identify stack (Node.js, Python, Static HTML, or custom Dockerfile) and target container port.
3. **Generate (`2`)**: If no Dockerfile exists in the repo root, dynamically generates an optimized multi-stage Dockerfile and `.dockerignore`.
4. **Build (`3`)**: Executes `docker build -t <docker_user>/<user>-<repo>:<sha>` with optional architecture targeting (`--platform linux/amd64`).
5. **Push (`4`)**: Authenticates against Docker Hub and pushes the immutable image tag.
6. **Deploy (`5`)**: Generates Kubernetes manifests, creates the user namespace (`deployhub-<user>`) if absent, and executes `kubectl apply -f manifest.yaml` followed by `kubectl rollout status`.
7. **Live (`6`)**: Discovers the service endpoint (AWS LoadBalancer public hostname/IP or NodePort address) and auto-registers a push webhook with the GitHub repository.

---

## API Reference

### Authentication (`/auth`)
- `GET /auth/login`: Generates cryptographic state nonce and redirects to GitHub OAuth.
- `GET /auth/callback`: Validates OAuth state token, exchanges temporary code for GitHub access token, and establishes authenticated session.
- `GET /auth/logout`: Destroys session and cleans up authentication cookies.

### Repositories (`/api/repos`)
- `GET /api/repos`: Lists accessible repositories for the authenticated user, attaching recent deployment statuses.
- `GET /api/repos/:owner/:repo/branches`: Fetches remote branch names for repository.
- `GET /api/repos/:owner/:repo/detect?branch=<branch>`: Analyzes repository tree to suggest stack and port before deployment.

### Deployments (`/api/deploy`)
- `POST /api/deploy`: Submits deployment request (`{ fullName, branch, port, replicas }`). Rate-limited to 10 requests/min per session.
- `GET /api/deployments`: Returns summary of all deployments initiated by the authenticated user.
- `GET /api/deployments/:id`: Returns detailed deployment state, current stage index, and incremental execution logs.

### Webhook (`/webhook`)
- `POST /webhook/github`: Raw body webhook endpoint verified via HMAC-SHA256 (`x-hub-signature-256`). Re-triggers pipeline rollout on branch push.

---

## Security Implementation
- **Subprocess Isolation**: Commands run through `spawn` with array parameters. Shell interpretation (`sh -c`) is avoided, eliminating command injection vulnerabilities.
- **Log Redaction**: All stdout/stderr streams pass through `redactText()`, masking GitHub personal access tokens, session keys, and Docker passwords before emitting to storage or UI.
- **Multi-Tenant Kubernetes Isolation**: Every user's workloads are deployed to an isolated namespace: `deployhub-<sanitized_github_login>`.
- **Encrypted Persistence**: Sensitive tokens in `state.json` are encrypted using AES-256-GCM derived from `SESSION_SECRET`.

