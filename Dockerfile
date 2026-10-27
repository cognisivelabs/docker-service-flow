# Every external source is overridable so the image can be built behind a
# package mirror (e.g. Nexus) with no direct internet access:
#   BASE_REGISTRY  prefix for base images, e.g. "nexus.example.gov:8082/" (trailing slash)
#   ALPINE_MIRROR  replaces https://dl-cdn.alpinelinux.org/alpine in apk repositories
# Go modules are vendored (vendor/), so no Go module proxy is needed.
#
# FRONTEND picks where the static frontend comes from:
#   prebuilt  (default) the committed web/out; needs no Node.js or npm registry
#   build     compile from source in a Node image; also uses NPM_REGISTRY
ARG BASE_REGISTRY=
ARG FRONTEND=prebuilt

FROM ${BASE_REGISTRY}node:22.22.3-alpine3.22 AS frontend-build
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --no-audit --no-fund
COPY web/ .
RUN rm -rf out && npm run build

FROM scratch AS frontend-prebuilt
COPY web/out /app/web/out

# Only the selected stage is built, so "prebuilt" never pulls the Node image.
FROM frontend-${FRONTEND} AS frontend

FROM ${BASE_REGISTRY}golang:1.24.13-alpine3.22 AS backend
ARG ALPINE_MIRROR=
ENV GOTOOLCHAIN=local GOFLAGS=-mod=vendor GOPROXY=off
RUN if [ -n "$ALPINE_MIRROR" ]; then sed -i -E "s|https?://dl-cdn.alpinelinux.org/alpine|$ALPINE_MIRROR|" /etc/apk/repositories; fi \
    && apk add --no-cache libpcap-dev gcc musl-dev
WORKDIR /app
COPY . .
COPY --from=frontend /app/web/out /app/web/out
# No network: the build may only use vendored modules.
RUN --network=none CGO_ENABLED=1 go build -o dsf ./cmd/dsf

FROM ${BASE_REGISTRY}alpine:3.22.7
ARG ALPINE_MIRROR=
RUN if [ -n "$ALPINE_MIRROR" ]; then sed -i -E "s|https?://dl-cdn.alpinelinux.org/alpine|$ALPINE_MIRROR|" /etc/apk/repositories; fi \
    && apk add --no-cache libpcap
COPY --from=backend /app/dsf /usr/local/bin/dsf
EXPOSE 3005
ENTRYPOINT ["dsf"]
