"""
ResearchBuilder — API Entry Point
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import init_db
from routers.admin import router as admin_router
from routers.auth import router as auth_router
from routers.payment import router as payment_router
from routers.research import router as research_router
from routers.runs import router as runs_router

load_dotenv(dotenv_path="../.env", override=True)

app = FastAPI(title="ResearchBuilder API")

ALLOWED_ORIGINS = [
    "https://researchbuilder.rafanovation.cloud",
    "http://localhost:3000",   # dev
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.include_router(auth_router)
app.include_router(research_router)
app.include_router(runs_router)
app.include_router(payment_router)
app.include_router(admin_router)


@app.get("/")
async def home():
    return {"message": "Welcome to ResearchBuilder API"}
