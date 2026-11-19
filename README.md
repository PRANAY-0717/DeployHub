# DeploySync — Automated CI/CD Platform

> **Automated GitHub to Kubernetes Continuous Deployment Platform**: Sign in with GitHub, select a repository, and DeploySync automatically clones it, detects the application runtime, generates a Dockerfile, builds and pushes the container image to Docker Hub, and rolls out a multi-replica deployment to a managed Kubernetes cluster with zero downtime.

---

## 3-Tier Project Architecture

The project has been separated into three modules: **Frontend**, **Backend**, and **AWS & Kubernetes**.

```
DeploySync/
├── frontend/                     # Part 1: UI Views, Static Assets, Client Logic
│   ├── public/                   # CSS styles and client-side JavaScript controllers
│   ├── views/                    # EJS templates (Login, Repos, Deployments, Stepper/Logs)
│   ├── package.json              # Frontend package metadata
│   └── README.md                 # Frontend UI documentation & design system
│
├── backend/                      # Part 2: Express Server, Core Engine & APIs
│   ├── routes/                   # REST endpoints (auth, repos, deploy, webhook)
│   ├── services/                 # 7-stage pipeline, stack detector, k8s manifest generator
│   ├── middleware/               # Authentication & session verification guards
│   ├── scripts/                  # Preflight validation & offline smoke tests
│   ├── server.js                 # Express server bootstrap & session orchestration
│   ├── package.json              # Backend dependencies & npm scripts
│   └── README.md                 # Backend API & service architecture documentation
│
├── aws-kubernetes/               # Part 3: Cloud Infrastructure & Container Orchestration
│   ├── aws/                      # AWS deployment scripts (EC2 setup, PM2) & Terraform IaC
│   ├── kubernetes/               # RBAC, DeploySync control plane & reference app manifests
│   ├── docker/                   # Multi-stage Dockerfile & docker-compose configurations
│   └── README.md                 # Cloud & Kubernetes infrastructure documentation
│
├── sample-repos/                 # Sample apps for end-to-end testing (Node, Python, Static)
│   ├── node-sample/
│   ├── python-sample/
│   └── static-sample/
│
├── package.json                  # Root orchestration & convenience npm scripts
└── README.md                     # Main documentation & architecture guide
```

---

## System Flow & Architecture

```
User (Browser) ──> Express Backend (Port 3000)
                     │  1. GitHub OAuth2 ──────────────> GitHub (login, repos, branches)
                     │  2. git clone (token redacted) ─> Local Workspace
                     │  3. Detect Stack ───────────────> Generate Dockerfile (.dockerignore)
                     │  4. docker build & push ────────> Docker Hub Registry
                     │  5. kubectl apply (Deploy + Svc)> AWS EKS / k3s / minikube
                     │  6. Resolve Endpoint ───────────> Cloud LoadBalancer / NodePort
GitHub Push Event ──> POST /webhook/github (HMAC-SHA256) ─> Triggers Rolling Update (Steps 2-6)
```

---

## Part 1: Frontend (`frontend/`)

- **Rendering Engine**: Server-Side Rendered (SSR) with Embedded JavaScript (`ejs`) combined with reactive vanilla JavaScript client controllers.
- **Key Views**:
  - `views/login.ejs`: GitHub OAuth landing page.
  - `views/repos.ejs`: Repository browser with instant client-side search, language filter, and branch selector.
  - `views/deployments.ejs`: Dashboard of historical and running deployments.
  - `views/deployment-detail.ejs`: Real-time deployment monitor featuring a 7-stage visual progress stepper and an auto-scrolling terminal log output.
- **Client Controllers (`frontend/public/js/`)**:
  - `deploy-modal.js`: Fetches auto-detected stack details, configures ports/replicas, and dispatches deploy requests.
  - `detail.js`: Polls `/api/deployments/:id` to dynamically update progress badges and append log lines.
- **Design System**: High-contrast, clean dark theme (`frontend/public/css/style.css`).

