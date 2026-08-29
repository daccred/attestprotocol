# Convenience Makefile for the `resolvers` crate
#
# Usage examples:
#   make test
#   make build
#   make deploy-default IDENTITY=drew NETWORK=testnet
#
# Variables you can override:
#   TARGET  (default: wasm32v1-none)
#   PROFILE (default: release)
#   CARGO_TARGET_DIR (defaults to workspace: ../.. or ../../stellar depending on layout)

CRATE := resolvers
TARGET ?= wasm32v1-none
PROFILE ?= release
DIST := dist
# Default to the actual workspace artifacts path
CARGO_TARGET_DIR ?= ../../stellar/target
WASM := $(CARGO_TARGET_DIR)/$(TARGET)/$(PROFILE)/$(CRATE).wasm

.PHONY: help
help:
	@echo "Available targets:"
	@echo "  test                 - Run tests for the resolvers crate"
	@echo "  clean                - Clean build artifacts"
	@echo "  build                - Build DefaultResolver Wasm"
	@echo "  deploy-default       - Deploy DefaultResolver (requires IDENTITY, NETWORK)"
	@echo "\nVariables: TARGET=$(TARGET), PROFILE=$(PROFILE), CARGO_TARGET_DIR=$(CARGO_TARGET_DIR)"

.PHONY: test
test:
	cargo test -q

.PHONY: clean
clean:
	cargo clean
	@rm -rf $(DIST)

$(DIST):
	@mkdir -p $(DIST)

# DefaultResolver is the only resolver with a feature-gated export.
.PHONY: build
build: $(DIST)
	stellar contract build --package resolvers --features export-default-resolver
	cp "$(WASM)" "$(DIST)/$(CRATE)-default.wasm"
	@echo "Built: $(DIST)/$(CRATE)-default.wasm"

# Deploy helper (requires Stellar CLI). Provide IDENTITY and NETWORK.
# Example: make deploy-default IDENTITY=drew NETWORK=testnet

REQ_VARS = \
	if [ -z "$(IDENTITY)" ]; then echo "Set IDENTITY=<your_identity>"; exit 1; fi; \
	if [ -z "$(NETWORK)" ]; then echo "Set NETWORK=<testnet|mainnet>"; exit 1; fi

.PHONY: deploy-default
deploy-default: build
	@$(REQ_VARS)
	stellar contract deploy \
		--wasm "$(DIST)/$(CRATE)-default.wasm" \
		--source "$(IDENTITY)" \
		--network "$(NETWORK)"
