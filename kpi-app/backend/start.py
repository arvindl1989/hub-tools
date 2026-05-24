import os
import uvicorn

port = int(os.environ.get("PORT", 8080))
print(f"Starting on PORT={port}", flush=True)

uvicorn.run(
    "main:app",
    host="0.0.0.0",
    port=port,
    proxy_headers=True,
    forwarded_allow_ips="*",
    log_level="info",
)
