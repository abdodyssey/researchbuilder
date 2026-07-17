from database import SessionLocal
from models import ResearchJob, User
db = SessionLocal()
jobs = db.query(ResearchJob).order_by(ResearchJob.created_at.desc()).all()
print(f"Total jobs: {len(jobs)}")
for j in jobs:
    u = db.query(User).filter(User.id == j.user_id).first()
    email = u.email if u else "unknown"
    print(f"Job ID: {j.id}, User: {email}, Status: {j.status}, Step: {j.step}, PipelineID: {j.pipeline_id}, Error: {j.error}, Created At: {j.created_at}")
db.close()
