#!/bin/bash

# ================================================================================
# Stellar Smart Contract Deployment Script
# ================================================================================
# Automates Soroban smart contract deployment to Stellar networks.
# Features: Multi-contract support, deployment history tracking, network selection,
# clean build mode, automatic initialization, and robust error handling.
#
# Usage: ./deploy.sh [--protocol] [--network <network_name>] [--rpc-url <url>] [--network-passphrase <passphrase>] [--source <identity_name>] [--mode <default|clean>] [--initialize] [--bindings] [-h|--help]
# Configuration can be set via command-line flags or by creating an env.sh file
# in the parent directory (flags override env.sh).
# Required env.sh variables if not using flags:
#   - SOURCE_IDENTITY (for --source)
# Optional env.sh variables:
#   - RPC_URL (for --rpc-url)
#   - NETWORK_PASSPHRASE (for --network-passphrase)
#   - SOROBAN_NETWORK (for --network)
#
# Network Configuration:
#   Networks can be configured in three ways:
#   1. Use --rpc-url and --network-passphrase flags (script will auto-configure)
#   2. Pre-configure using 'stellar network add <network_name>'
#   3. Set RPC_URL and NETWORK_PASSPHRASE in env.sh
#   The script will verify network configuration before deployment.
# ================================================================================

# === Safety Settings ===
set -e   # Exit on errors (prevents partial deployments)
set -u   # Unset variables = errors (catches config issues)
set -o pipefail  # Catch pipe failures (important for cmd | tee log.txt)

# === Configuration ===
DEFAULT_NETWORK="testnet"      # Options: testnet, futurenet, mainnet
CONTRACTS_JSON_FILE="deployments.json"  # JSON: {network: {contract: {id, hash, timestamp}}}

# Debug mode - set to true to enable verbose logging including sensitive values
# Can be overridden by setting DEBUG=true in env.sh or environment
DEBUG="${DEBUG:-false}"

# --- Source env.sh for Defaults ---
# Look for env.sh in the project root (two levels up from stellar directory)
script_dir=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
ENV_FILE_PATH="${script_dir}/env.sh" # Assumes env.sh is in project root (attest.so/)

if [[ -f "$ENV_FILE_PATH" ]]; then
  echo "Sourcing configuration from ${ENV_FILE_PATH}..."
  # Use 'set -a' to export all variables defined in env.sh to the environment
  # Use 'set +a' afterward to return to normal behavior
  set -a
  # shellcheck source=../env.sh # Tells shellcheck tool where to find the sourced file
  source "$ENV_FILE_PATH"
  set +a
  echo "Sourced ${ENV_FILE_PATH}."
else
  echo "Info: ${ENV_FILE_PATH} not found. Relying on command-line flags or script defaults."
fi

# Use environment variables if set, otherwise initialize to empty/default
# Command-line flags will override these later if provided.
network_name="${SOROBAN_NETWORK:-$DEFAULT_NETWORK}" # Use SOROBAN_NETWORK from env if set
source_identity="${SOURCE_IDENTITY:-}" # Use SOURCE_IDENTITY from env if set
rpc_url="${RPC_URL:-}" # Use RPC_URL from env if set
network_passphrase="${NETWORK_PASSPHRASE:-}" # Use NETWORK_PASSPHRASE from env if set
fee_stroops="${STELLAR_FEE:-10000000}" # Default 10M stroops (1 XLM) for mainnet deployments

# Contract definitions (WASM paths relative to project root)
PROTOCOL_CONTRACT_NAME="protocol"      # Implements core business logic
PROTOCOL_WASM_PATH="target/wasm32v1-none/release/${PROTOCOL_CONTRACT_NAME}.wasm"

# === Runtime Variables ===
deploy_protocol=false    # Deploy protocol contract flag
# network_name, source_identity now initialized above from env or empty
mode="default"           # Mode: 'default' (build+deploy) or 'clean' (clean+test+build+deploy)
initialize_contracts=false # Initialize contracts after deployment flag
generate_bindings=false # Generate TypeScript bindings after deployment flag
skip_confirmation=false # Skip interactive confirmation prompt

# === Helper Functions ===

