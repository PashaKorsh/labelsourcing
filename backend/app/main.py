from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import auth, datasets, tasks, labels

app = FastAPI(
    title="Labelsourcing API",
    description="API для краудсорсинговой платформы разметки данных",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(datasets.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(labels.router, prefix="/api")

@app.get("/api/health", tags=["System"])
async def health_check():
    return {"status": "ok", "service": "labelsourcing-backend"}