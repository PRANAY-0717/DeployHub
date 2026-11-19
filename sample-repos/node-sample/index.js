const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('<h1>Hello from Node</h1><p>Deployed by DeployHub 🚀</p>'));
app.get('/health', (req, res) => res.json({ ok: true }));
app.listen(PORT, '0.0.0.0', () => console.log(`node-sample listening on ${PORT}`));