# Verify and configure network settings
# Args: network_name, rpc_url (optional), network_passphrase (optional)
# Exit: 0=success, 1=network not configured or invalid
verify_network_configuration() {
    local network="$1"
    local rpc="$2"
    local passphrase="$3"

    echo "Verifying network configuration for: ${network}"

    # If both RPC URL and passphrase are provided, configure/update the network
    if [[ -n "$rpc" && -n "$passphrase" ]]; then
        echo "Configuring network with provided RPC URL and passphrase..."

        # Check if network already exists
        local network_exists=false
        set +e
        if stellar network ls 2>&1 | grep -q "^${network}"; then
            network_exists=true
        fi
        set -e

        # Remove existing network if it exists
        if [[ "$network_exists" = true ]]; then
            echo "Removing existing network configuration..."
            set +e
            stellar network rm "$network" 2>&1
            set -e
        fi

        # Add the network with provided parameters
        echo "Adding network: ${network}"
        if [[ "$DEBUG" = "true" ]]; then
            echo "  RPC URL: ${rpc}"
            echo "  Passphrase: ${passphrase}"
        fi

        set +e
        local add_output
        add_output=$(stellar network add "$network" \
            --rpc-url "$rpc" \
            --network-passphrase "$passphrase" 2>&1)
        local add_exit=$?
        set -e

        if [[ $add_exit -ne 0 ]]; then
            echo "❌ Failed to add network configuration"
            echo "$add_output"
            return 1
        fi

        echo "✓ Network configured successfully"
        return 0
    fi

    # Otherwise, verify existing configuration
    # Try to get network configuration
    local network_check
    set +e
    network_check=$(stellar network ls 2>&1)
    local network_ls_exit=$?
    set -e

    # Check if the network exists in the configuration
    if ! echo "$network_check" | grep -q "^${network}"; then
        echo "❌ Network '${network}' is not configured in Stellar CLI"
        echo ""
        echo "To configure the network, you can either:"
        echo ""
        echo "1. Use the --rpc-url and --network-passphrase flags with this script"
        echo "2. Manually configure using stellar CLI:"
        echo ""
        echo "For testnet:"
        echo "  stellar network add testnet \\"
        echo "    --rpc-url https://soroban-testnet.stellar.org \\"
        echo "    --network-passphrase 'Test SDF Network ; September 2015'"
        echo ""
        echo "For mainnet:"
        echo "  stellar network add mainnet \\"
        echo "    --rpc-url https://mainnet.stellar.validationcloud.io/v1/<YOUR_API_KEY> \\"
        echo "    --network-passphrase 'Public Global Stellar Network ; September 2015'"
        echo ""
        echo "For futurenet:"
        echo "  stellar network add futurenet \\"
        echo "    --rpc-url https://rpc-futurenet.stellar.org \\"
        echo "    --network-passphrase 'Test SDF Future Network ; October 2022'"
        echo ""
        echo "Or add it to your Stellar CLI config at: ~/.config/soroban/networks.toml"
        echo ""
        return 1
    fi

    echo "✓ Network '${network}' is configured"

    # Get network details to verify RPC URL and passphrase
    local network_details
    set +e
    network_details=$(stellar network ls --long 2>&1 | grep "^${network}")
    set -e

    if [[ -n "$network_details" ]]; then
        echo "  Network details: ${network_details}"
    fi

    # Test the connection by trying to get the latest ledger
    # This will fail if the passphrase doesn't match the RPC URL
    echo "Testing network connection..."
    local connection_test
    set +e
    connection_test=$(stellar network container ls --network "$network" 2>&1)
    local connection_exit=$?
    set -e

    # If the connection test shows a passphrase mismatch, provide clear error
    if echo "$connection_test" | grep -q "provided network passphrase.*does not match"; then
        echo ""
        echo "❌ Network passphrase mismatch detected!"
        echo ""
        echo "Your network configuration has a passphrase that doesn't match the RPC server."
        echo "$connection_test"
        echo ""
        echo "Common causes:"
        echo "  1. Network configured with mainnet passphrase but testnet RPC URL"
        echo "  2. Network configured with testnet passphrase but mainnet RPC URL"
        echo ""
        echo "To fix this, you can either:"
        echo ""
        echo "1. Use the --rpc-url and --network-passphrase flags with this script to reconfigure"
        echo "2. Manually fix the configuration:"
        echo ""
        echo "   Remove the misconfigured network:"
        echo "   stellar network rm ${network}"
        echo ""
        echo "   Add it back with the correct configuration:"
        echo ""
        echo "   For testnet:"
        echo "   stellar network add testnet \\"
        echo "     --rpc-url https://soroban-testnet.stellar.org \\"
        echo "     --network-passphrase 'Test SDF Network ; September 2015'"
        echo ""
        echo "   For mainnet:"
        echo "   stellar network add mainnet \\"
        echo "     --rpc-url https://mainnet.stellar.validationcloud.io/v1/<YOUR_API_KEY> \\"
        echo "     --network-passphrase 'Public Global Stellar Network ; September 2015'"
        echo ""
        echo "You can also manually edit: ~/.config/soroban/network/${network}.toml"
        echo ""
        return 1
    fi

    echo "✓ Network connection successful"
    return 0
}

