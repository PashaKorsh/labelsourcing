from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import auth, datasets, tasks, labels, users, tags, sources, proxy
from app.database import engine
from app.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # async with engine.begin() as conn:
    #     await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Labelsourcing API",
    description="API для краудсорсинговой платформы разметки данных",
    version="0.1.0",
    lifespan=lifespan,
    root_path="/api/v1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(datasets.router)
app.include_router(tasks.router)
app.include_router(labels.router)
app.include_router(users.router)
app.include_router(tags.router)
app.include_router(sources.router)
app.include_router(proxy.router)

@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok", "service": "labelsourcing-backend"}