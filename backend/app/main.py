"""
Handsfree FastAPI application factory.

Registers middleware and all v1 routers. The backend is an optional layer;
the extension works fully offline when this service is absent.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1 import health, auth, sync, rituals, benchmarks, llm, stt


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Handsfree API",
        version="0.1.0",
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(sync.router, prefix="/api/v1/sync", tags=["sync"])
    app.include_router(rituals.router, prefix="/api/v1/rituals", tags=["rituals"])
    app.include_router(benchmarks.router, prefix="/api/v1/benchmarks", tags=["benchmarks"])
    app.include_router(llm.router, prefix="/api/v1/llm", tags=["llm"])
    app.include_router(stt.router, prefix="/api/v1/stt", tags=["stt"])

    return app


app = create_app()