# Display usage info (exit: 1 = help displayed)
usage() {
  echo "Usage: $0 [--protocol] [--network <network_name>] [--rpc-url <url>] [--network-passphrase <passphrase>] [--source <identity_name>] [--fee <stroops>] [--mode <default|clean>] [--initialize] [--bindings] [--yes] [-h|--help]"
  echo ""
  echo "Builds, tests (optional), deploys, and optionally initializes Soroban contracts, storing details in ${CONTRACTS_JSON_FILE}."
  echo "Configuration defaults can be set in '${ENV_FILE_PATH}'. Command-line flags override environment settings."
  echo ""
  echo "Options:"
  echo "  --protocol                 Deploy the protocol contract."
  echo "  --network <name>           Specify the network (e.g., testnet, mainnet). Default: ${DEFAULT_NETWORK} (or from SOROBAN_NETWORK in env.sh)"
  echo "  --rpc-url <url>            RPC URL for the network. If provided with --network-passphrase, will configure/update the network."
  echo "                             (Can be set via RPC_URL in env.sh)"
  echo "  --network-passphrase <p>   Network passphrase. If provided with --rpc-url, will configure/update the network."
  echo "                             (Can be set via NETWORK_PASSPHRASE in env.sh)"
  echo "  --source <identity>        Specify the source identity for deployment and initialization. (Can be set via SOURCE_IDENTITY in env.sh)"
  echo "  --fee <stroops>            Transaction fee in stroops (1 XLM = 10,000,000 stroops). Default: 10000000 (1 XLM). (Can be set via STELLAR_FEE in env.sh)"
  echo "  --mode <mode>              Deployment mode: 'clean' (clean, test, build, deploy) or 'default' (build, deploy). Default: default"
  echo "  --initialize               Initialize deployed contracts using the source identity as admin. Default: false"
  echo "  --bindings                 Generate TypeScript bindings for deployed contracts and organize them in bindings/src/. Default: false"
  echo "  --yes, -y                  Skip confirmation prompt and proceed with deployment automatically. Default: false"
  echo "  -h, --help                 Display this help message."
  echo ""
  echo "Network Configuration:"
  echo "  You can configure networks in three ways:"
  echo "  1. Use --rpc-url and --network-passphrase flags (will auto-configure)"
  echo "  2. Pre-configure using: stellar network add <name> --rpc-url <url> --network-passphrase <passphrase>"
  echo "  3. Set RPC_URL and NETWORK_PASSPHRASE in env.sh"
  echo ""
  echo "  Examples:"
  echo "    Testnet:   --rpc-url https://soroban-testnet.stellar.org --network-passphrase 'Test SDF Network ; September 2015'"
  echo "    Mainnet:   --rpc-url https://mainnet.stellar.validationcloud.io/v1/YOUR_API_KEY --network-passphrase 'Public Global Stellar Network ; September 2015'"
  echo "    Futurenet: --rpc-url https://rpc-futurenet.stellar.org --network-passphrase 'Test SDF Future Network ; October 2022'"
  exit 1
}

# Print step header for clarity (arg: step description)
log_step() {
  echo ""
  echo "========================================"
  echo "STEP: $1"
  echo "========================================"
}

# Verify jq installation (exit: 0=available, 1=missing)
check_jq() {
  if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install jq (e.g., 'brew install jq' or 'sudo apt-get install jq')."
    exit 1
  fi
}

