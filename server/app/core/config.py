import os

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
JWT_EXPIRE = int(os.environ.get("JWT_EXPIRE", "10080"))  # 7 days in minutes (7*24*60)
ALGORITHM = "HS256"
