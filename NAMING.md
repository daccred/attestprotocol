# Naming Convention

This document outlines the standardized naming conventions for structuring the monorepo. These naming conventions are designed to ensure clarity, modularity, and scalability while avoiding redundancy and verbosity in file paths.

### 1. **Root Directory Structure**

The root directory structure of the monorepo organizes the different components of the project into logical sections. This includes the `apps/`, `contracts/`, `packages/`, and `examples/` directories.

- **`apps/`**: Contains application-level projects including documentation and blockchain indexers.
- **`contracts/`**: Contains the smart contract implementations.
- **`packages/`**: Contains reusable libraries, SDKs, CLI tools, and shared logic.
- **`examples/`**: Contains example applications, integrations, and testing scenarios.

```bash
ROOT/
├── apps/                 # Application-level projects
│   ├── docs/            # Documentation site (Mintlify)
│   └── horizon/         # Stellar blockchain indexer
├── contracts/            # Smart contract implementations
│   └── stellar/         # Soroban contracts
├── packages/             # Reusable libraries and SDKs
│   ├── sdk/             # Unified SDK
│   ├── stellar-sdk/     # Stellar SDK
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

Within the `contracts/` directory, the Stellar platform has its own subdirectory containing the smart contract implementations for the core components of the attestation protocol.

The structure is organized as follows:

- **`protocol/`**: Contains the core logic for creating, revoking, and managing attestations.
- **`resolvers/`**: Provides on-chain mechanisms for resolving schemas and attestations.

This modular structure is tailored for the Soroban environment.

#### Stellar Contracts Structure Example

```bash
contracts/
|-- stellar/
|   |-- protocol/
|   |-- resolvers/
|   |-- Cargo.toml
|   |-- README.md
```

### 3. **Naming Conventions**

#### a. **Protocol-Specific Directory Names**

Inside the platform directory, use **concise, descriptive names** for the different components of the protocol. Avoid repeating the platform name, as the context is already provided by the parent directory.

For our Stellar implementation, we use:

- `protocol/`
- `resolvers/`

This avoids redundancy. For example, instead of `stellar-protocol/`, we just use `protocol/` inside the `stellar/` directory.

#### Example (Stellar):

```bash
contracts/stellar/
|-- protocol/
|-- resolvers/
```

By eliminating platform prefixes, we reduce file path verbosity and keep the structure clean and readable.

### 4. **Packages for Shared and Specialized Logic**

The `packages/` directory is used for shared logic, SDKs, and reusable modules.

- **`sdk/`**: A TypeScript SDK providing a unified interface for interacting with the attestation protocol. Re-exports from stellar-sdk and core.
- **`stellar-sdk/`**: A specialized package containing utilities, types, and helpers specifically for interacting with the Stellar/Soroban implementation. This allows for more granular control and access to Stellar-specific features.
- **`cli/`**: A command-line interface for Stellar.
- **`core/`**: Core SDK abstractions shared across implementations.

#### Packages Structure Example:

```bash
packages/
|-- sdk/           # Unified SDK
|-- stellar-sdk/   # Stellar-specific SDK
|-- cli/           # Command-line interface
|-- core/          # Core abstractions
```

### 5. **Redundant Naming: Pitfall & Solution**

Redundant naming patterns occur when platform-specific prefixes (e.g., `stellar-`) are used in both the directory and subdirectory names. For example, `stellar/stellar-protocol/` repeats the platform name unnecessarily.

#### **Solution:**

To avoid this:

- **Do not prefix subdirectories** inside a platform-specific directory with the platform name.
- **Use concise, protocol-specific names** (e.g., `protocol/`) inside the platform directory.

#### Example of Avoiding Redundancy:

Instead of this redundant structure:

```bash
contracts/
|-- stellar/
|   |-- stellar-protocol/
|   |-- stellar-resolvers/
```

Use this simplified, non-redundant structure:

```bash
contracts/
|-- stellar/
|   |-- protocol/
|   |-- resolvers/
```

### 6. **Versioning and Package Management**

For version control, ensure that changes in shared packages (e.g., `sdk/`, `stellar-sdk/`) are properly versioned. We use **pnpm workspaces** and **changesets** to manage dependencies and publish updates.

- **Use semantic versioning**: Follow `major.minor.patch` for all package updates.
- **Isolate builds**: Our CI/CD pipeline is configured to run tests and builds specific to the packages that have changed.

### Conclusion

This naming convention, centered around our Stellar implementation, is designed to provide a clear, scalable, and non-redundant structure for our monorepo. By following these guidelines, contributors can maintain consistency and easily navigate the project as it evolves.

#### Key Points:

- **Stellar as the primary implementation**: Our Stellar contract structure (`protocol/`, `resolvers/`) serves as the primary example of our modular approach.
- **Avoid platform prefixes** inside platform-specific directories to reduce redundancy.
- **Keep directory names concise** and consistent.
- **Use the `packages/` directory for shared and specialized SDKs** and utilities.
- **Maintain version consistency** with `pnpm` and `changesets`.

Contributors should adhere to these conventions to ensure a well-organized and scalable project structure.
