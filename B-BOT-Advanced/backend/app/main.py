from fastapi import FastAPI

app = FastAPI(title="B-BOT Advanced")


@app.get("/health")
def health():
    return {"status": "ok"}