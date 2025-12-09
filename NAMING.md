# Naming Convention

This document outlines the standardized naming conventions for structuring a multi-platform monorepo that supports various blockchain platforms, including Solana, Starknet, Cosmos, Stellar, and Aptos. These naming conventions are designed to ensure clarity, modularity, and scalability while avoiding redundancy and verbosity in file paths.

### 1. **Root Directory Structure**

The root directory structure of the monorepo organizes the different components of the project into logical sections. This includes the `apps/`, `contracts/`, `packages/`, and `examples/` directories.

- **`apps/`**: Contains application-level projects including documentation and blockchain indexers.
- **`contracts/`**: Contains the smart contract implementations, divided by blockchain platforms.
- **`packages/`**: Contains reusable libraries, SDKs, CLI tools, and shared logic across platforms.
- **`examples/`**: Contains example applications, integrations, and testing scenarios.

```bash
ROOT/
├── apps/                 # Application-level projects
│   ├── docs/            # Documentation site (Mintlify)
│   └── horizon/         # Stellar blockchain indexer
├── contracts/            # Smart contract implementations
│   ├── stellar/         # Soroban contracts
│   ├── solana/          # Anchor contracts
│   ├── starknet/        # Cairo contracts
│   ├── sui/             # Move contracts (Sui)
│   └── aptos/           # Move contracts (Aptos)
├── packages/             # Reusable libraries and SDKs
│   ├── sdk/             # Unified SDK
│   ├── stellar-sdk/     # Stellar SDK
│   ├── solana-sdk/      # Solana SDK
│   ├── starknet-sdk/    # Starknet SDK
│   ├── cli/             # CLI tool
│   └── core/            # Core abstractions
├── examples/             # Example implementations
├── README.md
├── NAMING.md
├── CLAUDE.md
├── pnpm-workspace.yaml
├── package.json
└── LICENSE
```

### 2. **Contracts Directory Structure**

Within the `contracts/` directory, each blockchain platform has its own subdirectory. This directory contains the smart contract implementations for the core components of the attestation protocol.

For our Stellar implementation, the structure is organized as follows:

- **`authority/`**: Manages the registration, verification, and resolution of attestation authorities.
- **`protocol/`**: Contains the core logic for creating, revoking, and managing attestations.
- **`resolvers/`**: Provides on-chain mechanisms for resolving schemas and attestations.

This modular structure is tailored for the Soroban environment and is our primary implementation. Other blockchain platforms should follow a similar modular approach, although the specific directory names may vary based on the platform's architecture.

#### Stellar Contracts Structure Example

```bash
contracts/
|-- stellar/
|   |-- authority/
|   |-- protocol/
|   |-- resolvers/
|   |-- Cargo.toml
|   |-- README.md
|-- solana/
|   |-- programs/
|   |   |-- attestation-service/
|   |   |-- resolver/
|   |   |-- schema-registry/
|   |-- Anchor.toml
|-- starknet/
|   |-- ...
```

### 3. **Naming Conventions**

#### a. **Platform-Specific Directory Names**

Each blockchain platform (e.g., Stellar, Solana, Starknet) will have its own subdirectory inside the `contracts/` directory. The name of this subdirectory will be the platform's name in lowercase (e.g., `stellar/`, `solana/`).

#### b. **Protocol-Specific Directory Names**

Inside each platform-specific directory, use **concise, descriptive names** for the different components of the protocol. Avoid repeating the platform name, as the context is already provided by the parent directory.

For our Stellar implementation, we use:

- `authority/`
- `protocol/`
- `resolvers/`

This avoids redundancy. For example, instead of `stellar-authority/`, we just use `authority/` inside the `stellar/` directory.

#### Example (Stellar):

```bash
contracts/stellar/
|-- authority/
|-- protocol/
|-- resolvers/
```

By eliminating platform prefixes, we reduce file path verbosity and keep the structure clean and readable.

### 4. **Packages for Shared and Specialized Logic**

The `packages/` directory is used for shared logic, SDKs, and reusable modules.

