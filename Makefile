.PHONY: up down build frontend frontend-check test clean

# No outbound calls beyond the configured package registries
export NEXT_TELEMETRY_DISABLED := 1
export GOTOOLCHAIN := local

# Start docker-service-flow (builds image + runs)
up:
	docker compose up -d --build

# Stop docker-service-flow
down:
	docker compose down

# Build Go binary locally (embeds the committed web/out)
build:
	go build -o bin/dsf ./cmd/dsf

# Rebuild the committed static frontend (web/out). Run after changing web/ and
# commit the result; image builds use it so they need no npm registry.
# Builds in the pinned Node image so output is identical on any host OS
# (set NPM_REGISTRY to use a mirror).
NPM_REGISTRY ?= https://registry.npmjs.org/
frontend:
	docker build -q --target frontend-build --build-arg NPM_REGISTRY=$(NPM_REGISTRY) -t dsf-frontend-build . >/dev/null
	rm -rf web/out
	id=$$(docker create dsf-frontend-build) && docker cp -q $$id:/app/web/out web/out; status=$$?; docker rm $$id >/dev/null; exit $$status

# Fail if the committed web/out doesn't match a fresh build of web/
frontend-check: frontend
	@git diff --quiet --exit-code -- web/out && test -z "$$(git ls-files --others --exclude-standard web/out)" \
		|| (echo "web/out is out of date: run 'make frontend' and commit web/out" && exit 1)

# Run all tests
test:
	go test ./internal/...
	cd web && npm test

# Clean
clean:
	rm -rf bin/ web/.next/
	-docker compose down 2>/dev/null