See the [Frontend README](file:///Users/prans/Downloads/DeploySync-main/frontend/README.md) for detailed UI component documentation.

---

## Part 2: Backend (`backend/`)

- **Server**: Express.js server (`backend/server.js`) with session management, rate limiting, and security headers.
- **Core Engine & Services (`backend/services/`)**:
  - `pipeline.js`: Asynchronous 7-stage deployment worker:
    1. **Clone**: Shallow clones repo using user's OAuth token.
    2. **Detect**: Identifies stack (Node, Python, Static, Dockerfile).
    3. **Generate**: Dynamically produces an optimized Dockerfile and `.dockerignore`.
    4. **Build**: Executes `docker build` with tagging based on Git commit SHA.
    5. **Push**: Pushes image to Docker Hub registry.
    6. **Deploy**: Creates isolated user namespace (`deploysync-<user>`) and applies Kubernetes Deployment and Service.
    7. **Live**: Discovers service URL and binds a GitHub push webhook.
  - `detector.js`: Heuristic rule engine for runtime stack determination.
  - `dockerfiles.js`: Templates for Node, Python, Static, and custom Dockerfiles.
  - `manifest.js`: Generates zero-downtime Kubernetes manifests with resource constraints and health probes.
  - `store.js`: Persists deployments and encrypts tokens at rest using AES-256-GCM.
  - `shell.js`: Safe subprocess execution using `spawn` (no shell interpolation) with real-time token masking.

See the [Backend README](file:///Users/prans/Downloads/DeploySync-main/backend/README.md) for API specifications and security details.

---

## Part 3: AWS and Kubernetes (`aws-kubernetes/`)

- **AWS Infrastructure (`aws-kubernetes/aws/`)**:
  - `ec2-setup.sh`: Automated one-shot shell provisioning for AWS EC2 (Ubuntu 22.04 LTS), configuring Docker, Node 20, k3s, PM2, and resolving public IP via AWS IMDSv2.
  - `start.sh`: Production startup manager under PM2 with systemd boot persistence.
  - `terraform/`: Infrastructure as Code (IaC) defining VPC, Subnet, Internet Gateway, Security Groups, and EC2 instance with Elastic IP.
- **Kubernetes Orchestration (`aws-kubernetes/kubernetes/`)**:
  - `rbac.yaml`: ServiceAccount, ClusterRole, and ClusterRoleBinding for DeploySync orchestrator permissions.
  - `deploysync-deployment.yaml`: Kubernetes deployment manifest to run DeploySync itself in-cluster.
  - `deploysync-service.yaml`: LoadBalancer service definition (AWS NLB/ELB).
  - `ingress.yaml`: Ingress controller routing for AWS Application Load Balancers.
  - `app-template.yaml`: Standalone reference manifest demonstrating the exact Kubernetes schema generated for user applications.
- **Containerization (`aws-kubernetes/docker/`)**:
  - `Dockerfile`: Multi-stage production container image bundling Git, Docker CLI, and kubectl.
  - `docker-compose.yml`: Local multi-container orchestrator with mounted Docker socket.

See the [AWS & Kubernetes README](file:///Users/prans/Downloads/DeploySync-main/aws-kubernetes/README.md) for full cloud setup steps.

---

## Quickstart Guide

### 1. Prerequisites
- **Node.js**: v20 or higher
- **Git**
- **Docker**: Installed and running daemon
- **Kubernetes**: `kubectl` connected to a cluster (`minikube`, `k3s`, or `AWS EKS`)
- **Docker Hub**: Account and Access Token
- **GitHub OAuth App**: Registered in GitHub Developer Settings (`Homepage: http://localhost:3000`, `Callback: http://localhost:3000/auth/callback`)

### 2. Installation
```bash
# Install dependencies
npm --prefix backend install
npm install
```

### 3. Environment Configuration
```bash
cp backend/.env.example backend/.env
# Edit backend/.env and populate:
# GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, DOCKER_USER, DOCKER_PASS, SESSION_SECRET, WEBHOOK_SECRET
```

### 4. Verification & Testing
```bash
# Run unit and integration smoke tests
npm run smoke

# Run system preflight checks (tools, docker daemon, cluster access)
npm run preflight
```

### 5. Launch
```bash
# Start the server
npm start
# Open http://localhost:3000 in your browser
```

---
