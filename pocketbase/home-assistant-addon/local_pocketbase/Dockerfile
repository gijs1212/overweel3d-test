FROM alpine:3.22

ARG BUILD_ARCH
ARG PB_VERSION=0.40.4

RUN apk add --no-cache ca-certificates tzdata unzip wget \
    && case "${BUILD_ARCH}" in \
      amd64) PB_ARCH="amd64" ;; \
      aarch64) PB_ARCH="arm64" ;; \
      armv7) PB_ARCH="armv7" ;; \
      *) echo "Niet-ondersteunde architectuur: ${BUILD_ARCH}" >&2; exit 1 ;; \
    esac \
    && mkdir -p /opt/pocketbase \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pocketbase.zip \
    && unzip /tmp/pocketbase.zip -d /opt/pocketbase \
    && chmod +x /opt/pocketbase/pocketbase \
    && rm /tmp/pocketbase.zip

COPY pb_hooks /opt/overweel3d-default-hooks
COPY pb_migrations /opt/overweel3d-default-migrations
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8090
CMD ["/run.sh"]
