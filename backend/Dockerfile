FROM golang:1.24-alpine AS builder

# Install libpcap-dev and build dependencies
RUN apk add --no-cache libpcap-dev gcc musl-dev

WORKDIR /app
# We assume go.mod/sum are in the same dir as the Dockerfile for simpler context
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o g-flow-backend ./main.go

FROM alpine:latest
# Install libpcap for the runtime
RUN apk add --no-cache libpcap
WORKDIR /app
COPY --from=builder /app/g-flow-backend .
EXPOSE 8080
# The backend will default to docker0 interface, or we can pass flags
CMD ["./g-flow-backend"]