# Update deployment history in JSON
# Args: network, contract_name, contract_id(C...), tx_hash(64-hex), timestamp(ISO-8601)
# Exit: 0=success, 1=JSON error
update_contracts_json() {
    local network=$1
    local contract_name=$2
    local contract_id=$3
    local tx_hash=$4
    local deploy_timestamp=$5

    # Use mktemp for secure temporary file creation (prevents symlink attacks)
    local tmp_json_file
    tmp_json_file=$(mktemp) || {
        echo "Error: Failed to create secure temporary file."
        exit 1
    }

    # Ensure cleanup of temp file on function exit (success or failure)
    trap 'rm -f "$tmp_json_file"' RETURN

    echo "Updating ${CONTRACTS_JSON_FILE} for network '${network}' with ${contract_name} details..."

    # Read existing JSON or initialize.
    # This ensures we don't overwrite unrelated data if the file already exists.
    local current_json
    if [[ -f "$CONTRACTS_JSON_FILE" ]]; then
        current_json=$(cat "$CONTRACTS_JSON_FILE")
    else
        current_json="{}"
    fi

    # Create the contract data JSON snippet using jq.
    # Using jq -n ensures correct JSON formatting even with special characters.
    local contract_data
    contract_data=$(jq -n \
      --arg id "$contract_id" \
      --arg hash "$tx_hash" \
      --arg ts "$deploy_timestamp" \
      '{id: $id, hash: $hash, timestamp: $ts}')

    # Use jq to merge the new contract data into the existing JSON.
    # This is safer and more robust than string manipulation.
    # The filter '.[$net] |= (if . == null then {} else . end) | .[$net][$name] = $data'
    # ensures the network level exists before adding/updating the contract.
    # stderr is captured to provide better error messages if jq fails.
    jq_stderr=$(echo "$current_json" | jq \
        --arg net "$network" \
        --arg name "$contract_name" \
        --argjson data "$contract_data" \
        '.[$net] |= (if . == null then {} else . end) | .[$net][$name] = $data' \
        > "$tmp_json_file" 2>&1)
    local jq_exit_code=$?

    # Check jq's exit code explicitly.
    if [[ $jq_exit_code -ne 0 ]]; then
      echo "Error: Failed to update JSON using jq (Exit Code: $jq_exit_code)."
      echo "jq stderr: $jq_stderr"
      if [[ -f "$tmp_json_file" ]]; then rm -f "$tmp_json_file"; fi
      exit 1
    fi

    # Verify the temp file content includes the new ID before moving.
    # This is a safety check against unexpected jq behavior.
    if grep -q "$contract_id" "$tmp_json_file"; then
        true # Placeholder for successful grep
    else
        echo "Error: Temp file $tmp_json_file does NOT contain the new contract ID $contract_id!"
        cat "$tmp_json_file"
        rm -f "$tmp_json_file"
        exit 1
    fi

    # Atomically replace the old file with the new one using mv.
    # The -f flag ensures overwriting if the target exists.
    mv -f "$tmp_json_file" "$CONTRACTS_JSON_FILE"
    local mv_exit_code=$?

    # Check if the move was successful.
    if [[ $mv_exit_code -ne 0 ]]; then
        echo "Error: Failed to move $tmp_json_file to $CONTRACTS_JSON_FILE (Exit Code: $mv_exit_code)."
        if [[ -f "$tmp_json_file" ]]; then rm -f "$tmp_json_file"; fi # Clean up if move failed
        exit 1
    fi

    echo "${CONTRACTS_JSON_FILE} updated successfully."
}

