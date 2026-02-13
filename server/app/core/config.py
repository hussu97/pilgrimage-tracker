import os

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
JWT_EXPIRE = os.environ.get("JWT_EXPIRE", "7d")
ALGORITHM = "HS256"
