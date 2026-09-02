# Security Policy

## Supported Versions

We maintain security updates for the following versions of our attestation protocol:

| Version | Supported          | Notes                                    |
| ------- | ------------------ | ---------------------------------------- |
| 2.x.x   | :white_check_mark: | Current stable release                   |
| 1.x.x   | :white_check_mark: | Security patches only                    |
| < 1.0   | :x:                | No longer supported                      |

## Security Considerations

### Smart Contract Security

Our smart contracts, particularly the Stellar/Soroban implementation, follow industry best practices:

- **Authorization Framework**: We leverage Soroban's built-in authorization framework, including features like `require_auth`, to ensure all sensitive actions are properly permissioned.
- **Transaction Simulation**: We strongly recommend using Soroban's transaction simulation features to preview authorization requirements and potential outcomes before signing and submitting transactions.
- **Input Validation**: All contract inputs are thoroughly validated to prevent malicious data injection and unexpected behavior.
- **Reentrancy Protection**: Our contracts are designed to be non-reentrant, preventing common attack vectors.
- **Access Control**: We implement strict access control for critical functions, such as managing authorities and protocol settings.
- **Event Logging**: Contracts emit detailed events for all significant state changes, providing a verifiable on-chain audit trail.

### Web Application Security

Our backend services, including our Horizon indexer, are built on Node.js and Express, incorporating the following security best practices to protect our infrastructure and users:

- **Secure Headers with Helmet**: We use the `helmet` library to set various HTTP headers that help protect against common vulnerabilities like Cross-Site Scripting (XSS), clickjacking, and other injection attacks.
- **Cross-Origin Resource Sharing (CORS)**: We have a strict CORS policy configured to ensure that only authorized domains can interact with our APIs, preventing unauthorized cross-origin requests.
- **SQL Injection Prevention**: We use the Prisma ORM for all database interactions. Prisma's query builder automatically sanitizes inputs and uses parameterized queries, effectively eliminating the risk of SQL injection attacks.
- **TLS/SSL Encryption**: All web communications with our services, including the Horizon API, require HTTPS to ensure data is encrypted in transit and to prevent man-in-the-middle attacks.
- **Request Logging and Monitoring**: We use `morgan` for detailed request logging, which helps us monitor for suspicious activity, debug issues, and maintain a clear audit trail of API interactions.
- **Dependency Scanning**: We regularly scan our third-party dependencies for known vulnerabilities to ensure our application's supply chain is secure.
- **Phishing Prevention**: We will never ask for your private keys or passwords. Always verify that you are on an official domain (`attestprotocol.org`) before interacting with our services.

### Key Management

- **Secret Key Protection**: Never expose private keys in client-side code.
- **Hardware Security**: Use hardware wallets for production deployments
- **Key Rotation**: Implement regular key rotation procedures
- **Multi-signature**: Consider multi-signature setups for critical operations

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities.
2. Email your findings to: `security@attestprotocol.org`
3. Include detailed information about the vulnerability:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

### What to Expect

- **Initial Response**: You'll receive an acknowledgment within 48 hours
- **Assessment**: Our security team will assess the reported vulnerability
- **Updates**: We'll provide regular updates on the status
- **Resolution**: Once resolved, we'll coordinate disclosure with you

### Responsible Disclosure

We follow responsible disclosure practices:

- **Timeline**: We aim to resolve critical issues within 30 days
- **Credit**: Security researchers will be credited in our security advisories
- **Coordination**: We'll work with you to ensure proper disclosure timing
- **No Legal Action**: We won't take legal action against security researchers acting in good faith

## Security Best Practices for Users

### For Developers

- **Verify Contract Addresses**: Always verify our official contract addresses from our `deployments.json` file before interacting with them on-chain.
- **Use Soroban Authorization**: When interacting with our Stellar contracts, leverage Soroban's transaction simulation (`simulateTransaction`) and use SDK helpers like `authorizeEntry` to securely handle multi-party authorization.
- **Use Our Official SDKs**: Our SDKs are designed to handle many security considerations for you, providing a safer way to interact with the protocol.
- **Test on Testnet**: Thoroughly test all integrations on a testnet before deploying to mainnet.
- **Keep Dependencies Updated**: Regularly update your application's dependencies to patch known vulnerabilities.

### For End Users

- Verify the authenticity of applications before connecting wallets
- Use hardware wallets for significant transactions
- Never share private keys or seed phrases
- Verify transaction details before signing
- Use trusted networks and avoid public Wi-Fi for transactions

## Security Updates

We regularly update our security measures and will announce important security updates through:

- GitHub Security Advisories
- Our official blog
- Email notifications to registered users
- Social media channels

## Contact

For security-related questions or concerns:

- **Security Issues**: `security@attestprotocol.org`
- **General Support**: `support@attestprotocol.org`
- **Documentation**: [https://docs.attestprotocol.org](https://docs.attestprotocol.org)

---

**Note**: This security policy is a living document and will be updated as our protocol evolves. We encourage the community to stay informed about security best practices and report any concerns promptly.