# Extract deployment info from CLI output
# Args: raw_output, network, contract_name
# Sets deployment in JSON, Exit: 0=success, 1=invalid ID
extract_deployment_details() {
    local deploy_output="$1"
    local network="$2"
    local contract_name="$3"

    # Extract transaction hash from output
    local tx_hash=$(echo "$deploy_output" | grep "Transaction hash is" | awk '{print $NF}')

    # Extract contract ID from URL
    local contract_id=$(echo "$deploy_output" | grep "stellar.expert/explorer/.*/contract/" | sed -E 's|.*contract/([A-Z0-9]+).*|\1|')

    # Create timestamp
    local deploy_timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

    # Validate contract ID format (should start with C and have 55 more characters)
    if [[ ! "$contract_id" =~ ^C[A-Z0-9]{55}$ ]]; then
        echo "Error: Could not extract valid contract ID from output."
        echo "Raw output contained: $deploy_output"
        return 1
    fi

    # Validate transaction hash (should be 64 hex characters)
    if [[ -z "$tx_hash" || ${#tx_hash} -ne 64 ]]; then
        echo "Warning: Could not reliably extract transaction hash. Using empty value."
        tx_hash=""
    fi

    echo "Extracted contract ID: $contract_id"
    echo "Extracted tx hash: $tx_hash"
    echo "Timestamp: $deploy_timestamp"

    # Update JSON with extracted details
    update_contracts_json "$network" "$contract_name" "$contract_id" "$tx_hash" "$deploy_timestamp"
}

# === Bindings Generation Functions ===
# Generate TypeScript bindings for a single contract
# Args: contract_name, contract_id, temp_bindings_dir
# Creates organized bindings in bindings/src/
# Exit: 0=success, 1=failure
generate_single_contract_bindings() {
    local contract_name="$1"
    local contract_id="$2"
    local temp_bindings_dir="$3"
    
    if [[ -z "$contract_id" ]]; then
        echo "Error: Cannot generate bindings for ${contract_name} - no contract ID available."
        return 1
    fi
    
    echo "Generating TypeScript bindings for ${contract_name} contract..."
    echo "Contract ID: ${contract_id}"
    
    local contract_temp_dir="${temp_bindings_dir}/${contract_name}"
    
    # Generate bindings using stellar CLI
    echo "Generating bindings to temporary directory: ${contract_temp_dir}"
    stellar contract bindings typescript \
        --network "$network_name" \
        --contract-id "$contract_id" \
        --output-dir "$contract_temp_dir"
    
    local bindings_exit_code=$?
    if [[ $bindings_exit_code -ne 0 ]]; then
        echo "Error: Failed to generate TypeScript bindings for ${contract_name} (Exit Code: $bindings_exit_code)."
        return 1
    fi
    
    # Create target bindings directory structure
    local target_bindings_dir="bindings/src"
    mkdir -p "$target_bindings_dir"
    
    # Move and organize the generated files
    local src_index="${contract_temp_dir}/src/index.ts"
    local src_readme="${contract_temp_dir}/README.md"
    local target_ts="${target_bindings_dir}/${contract_name}.ts"
    local target_md="${target_bindings_dir}/${contract_name}.md"
    
    if [[ -f "$src_index" ]]; then
        echo "Moving TypeScript bindings: ${src_index} -> ${target_ts}"
        mv "$src_index" "$target_ts"
    else
        echo "Warning: Expected TypeScript file not found at ${src_index}"
    fi
    
    if [[ -f "$src_readme" ]]; then
        echo "Moving README: ${src_readme} -> ${target_md}"
        mv "$src_readme" "$target_md"
    else
        echo "Warning: Expected README file not found at ${src_readme}"
    fi
    
    echo "TypeScript bindings for ${contract_name} generated successfully."
    echo "  TypeScript file: ${target_ts}"
    echo "  Documentation: ${target_md}"
    
    return 0
}

# Cleanup function for temporary bindings directory
cleanup_bindings_temp() {
    local temp_dir="$1"
    if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
        echo "Cleaning up temporary bindings directory: ${temp_dir}"
        rm -rf "$temp_dir"
    fi
}

# === Command Line Processing ===
# Parse arguments - these will override any values sourced from env.sh
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --protocol)
      deploy_protocol=true
      shift # past argument
      ;;
    --network)
      network_name="$2" # Override value from env if flag is used
      shift # past argument
      shift # past value
      ;;
    --rpc-url)
      rpc_url="$2" # Override value from env if flag is used
      shift # past argument
      shift # past value
      ;;
    --network-passphrase)
      network_passphrase="$2" # Override value from env if flag is used
      shift # past argument
      shift # past value
      ;;
    --source)
      source_identity="$2" # Override value from env if flag is used
      shift # past argument
      shift # past value
      ;;
    --fee)
      fee_stroops="$2" # Override value from env if flag is used
      shift # past argument
      shift # past value
      ;;
    --mode)
      mode="$2"
      if [[ "$mode" != "default" && "$mode" != "clean" ]]; then
        echo "Error: Invalid mode '$mode'. Use 'default' or 'clean'."
        usage
      fi
      shift # past argument
      shift # past value
      ;;
    --initialize)
      initialize_contracts=true
      shift # past argument
      ;;
    --bindings)
      generate_bindings=true
      shift # past argument
      ;;
    --yes|-y)
      skip_confirmation=true
      shift # past argument
      ;;
    -h|--help)
      usage
      ;;
    *) # unknown option
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# Apply defaults only if BOTH env var and flag were missing
# Network default is handled above using SOROBAN_NETWORK or DEFAULT_NETWORK
if [[ -z "$source_identity" ]]; then
  echo "Error: Source identity not provided. Set SOURCE_IDENTITY in ${ENV_FILE_PATH} or use the --source flag."
  usage
fi

# === Validation ===
check_jq  # Ensure required tools exist

# Validate that both RPC URL and passphrase are provided together (if either is provided)
if [[ -n "$rpc_url" && -z "$network_passphrase" ]]; then
    echo "Error: --rpc-url provided without --network-passphrase. Both are required for network configuration."
    usage
fi
if [[ -z "$rpc_url" && -n "$network_passphrase" ]]; then
    echo "Error: --network-passphrase provided without --rpc-url. Both are required for network configuration."
    usage
fi

# Verify network configuration before deployment
verify_network_configuration "$network_name" "$rpc_url" "$network_passphrase"
if [[ $? -ne 0 ]]; then
    echo ""
    echo "Error: Network configuration validation failed. Please configure the network and try again."
    exit 1
