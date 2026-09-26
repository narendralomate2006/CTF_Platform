from flask import Flask
app = Flask(__name__)

@app.get("/")
def home():
    return "<h1>OWASP Live Challenge</h1><p>Instance is running. Your challenge files and instructions belong here.</p>"

@app.get("/health")
def health():
    return {"status": "ok"}

app.run(host="0.0.0.0", port=8080)
