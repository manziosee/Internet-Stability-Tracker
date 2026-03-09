from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    SPEED_TEST_INTERVAL: int = 300
    
    class Config:
        env_file = ".env"

settings = Settings()
