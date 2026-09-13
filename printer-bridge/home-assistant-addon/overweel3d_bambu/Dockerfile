FROM python:3.12-alpine

ARG BUILD_ARCH
ARG BUILD_VERSION

LABEL \
    io.hass.name="Overweel3D Bambu Bridge" \
    io.hass.description="Leest Bambu Cloud-status en stuurt deze naar Overweel3D" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="app" \
    io.hass.version="${BUILD_VERSION}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
RUN apk add --no-cache iputils && mkdir -p /config/overweel3d
COPY bambu_cloud_bridge.py /app/bambu_cloud_bridge.py

CMD ["python", "/app/bambu_cloud_bridge.py"]
