.PHONY: up down build test clean

# Start docker-service-flow (builds image + runs)
up:
	docker compose up -d --build

# Stop docker-service-flow
down:
	docker compose down

# Build Go binary locally (for development)
build: frontend
	go build -o bin/dsf ./cmd/dsf

# Build frontend static files
frontend:
	cd web && npm install && npm run build

# Run all tests
test:
	go test ./internal/...
	cd web && npm test

# Clean
clean:
	rm -rf bin/ web/out/ web/.next/
	-docker compose down 2>/dev/null
