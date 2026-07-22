.PHONY: build test vet check run-demo

build:
	go build -o writing-workshop ./cmd/writing-workshop

test:
	go test ./...

vet:
	go vet ./...

check: test vet build
	find web/static -name '*.js' -print0 | xargs -0 -n1 node --check

run-demo: build
	./writing-workshop serve --demo --port 8080
