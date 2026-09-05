from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load environment variables from the backend directory explicitly
# Do not override existing environment variables so a stale local .env entry
# cannot replace a valid runtime secret.
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=False)

from app.routes import analysis_routes


def _log_missing_runtime_config() -> None:
    import os
    missing = [name for name in ("GROQ_API_KEY", "TAVILY_API_KEY") if not os.getenv(name)]
    if missing:
        print(f"WARNING: Missing backend config: {', '.join(missing)}")


_log_missing_runtime_config()

# Create FastAPI app
app = FastAPI(
    title="Aura AI - Fake News Detection API",
    description="Fact-checking API using LLM and search APIs",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(analysis_routes.router)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Aura AI"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"Validation error for {request.url.path}: {exc}")
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder({
            "detail": exc.errors(),
            "body": exc.body,
        })
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Aura AI - Fake News Detection API",
        "version": "1.0.0",
        "endpoints": {
            "analyze": "/analyze",
            "health": "/health"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
