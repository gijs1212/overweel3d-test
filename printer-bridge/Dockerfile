FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN addgroup --system --gid 10001 bridge \
    && adduser --system --uid 10001 --ingroup bridge --home /app bridge \
    && mkdir -p /app /data /config/overweel3d \
    && chown -R bridge:bridge /app /data /config/overweel3d

WORKDIR /app
COPY --chown=bridge:bridge bambu_cloud_bridge.py /app/bambu_cloud_bridge.py

USER bridge
VOLUME ["/data", "/config/overweel3d"]
CMD ["python", "/app/bambu_cloud_bridge.py"]
