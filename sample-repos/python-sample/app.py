import os
from flask import Flask

app = Flask(__name__)

@app.route("/")
def home():
    return "<h1>Hello from Python</h1><p>Deployed by DeployHub 🚀</p>"

@app.route("/health")
def health():
    return {"ok": True}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
