FROM python:3.12-bookworm
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pip install --no-cache-dir playwright==1.63.0 && python -m playwright install --with-deps chromium && apt-get update && apt-get install -y --no-install-recommends xvfb xdotool scrot openbox xterm && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 10001 nova
WORKDIR /app
COPY server.py start.sh ./
USER nova
ENV DISPLAY=:99
ENTRYPOINT ["sh", "/app/start.sh"]
