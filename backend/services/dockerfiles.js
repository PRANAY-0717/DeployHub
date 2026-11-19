// Dockerfile templates. Only used when the repo does not ship its own Dockerfile.
function dockerfileFor(info, port) {
  switch (info.stack) {
    case 'node':
      return [
        'FROM node:20-alpine',
        'WORKDIR /app',
        'COPY package*.json ./',
        info.hasLock ? 'RUN npm ci --omit=dev' : 'RUN npm install --omit=dev',
        'COPY . .',
        `ENV PORT=${port}`,
        `EXPOSE ${port}`,
        'CMD ["npm", "start"]',
      ].join('\n') + '\n';
    case 'python': {
      const mod = info.entry.replace(/\.py$/, '');
      return [
        'FROM python:3.12-slim',
        'WORKDIR /app',
        'COPY requirements.txt .',
        'RUN pip install --no-cache-dir -r requirements.txt',
        'COPY . .',
        `ENV PORT=${port}`,
        `EXPOSE ${port}`,
        info.gunicorn ? `CMD ["gunicorn", "-b", "0.0.0.0:${port}", "${mod}:app"]` : `CMD ["python", "${info.entry}"]`,
      ].join('\n') + '\n';
    }
    case 'static':
      return ['FROM nginx:alpine', 'COPY . /usr/share/nginx/html', 'EXPOSE 80'].join('\n') + '\n';
    default:
      throw new Error(`No Dockerfile template for stack "${info.stack}"`);
  }
}

const DOCKERIGNORE = ['node_modules', '.git', '.env', '__pycache__', '*.pyc', '.venv', 'Dockerfile', '.dockerignore'].join('\n') + '\n';

module.exports = { dockerfileFor, DOCKERIGNORE };
