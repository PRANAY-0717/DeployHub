// Generates a Deployment + Service. All values pass through JSON.stringify (valid YAML scalars)
// and names are sanitized, so user input can never break out of the YAML structure.
function sanitizeName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'app';
}

function render({ name, namespace, image, port, replicas, mode, repo, commit }) {
  const q = (v) => JSON.stringify(String(v));
  const svcType = mode === 'local' ? 'NodePort' : 'LoadBalancer';
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: ${name}
    managed-by: deployhub
  annotations:
    deployhub.io/repo: ${q(repo)}
spec:
  replicas: ${Number(replicas)}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
        managed-by: deployhub
      annotations:
        deployhub.io/commit: ${q(commit || 'unknown')}
        deployhub.io/deployed-at: ${q(new Date().toISOString())}
    spec:
      containers:
        - name: ${name}
          image: ${q(image)}
          imagePullPolicy: Always
          ports:
            - containerPort: ${Number(port)}
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { cpu: 500m, memory: 256Mi }
          readinessProbe:
            tcpSocket: { port: ${Number(port)} }
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            tcpSocket: { port: ${Number(port)} }
            initialDelaySeconds: 15
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: ${name}
    managed-by: deployhub
spec:
  type: ${svcType}
  selector:
    app: ${name}
  ports:
    - port: 80
      targetPort: ${Number(port)}
`;
}

module.exports = { sanitizeName, render };