fi

# Prevent accidental empty runs
if [[ "$deploy_protocol" = false ]]; then
  echo "Error: No contracts specified for deployment. Use --protocol."
  usage
fi

# Confirm deployment settings to prevent accidents
echo "Selected Network: ${network_name}"
if [[ "$DEBUG" = "true" && -n "$rpc_url" && -n "$network_passphrase" ]]; then
    echo "RPC URL: ${rpc_url}"
    echo "Network Passphrase: ${network_passphrase}"
fi
echo "Deployment Identity: ${source_identity}"
echo "Mode: ${mode}"
echo "Deploy Protocol: ${deploy_protocol}"
echo "Initialize Contracts: ${initialize_contracts}"
echo "Generate Bindings: ${generate_bindings}"
echo "Contracts JSON: ${CONTRACTS_JSON_FILE}"
echo ""

# Skip confirmation if --yes flag is provided
if [[ "$skip_confirmation" = true ]]; then
  echo "Skipping confirmation (--yes flag provided)"
  echo ""
else
  read -p "Proceed with deployment? (y/N): " confirm && [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]] || exit 1
  echo ""
fi

# === Directory Setup ===
# Ensure correct path resolution - already done above script_dir
cd "$script_dir"
echo "Changed directory to: $(pwd)"

# Clear any existing Stellar/Soroban environment variables that might interfere
# These can override the network configuration and cause unexpected behavior
if [[ -n "${SOROBAN_RPC_URL:-}" ]]; then
    echo "Warning: Unsetting conflicting SOROBAN_RPC_URL environment variable: ${SOROBAN_RPC_URL}"
    unset SOROBAN_RPC_URL
fi

# Export network passphrase if provided (needed for stellar CLI commands)
if [[ -n "$network_passphrase" ]]; then
    export STELLAR_NETWORK_PASSPHRASE="$network_passphrase"
    echo "Exported STELLAR_NETWORK_PASSPHRASE for deployment commands"
fi

# Export RPC URL if provided (takes precedence over network config)
if [[ -n "$rpc_url" ]]; then
    export SOROBAN_RPC_URL="$rpc_url"
    echo "Exported SOROBAN_RPC_URL for deployment commands: $rpc_url"
fi

# Export fee if provided
if [[ -n "$fee_stroops" ]]; then
    export STELLAR_FEE="$fee_stroops"
    echo "Using transaction fee: $fee_stroops stroops ($(echo "scale=7; $fee_stroops / 10000000" | bc) XLM)"
fi

# === Build Process ===
# Clean build + test if requested
if [[ "$mode" == "clean" ]]; then
  log_step "Running Cargo Clean"
  cargo clean
  echo "Clean completed."

  log_step "Running Tests"
  cargo test --workspace
  echo "Tests completed."
else
    log_step "Skipping Clean and Test (Mode: default)"
fi

# Build contracts to WASM format
log_step "Building Contracts"
stellar contract build
echo "Build completed."

