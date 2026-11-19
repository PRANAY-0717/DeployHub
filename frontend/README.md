# DeploySync — Frontend Module

The frontend for DeploySync provides a dark-themed, responsive dashboard interface for automated CI/CD deployments. It combines Server-Side Rendered (SSR) views with dynamic client-side DOM manipulation and real-time polling.

---

## Architecture Overview

```
frontend/
├── public/                     # Static assets served directly to the browser
│   ├── css/
│   │   └── style.css           # Global design system & dark theme styling
│   └── js/
│       ├── common.js           # Shared utilities (relative time formatting, escaping)
│       ├── deploy-modal.js     # Modal logic for stack detection & deployment trigger
│       ├── deployments.js      # Deployments dashboard table and polling
│       ├── detail.js           # Live 7-stage pipeline stepper & terminal log viewer
│       └── repos.js            # Repository filtering, search, and branch selection
└── views/                      # EJS (Embedded JavaScript) server templates
    ├── login.ejs               # Authentication landing page (GitHub OAuth trigger)
    ├── repos.ejs               # Repository catalog browser
    ├── deployments.ejs         # Deployments overview dashboard
    ├── deployment-detail.ejs   # Real-time build & deployment detail monitor
    └── partials/               # Modular template components
        ├── head.ejs            # HTML <head>, meta tags, stylesheet links
        ├── navbar.ejs          # Global navigation bar & user profile display
        └── foot.ejs            # Closing body tags & script imports
```

---

## Views & Pages

| Page | Route | Description | Associated Scripts |
|---|---|---|---|
| **Login** | `GET /` | Unauthenticated landing page with GitHub OAuth sign-in button and error alerts | Inline styles / vanilla DOM |
| **Repositories** | `GET /repos` | Grid/list of the authenticated user's GitHub repositories with search, language filters, and "Deploy" action buttons | `repos.js`, `deploy-modal.js` |
| **Deployments** | `GET /deployments` | List of all past and active deployment jobs with status badges (`live`, `failed`, `pending`) and direct app links | `deployments.js` |
| **Deployment Detail** | `GET /deployments/:id` | Interactive 7-stage deployment progress stepper and live streaming terminal logs | `detail.js` |

---

## Client-Side Scripts

### 1. `detail.js` (Live Pipeline Stepper & Terminal Log Viewer)
- Polls `GET /api/deployments/:id` every 1,500ms while a deployment is running.
- Updates the 7 pipeline stages dynamically:
  1. `Cloning`
  2. `Detecting`
  3. `Generating`
  4. `Building`
  5. `Pushing`
  6. `Deploying`
  7. `Live`
- Automatically appends incoming ANSI/standard stdout/stderr logs into the terminal viewer.
- Auto-scrolls logs to the bottom and stops polling once the deployment status reaches `live` or `failed`.

### 2. `deploy-modal.js` (Configuration Dialog)
- Triggers when clicking **Deploy** on any repository card.
- Calls `GET /api/repos/:owner/:repo/detect?branch=<branch>` to automatically detect stack type (Node.js, Python, Static, Dockerfile) and pre-fill the default container port.
- Allows user overrides for branch, replica count (1 to 3), and port.
- Sends `POST /api/deploy` and redirects the user to the live deployment detail monitor upon acceptance.

### 3. `repos.js` (Repository Browser)
- Fetches all user repositories asynchronously from `GET /api/repos`.
- Implements instant client-side filtering by repository name and programming language dropdown.
- Displays last deployment state directly on repository cards.

### 4. `deployments.js` (Deployments Dashboard)
- Fetches all user deployments via `GET /api/deployments`.
- Renders tabular status with live indicators, commit hash tags, and direct access links.

---

## Design System & Styling (`style.css`)
- **Theme**: High-contrast, modern dark mode with a refined slate palette (`#0d1117`, `#161b22`, `#21262d`).
- **Accent Colors**:
  - Primary Accent: Neon Green / Emerald (`#2ea043`, `#3fb950`)
  - Warning: Gold / Yellow (`#d29922`)
  - Error: Coral / Red (`#f85149`)
  - Informational: Electric Blue (`#58a6ff`)
- **Components**:
  - Live pipeline progress stepper with pulsed active indicators
  - Monospaced terminal container mimicking standard shell outputs
  - Modal dialog overlays with keyboard escape handlers
  - Responsive tables and cards for mobile and desktop viewports