- **`sdk/`**: A multi-chain TypeScript SDK providing a unified interface for interacting with the attestation protocol on any supported blockchain.
- **`stellar-sdk/`**: A specialized package containing utilities, types, and helpers specifically for interacting with the Stellar/Soroban implementation. This allows for more granular control and access to Stellar-specific features.
- **`solana-sdk/`**: Solana-specific SDK implementation for interacting with Anchor-based contracts.
- **`starknet-sdk/`**: Starknet-specific SDK implementation for interacting with Cairo contracts.
- **`cli/`**: A unified command-line interface for all supported chains.
- **`core/`**: Core SDK abstractions shared across all chain-specific implementations.

#### Packages Structure Example:

```bash
packages/
|-- sdk/           # Unified multi-chain SDK
|-- stellar-sdk/   # Stellar-specific SDK
|-- solana-sdk/    # Solana-specific SDK
|-- starknet-sdk/  # Starknet-specific SDK
|-- cli/           # Command-line interface
|-- core/          # Core abstractions
```

### 5. **Redundant Naming: Pitfall & Solution**

Redundant naming patterns occur when platform-specific prefixes (e.g., `stellar-`) are used in both the directory and subdirectory names. For example, `stellar/stellar-protocol/` repeats the platform name unnecessarily.

#### **Solution:**

To avoid this:

- **Do not prefix subdirectories** inside a platform-specific directory with the platform name.
- **Use concise, protocol-specific names** (e.g., `authority/`, `protocol/`) inside the platform directory.

#### Example of Avoiding Redundancy:

Instead of this redundant structure:

```bash
contracts/
|-- stellar/
|   |-- stellar-authority/
|   |-- stellar-protocol/
|   |-- stellar-resolvers/
```

Use this simplified, non-redundant structure:

```bash
contracts/
|-- stellar/
|   |-- authority/
|   |-- protocol/
|   |-- resolvers/
```

### 6. **Cross-Platform Consistency**

While each blockchain platform has unique architectural patterns, we strive for conceptual consistency. The core components of `authority`, `protocol`, and `resolvers` found in our Stellar implementation should have logical equivalents on other platforms, even if the directory names differ.

- **Maintain conceptual consistency**: The core ideas of authority management, attestation logic, and resolution should be present across all platforms.
- **Adapt to platform conventions**: Use naming conventions and structures that are idiomatic for each specific blockchain (e.g., `programs/` for Solana/Anchor).

#### Example:

```bash
contracts/
|-- stellar/
|   |-- authority/
|   |-- protocol/
|   |-- resolvers/
|-- solana/
|   |-- programs/
|   |   |-- attestation-service/  # Conceptual equivalent of protocol/
|   |   |-- resolver/             # Conceptual equivalent of resolvers/
|   |   |-- schema-registry/
|-- starknet/
|   |-- ... # Follow Starknet conventions
```

### 7. **Versioning and Package Management**

For version control, ensure that changes in shared packages (e.g., `sdk/`, `stellar-sdk/`) are properly versioned. We use **pnpm workspaces** and **changesets** to manage dependencies and publish updates.

- **Use semantic versioning**: Follow `major.minor.patch` for all package updates.
- **Isolate builds**: Our CI/CD pipeline is configured to run tests and builds specific to the packages that have changed, ensuring that updates to our Stellar contracts don't trigger unnecessary builds for Solana.

### Conclusion

This naming convention, centered around our production-ready Stellar implementation, is designed to provide a clear, scalable, and non-redundant structure for our multi-chain monorepo. By following these guidelines, contributors can maintain consistency and easily navigate the project as it evolves.

#### Key Points:

- **Stellar as the blueprint**: Our Stellar contract structure (`authority/`, `protocol/`, `resolvers/`) serves as the primary example of our modular approach.
- **Avoid platform prefixes** inside platform-specific directories to reduce redundancy.
- **Keep directory names concise** and consistent.
- **Use the `packages/` directory for shared and specialized SDKs** and utilities.
- **Maintain version consistency** with `pnpm` and `changesets`.

Contributors should adhere to these conventions to ensure a well-organized and scalable project structure.