# === Contract Deployment Function ===
# Deploy contract and process deployment info
# Args: contract_name, wasm_path
# Sets: DEPLOYED_CONTRACT_ID, DEPLOYED_TX_HASH
# Exit: 0=success, 1=failure
deploy_contract() {
  local contract_name=$1
  local wasm_path=$2
  # These will be set globally
  DEPLOYED_CONTRACT_ID="" # Reset before deployment attempt
  DEPLOYED_TX_HASH="" # Reset before deployment attempt

  log_step "Deploying ${contract_name} Contract"
  echo "Deploying ${wasm_path}..."

  # Create a temporary file securely using mktemp.
  local temp_output
  temp_output=$(mktemp)
  if [[ -z "$temp_output" ]]; then
      echo "Error: Failed to create temporary file."
      return 1
  fi

  # Run the deploy command.
  # Redirect stderr (2) to stdout (1) BEFORE piping (|) to `tee`.
  # This is necessary because `stellar contract deploy` prints essential info
  # (like tx hash) to stderr, and the pipe only captures stdout by default.
  # `tee` writes the combined output to the temporary file AND the console.
  stellar contract deploy --wasm "${wasm_path}" --source "${source_identity}" --network "${network_name}" 2>&1 | tee "$temp_output"
  # Check the exit status of the `stellar` command (the first command in the pipe)
  # using PIPESTATUS[0], because `$?` would give the exit status of `tee`.
  local deploy_exit_code=${PIPESTATUS[0]}

  # Check if the deployment command itself failed.
  if [[ $deploy_exit_code -ne 0 ]]; then
      echo "Error: Deployment command failed for ${contract_name} (Exit Code: $deploy_exit_code)."
      cat "$temp_output" # Show output on error
      rm "$temp_output"
      return 1 # Return non-zero status
  fi

  # Read the full captured output (stdout + stderr) from the temp file.
  local deploy_output
  deploy_output=$(cat "$temp_output")
  rm "$temp_output" # Clean up temp file immediately after use.

  # Extract transaction hash using grep and awk.
  # Assumes specific output format from `stellar contract deploy`.
  local tx_hash=$(echo "$deploy_output" | grep "Transaction hash is" | awk '{print $NF}')

  # Extract contract ID using grep and sed with a regex.
  # Assumes specific output format from `stellar contract deploy`.
  local contract_id=$(echo "$deploy_output" | grep "stellar.expert/explorer/.*/contract/" | sed -E 's|.*contract/([A-Z0-9]+).*|\1|')

  # Get current UTC timestamp.
  local deploy_timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

  # Validate extracted contract ID format using regex.
  # Provides robustness against unexpected output changes.
  if [[ ! "$contract_id" =~ ^C[A-Z0-9]{55}$ ]]; then
      echo "Error: Failed to extract valid contract ID for ${contract_name}."
      echo "Extracted ID: '$contract_id' from output:"
      echo "$deploy_output"
      return 1 # Return non-zero status
  fi

  # Validate extracted transaction hash format (basic length check).
  if [[ -z "$tx_hash" || ${#tx_hash} -ne 64 ]]; then
      echo "Warning: Could not reliably extract transaction hash for ${contract_name}. Storing empty hash."
      tx_hash=""
  fi

  # Display extracted details
  echo "${contract_name} Contract ID: ${contract_id}"
  echo "${contract_name} Tx Hash: ${tx_hash:-Not Found}"
  echo "${contract_name} Timestamp: ${deploy_timestamp}"

  # Call the internal function to update the JSON file
  update_contracts_json "$network_name" "$contract_name" "$contract_id" "$tx_hash" "$deploy_timestamp"
  local update_exit_code=$?
  if [[ $update_exit_code -ne 0 ]]; then
      echo "Error: update_contracts_json failed for ${contract_name} (Exit Code: $update_exit_code)."
      return 1 # Propagate failure
  fi

  # Set global variables used by the summary section and initialization
  DEPLOYED_CONTRACT_ID="$contract_id"
  DEPLOYED_TX_HASH="$tx_hash"

  return 0 # Indicate success
}


# === Contract Initialization Function ===
# Initialize a deployed contract
# Args: contract_name, contract_id, admin_address
# Uses global: source_identity, network_name
# Exit: 0=success, 1=failure
initialize_contract() {
    local contract_name="$1"
    local contract_id="$2"
    local admin_address="$3"

    log_step "Initializing ${contract_name} Contract (${contract_id})"

    local invoke_cmd_full=(
        stellar contract invoke
        --id "$contract_id"
        --source "$source_identity" # Use the source identity for the invoke call
        --network "$network_name"
        --
        initialize
        --admin "$admin_address" # The public address derived from source_identity
    )

    echo "Running command: ${invoke_cmd_full[*]}"

    # Execute the command, capturing output and exit status
    local init_output
    local init_exit_code
    init_output=$("${invoke_cmd_full[@]}" 2>&1)
    init_exit_code=$?

    if [[ $init_exit_code -ne 0 ]]; then
        echo "Error: Initialization failed for ${contract_name} (Exit Code: $init_exit_code)."
        echo "Output:"
        echo "$init_output"
        return 1
    else
        echo "${contract_name} initialization successful."
        # Optionally show relevant output parts if needed
        echo "Output:"
        echo "$init_output" | tail -n 5 # Show last few lines
    fi

    return 0
}

# === Deployment Execution ===
# Allow deployment to attempt even if it fails
set +e

# Initialize tracking variables
DEPLOYED_CONTRACT_ID="" # Used by deploy_contract
DEPLOYED_TX_HASH="" # Used by deploy_contract
protocol_contract_id=""
protocol_tx_hash=""

# Deploy Protocol if requested
if [[ "$deploy_protocol" = true ]]; then
  deploy_contract "$PROTOCOL_CONTRACT_NAME" "$PROTOCOL_WASM_PATH"
  if [[ $? -eq 0 ]]; then
    protocol_contract_id="$DEPLOYED_CONTRACT_ID"
    protocol_tx_hash="$DEPLOYED_TX_HASH"
  else
    echo "ERROR: Protocol contract deployment failed. Summary might be incomplete."
  fi
fi

# Resume strict error checking
set -e

# === Contract Initialization ===
# Initialize contracts if requested and successfully deployed
if [[ "$initialize_contracts" = true ]]; then
    log_step "Starting Contract Initialization"

    # Get admin address from source identity
    echo "Fetching admin address for source identity: ${source_identity}"
    ADMIN_ADDRESS=""
    set +e # Temporarily disable exit on error for the command
    ADMIN_ADDRESS=$(stellar keys address "${source_identity}" 2>&1)
    keys_exit_code=$?
    set -e # Re-enable exit on error

    if [[ $keys_exit_code -ne 0 ]]; then
        echo "Error: Failed to get address for source identity '${source_identity}' (Exit Code: $keys_exit_code)."
        echo "Output: $ADMIN_ADDRESS"
        echo "Skipping initialization."
        initialize_contracts=false # Prevent further attempts
    elif [[ ! "$ADMIN_ADDRESS" =~ ^G[A-Z0-9]{55}$ ]]; then
         echo "Error: Invalid address format received for source identity '${source_identity}'."
         echo "Received: '$ADMIN_ADDRESS'"
         echo "Skipping initialization."
         initialize_contracts=false # Prevent further attempts
    else
        echo "Using Admin Address: ${ADMIN_ADDRESS}"
    fi

    # Initialize Protocol Contract
    if [[ "$initialize_contracts" = true && "$deploy_protocol" = true && -n "$protocol_contract_id" ]]; then
        set +e # Allow initialization failure without stopping the script
        initialize_contract "$PROTOCOL_CONTRACT_NAME" "$protocol_contract_id" "$ADMIN_ADDRESS"
         if [[ $? -ne 0 ]]; then
             echo "WARNING: Protocol contract initialization failed. Check logs."
        fi
        set -e
    elif [[ "$initialize_contracts" = true && "$deploy_protocol" = true && -z "$protocol_contract_id" ]]; then
         echo "Skipping Protocol initialization: Deployment failed or ID not found."
    fi

fi

# === TypeScript Bindings Generation ===
# Generate bindings if requested and contracts were successfully deployed
if [[ "$generate_bindings" = true ]]; then
    log_step "Starting TypeScript Bindings Generation"

    # Create temporary bindings directory
    TEMP_BINDINGS_DIR=".bindings"
    
    # Set up cleanup trap to ensure temp directory is removed even if script exits unexpectedly
    trap "cleanup_bindings_temp '$TEMP_BINDINGS_DIR'" EXIT INT TERM
    
    # Clean and create temporary directory
    rm -rf "$TEMP_BINDINGS_DIR"
    mkdir -p "$TEMP_BINDINGS_DIR"
    echo "Created temporary bindings directory: ${TEMP_BINDINGS_DIR}"

    # Generate Protocol Bindings
    if [[ "$deploy_protocol" = true && -n "$protocol_contract_id" ]]; then
        set +e # Allow bindings generation failure without stopping the script
        generate_single_contract_bindings "$PROTOCOL_CONTRACT_NAME" "$protocol_contract_id" "$TEMP_BINDINGS_DIR"
        if [[ $? -ne 0 ]]; then
             echo "WARNING: Protocol contract bindings generation failed. Check logs."
        fi
        set -e
    elif [[ "$generate_bindings" = true && "$deploy_protocol" = true && -z "$protocol_contract_id" ]]; then
         echo "Skipping Protocol bindings generation: Deployment failed or ID not found."
    fi

    # Clean up temporary directory
    cleanup_bindings_temp "$TEMP_BINDINGS_DIR"
    
    # Remove the trap since we've cleaned up successfully
    trap - EXIT INT TERM

fi

# === Summary ===
# Display deployment results with explorer links
log_step "Deployment Summary"
echo "Network: ${network_name}"
echo "Mode: ${mode}"
if [[ "$deploy_protocol" = true && -n "$protocol_contract_id" ]]; then
  echo "Protocol Contract ID: ${protocol_contract_id}"
  echo "Protocol Tx Hash: ${protocol_tx_hash:-Not Found}"
  if [[ -n "$protocol_tx_hash" ]]; then
    echo "Protocol Tx URL: https://stellar.expert/explorer/${network_name}/tx/${protocol_tx_hash}"
  fi
fi
echo "Contract details saved to ${CONTRACTS_JSON_FILE}"
if [[ "$generate_bindings" = true ]]; then
  echo "TypeScript bindings organized in bindings/src/"
fi
echo "Deployment script finished successfully."

exit 0 