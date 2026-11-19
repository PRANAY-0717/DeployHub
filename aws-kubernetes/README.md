# DeploySync — AWS and Kubernetes Module

This module provides the cloud infrastructure, containerization, orchestration manifests, and automated provisioning scripts to deploy and operate DeploySync across **Amazon Web Services (AWS)** and **Kubernetes** clusters (AWS EKS, k3s, minikube, or GKE/AKS).

---

## Architecture Overview

```
aws-kubernetes/
├── aws/
│   ├── ec2-setup.sh             # Automated single-command VM setup script for AWS EC2
│   ├── start.sh                 # Production VM service launcher (PM2 + systemd boot)
│   └── terraform/               # Infrastructure as Code (IaC) for AWS
│       ├── main.tf              # VPC, Subnet, Internet Gateway, Security Group & EC2
│       ├── variables.tf         # Configurable parameters (region, instance type, CIDR)
│       └── outputs.tf           # Provisioned Public IP, Web URL & OAuth callback URL
├── kubernetes/
│   ├── rbac.yaml                # ClusterRole, ServiceAccount & RoleBinding for cluster management
│   ├── deploysync-deployment.yaml# DeploySync control plane deployment manifest
│   ├── deploysync-service.yaml   # DeploySync LoadBalancer service manifest (AWS NLB/ELB)
│   ├── ingress.yaml             # Ingress specification for AWS Application Load Balancer (ALB)
│   └── app-template.yaml        # Reference specification for user applications dynamically deployed
└── docker/
    ├── Dockerfile               # Multi-stage production container image for DeploySync
    ├── docker-compose.yml       # Local container orchestration with Docker socket & kubeconfig mounts
    └── .dockerignore            # Build ignore rules
```

---

## 1. AWS Provisioning Options

### Option A: Automated Provisioning via Terraform (IaC)
Provisions an isolated VPC, public subnet, security group (ports 22, 3000, 30000-32767), EC2 instance (`t3.medium`), and an Elastic IP:
```bash
cd aws-kubernetes/aws/terraform
terraform init
terraform plan
terraform apply
```
Once complete, the outputs will show your public IP and OAuth callback URL:
```text
public_ip          = "3.84.120.45"
web_ui_url         = "http://3.84.120.45:3000"
oauth_callback_url = "http://3.84.120.45:3000/auth/callback"
```

### Option B: EC2 VM Setup Script (`ec2-setup.sh`)
For fresh Ubuntu 22.04 LTS EC2 instances:
```bash
git clone <your-repo> deploysync && cd deploysync
bash aws-kubernetes/aws/ec2-setup.sh
```
What this automated script executes:
1. Installs Docker CE, Node.js 20+, Git, curl, OpenSSL, and PM2.
2. Installs `k3s` (lightweight CNCF-certified Kubernetes) and exports `~/.kube/config`.
3. Interrogates AWS EC2 Instance Metadata Service (IMDSv2) to detect the VM's public IPv4 address.
4. Auto-generates cryptographic secrets (`SESSION_SECRET`, `WEBHOOK_SECRET`) and updates `backend/.env`.
5. Prompts you to configure GitHub OAuth credentials and launch with `bash aws-kubernetes/aws/start.sh`.

---

## 2. Kubernetes Multi-Tenant Architecture

DeploySync isolates every user's deployed applications at the Kubernetes cluster level:

```
                      ┌──────────────────────────────────────┐
                      │          Kubernetes Cluster          │
                      │               (AWS EKS)              │
                      └──────────────────┬───────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     ┌───────────────────────┐                       ┌───────────────────────┐
     │ Namespace:            │                       │ Namespace:            │
     │ deploysync-octocat     │                       │ deploysync-johndoe     │
     ├───────────────────────┤                       ├───────────────────────┤
     │ • Deployment: web-app │                       │ • Deployment: api-svc │
     │ • Service (LB/NodePt) │                       │ • Service (LB/NodePt) │
     │ • Pod replicas: 2     │                       │ • Pod replicas: 1     │
     └───────────────────────┘                       └───────────────────────┘
```

### RBAC Security (`rbac.yaml`)
To deploy workloads into the cluster, DeploySync's ServiceAccount requires permissions to create user namespaces and manage deployments and services:
```bash
kubectl apply -f aws-kubernetes/kubernetes/rbac.yaml
```

### Rolling Update Strategy
Every dynamically generated application deployment uses a strict zero-downtime rolling update strategy:
- `maxUnavailable: 0`: Guarantees zero dropped requests by retaining all healthy pods until new pods pass liveness and readiness probes.
- `maxSurge: 1`: Spins up a canary pod with the newly pushed container image.
- `annotations["deploysync.io/deployed-at"]`: A deployment timestamp forces Kubernetes to execute a rollout update even if the commit SHA is identical.

### Service Modes
- **AWS EKS / Cloud (`CLUSTER_MODE=cloud`)**:
  Services are provisioned as `type: LoadBalancer`. DeploySync monitors the status until the cloud controller provisions an AWS Network/Classic Load Balancer URL.
- **Single VM / Local (`CLUSTER_MODE=local`)**:
  Services are provisioned as `type: NodePort` (allocated in range 30000-32767). The external host IP (`LOCAL_HOST`) is resolved and presented to the user.

---

## 3. Containerization (`docker/`)

### Build Container Image:
```bash
docker build -t deploysync:latest -f aws-kubernetes/docker/Dockerfile .
```

### Run with Docker Compose:
```bash
cd aws-kubernetes/docker
docker compose up -d
```
The compose configuration mounts the host Docker socket (`/var/run/docker.sock`) and Kubernetes config (`~/.kube/config`), allowing DeploySync inside the container to build images and orchestrate Kubernetes resources.

