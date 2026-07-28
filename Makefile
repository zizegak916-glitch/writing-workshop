.PHONY: build test vet fmt-check check check-browser run-demo

build:
	go build -o writing-workshop ./cmd/writing-workshop

test:
	go test ./...

vet:
	go vet ./...

fmt-check:
	test -z "$$(gofmt -l .)"

check: fmt-check test vet build
	find web/static -name '*.js' -print0 | xargs -0 -n1 node --check
	node scripts/check-static.mjs

check-browser:
	npm run test:browser

run-demo: build
	./writing-workshop serve --demo --port 8080
