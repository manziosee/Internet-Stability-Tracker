import uvicorn

if __name__ == "__main__":
    # The scheduler is started inside app.main lifespan — don't start it twice.
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
