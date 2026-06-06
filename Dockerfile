FROM node:22-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM golang:1.24-alpine AS backend
RUN apk add --no-cache libpcap-dev gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/out /app/web/out
RUN CGO_ENABLED=1 go build -o dsf ./cmd/dsf

FROM alpine:latest
RUN apk add --no-cache libpcap
COPY --from=backend /app/dsf /usr/local/bin/dsf
EXPOSE 3005
ENTRYPOINT ["dsf"]
