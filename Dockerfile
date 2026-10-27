# Every external source is overridable so the image can be built behind a
# package mirror (e.g. Nexus) with no direct internet access:
#   BASE_REGISTRY  prefix for base images, e.g. "nexus.example.gov:8082/" (trailing slash)
#   NPM_REGISTRY   npm registry URL
#   GOPROXY        Go module proxy URL
#   GOSUMDB        checksum DB; set to "off" if unreachable (go.sum is still verified)
#   ALPINE_MIRROR  replaces https://dl-cdn.alpinelinux.org/alpine in apk repositories
ARG BASE_REGISTRY=

FROM ${BASE_REGISTRY}node:22.22.3-alpine3.22 AS frontend
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --no-audit --no-fund
COPY web/ .
RUN npm run build

FROM ${BASE_REGISTRY}golang:1.24.13-alpine3.22 AS backend
ARG ALPINE_MIRROR=
ARG GOPROXY=https://proxy.golang.org,direct
ARG GOSUMDB=sum.golang.org
ENV GOTOOLCHAIN=local GOPROXY=${GOPROXY} GOSUMDB=${GOSUMDB}
RUN if [ -n "$ALPINE_MIRROR" ]; then sed -i -E "s|https?://dl-cdn.alpinelinux.org/alpine|$ALPINE_MIRROR|" /etc/apk/repositories; fi \
    && apk add --no-cache libpcap-dev gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/out /app/web/out
RUN CGO_ENABLED=1 go build -o dsf ./cmd/dsf

FROM ${BASE_REGISTRY}alpine:3.22.7
ARG ALPINE_MIRROR=
RUN if [ -n "$ALPINE_MIRROR" ]; then sed -i -E "s|https?://dl-cdn.alpinelinux.org/alpine|$ALPINE_MIRROR|" /etc/apk/repositories; fi \
    && apk add --no-cache libpcap
COPY --from=backend /app/dsf /usr/local/bin/dsf
EXPOSE 3005
ENTRYPOINT ["dsf"]
