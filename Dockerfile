FROM golang:1.24-alpine AS backend
RUN apk add --no-cache libpcap-dev gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Frontend is pre-built on the host (`make frontend`) because it depends on the
# sibling react-sequence-kit checkout, which is outside the build context.
COPY web/out /app/web/out
RUN CGO_ENABLED=1 go build -o dsf ./cmd/dsf

FROM alpine:latest
RUN apk add --no-cache libpcap
COPY --from=backend /app/dsf /usr/local/bin/dsf
EXPOSE 3005
ENTRYPOINT ["dsf"]
