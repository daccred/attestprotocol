# Mainnet Schema Import Scripts

This directory contains mainnet-specific versions of schema import and attestation creation scripts for the AttestProtocol on Stellar.

## ⚠️ CRITICAL WARNINGS

- **MAINNET OPERATIONS**: These scripts interact with Stellar mainnet and will spend **real XLM**
- **IRREVERSIBLE TRANSACTIONS**: All operations create permanent on-chain records
- **PRODUCTION DATA**: Only use with production-ready schemas and verified attestation data
- **SECRET KEY SECURITY**: Never commit secret keys or share them in logs

## Prerequisites

Before using these scripts, ensure you have:

1. **Funded Stellar Mainnet Account**
   - Sufficient XLM balance for transaction fees
   - Account must be activated (minimum 1 XLM reserve)
   - Recommended balance: 50+ XLM for schema registration operations

2. **Environment Setup**
   ```bash
   # Install dependencies from monorepo root
   pnpm install

   # Ensure TypeScript compilation works
   pnpm build
   ```

3. **Database Connection** (for writeSchemaEntries.ts)
   - MongoDB connection configured in `apps/horizon/src/common/db.ts`
   - Database must be accessible from your environment

4. **Secret Key**
   - ED25519 secret key starting with 'S' (e.g., `SABCDEF123...`)
   - Must have authority registration on mainnet (100 XLM fee paid)
   - Keep secure and never commit to version control

## Mainnet Contract Addresses

These scripts use the official mainnet deployments:

| Contract | Address |
|----------|---------|
| **Protocol v2** | `<MAINNET_V2_ID>` — becomes current once the mainnet v2 deployment lands |
| **Protocol v1 (current)** | `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI` |
| **RPC URL** | `https://soroban-rpc.mainnet.stellar.gateway.fm` |
| **Network Passphrase** | `Public Global Stellar Network ; September 2015` |

## Scripts Overview

### 1. importSchema.ts

Registers attestation schemas on Stellar mainnet.

**Purpose**: Create schema definitions that structure attestation data formats.

**Categories Available**:
- `identity` - Identity verification schemas (passport, national ID, etc.)
- `education` - Academic credentials and certifications
- `professional` - Professional licenses and competencies
- `technology` - Code signing, security, and infrastructure
- `civic` - Voter eligibility and public service
- `institutional` - Accreditation and governance
- `financial` - Credit, compliance, and financial audits
- `ai` - AI model provenance, safety, and training data

**Usage**:
```bash
# From apps/horizon/scripts directory
npx ts-node mainnet/importSchema.ts <category> --secret=SXXXXXXX

# Example: Register all identity schemas
npx ts-node mainnet/importSchema.ts identity --secret=SABCDEF123...

# Register all schemas across all categories
npx ts-node mainnet/importSchema.ts all --secret=SABCDEF123...
```

**Output**:
- Creates JSONL files: `schemas-<category>.jsonl` in the mainnet directory
- Each line contains: `{"name": "schemaName", "uid": "hex_uid", "category": "category"}`
- Schema UIDs are deterministic based on schema name and structure

**Cost Estimation**:
- ~0.01-0.05 XLM per schema registration (network dependent)
- 9 Identity schemas ≈ 0.09-0.45 XLM
- All ~55 schemas ≈ 0.55-2.75 XLM

### 2. writeSchemaEntries.ts

Creates sample attestations for registered schemas and updates database metadata.

**Purpose**: Populate mainnet with example attestations and enrich database with schema categories.

**Usage**:
```bash
# From apps/horizon/scripts directory
npx ts-node mainnet/writeSchemaEntries.ts --secret=SXXXXXXX

# Example
npx ts-node mainnet/writeSchemaEntries.ts --secret=SABCDEF123...
```

**Behavior**:
- Reads all `schemas-*.jsonl` files from the mainnet directory
- Creates one attestation per schema with realistic sample data
- Updates MongoDB database with schema category metadata
- 2-second delay between operations to respect rate limits

**Output**:
- On-chain attestations with sample data for each schema
- Database records updated with category and type fields
- Console summary showing processed schemas, attestations, and errors

**Cost Estimation**:
- ~0.01-0.05 XLM per attestation
- Processing all ~55 schemas ≈ 0.55-2.75 XLM

## Complete Workflow Example

### Step 1: Verify Account Balance

```bash
# Check your account balance on Stellar Expert
open "https://stellar.expert/explorer/public/account/GYOUR_PUBLIC_KEY"

# Ensure you have at least 50 XLM available
```

### Step 2: Register Schemas by Category

```bash
# Start with identity schemas (9 schemas)
npx ts-node mainnet/importSchema.ts identity --secret=SABCDEF123...

# Continue with other categories as needed
npx ts-node mainnet/importSchema.ts education --secret=SABCDEF123...
npx ts-node mainnet/importSchema.ts financial --secret=SABCDEF123...

# Or register all at once (recommended for fresh deployments)
npx ts-node mainnet/importSchema.ts all --secret=SABCDEF123...
```

**Expected Output**:
```
🚀 Mainnet Schema Import Starting...
🔑 Using existing keypair: GYOUR_PUBLIC_KEY
⚠️  MAINNET MODE - Real XLM will be spent!

📚 Category: identity
📝 Total Schemas: 9

[1/9] Registering: nationalIdSchema
✅ Schema registered with UID: abc123...
⏱️  Waiting 3 seconds...

[2/9] Registering: passportSchema
✅ Schema registered with UID: def456...
...

✅ Successfully registered 9 schemas for identity
💾 Saved output to: schemas-identity.jsonl
```

### Step 3: Create Sample Attestations

```bash
# After schemas are registered, create attestations
npx ts-node mainnet/writeSchemaEntries.ts --secret=SABCDEF123...
```

**Expected Output**:
```
🚀 Starting MAINNET Schema Attestation Processing...

🔑 Using existing keypair: GYOUR_PUBLIC_KEY
⚠️  MAINNET MODE - Real XLM will be spent!

📋 Found 8 schema files to process:
  • schemas-identity.jsonl
  • schemas-education.jsonl
  ...

📂 Processing category: identity
📄 File: schemas-identity.jsonl
📊 Found 9 schemas in identity category

[1/9] Processing: nationalIdSchema
📝 Creating attestation for schema: nationalIdSchema
✅ Attestation created for nationalIdSchema with UID: 789abc...
✅ Updated schema abc123... with category: identity
⏱️  Waiting 2 seconds before next schema...
...

============================================================
📊 MAINNET PROCESSING SUMMARY
============================================================

🎯 TOTALS
============================================================
📊 Total Schemas Processed: 55
📝 Total Attestations Created: 55
💾 Total DB Updates: 55
❌ Total Errors: 0
💰 Account Used: GYOUR_PUBLIC_KEY

🎉 All schemas processed successfully on MAINNET!
```

## Troubleshooting

### Error: "Secret key is required for mainnet operations"

**Solution**: Ensure you're passing the secret key argument correctly:
```bash
npx ts-node mainnet/importSchema.ts identity --secret=SABCDEF123...
```

### Error: "Account not found" or "Insufficient balance"

**Causes**:
- Account doesn't exist on mainnet
- Insufficient XLM balance for operations

**Solutions**:
1. Verify account exists: `https://stellar.expert/explorer/public/account/YOUR_PUBLIC_KEY`
2. Send XLM to your account from an exchange or another wallet
3. Ensure minimum 50 XLM balance before starting

### Error: "Authority not registered"

**Cause**: Your account hasn't paid the 100 XLM authority registration fee.

**Solution**:
1. Register as an authority first using the Authority Contract
2. Visit the AttestProtocol documentation for authority registration
3. Payment is one-time per account

### Error: "Transaction timeout" or "Network error"

**Causes**:
- Network congestion
- RPC endpoint temporarily unavailable
- Rate limiting

**Solutions**:
1. Wait a few minutes and retry
2. Increase timeout in script configuration
3. Check Stellar status: `https://status.stellar.org`
4. Use alternative RPC endpoint if available

### Error: "Schema already exists"

**Cause**: Schema with the same name and structure is already registered.

**Solution**: This is not an error - schemas are deterministic. You can safely proceed with creating attestations using the existing schema UID.

### Database Connection Issues

**Error**: "Database connection not available"

**Solution**:
1. Verify MongoDB is running and accessible
2. Check connection string in `apps/horizon/src/common/db.ts`
3. Ensure network access to database from your environment
4. Verify database credentials are correct

## Security Best Practices

1. **Secret Key Management**
   - Store secret keys in environment variables or secure vaults
   - Never commit secret keys to git
   - Use different keys for testnet and mainnet
   - Rotate keys periodically

2. **Verification Before Execution**
   - Double-check you're targeting mainnet intentionally
   - Review schema definitions before registration
   - Test on testnet first with identical scripts
   - Verify account balance before bulk operations

3. **Monitoring**
   - Watch transactions on Stellar Expert during execution
   - Monitor account balance for unexpected drainage
   - Set up alerts for large XLM movements
   - Keep logs of all mainnet operations

4. **Rate Limiting**
   - Scripts include 2-3 second delays between operations
   - Don't modify delays without understanding rate limits
   - Stellar RPC endpoints may throttle excessive requests

## Differences from Testnet Scripts

| Aspect | Testnet | Mainnet |
|--------|---------|---------|
| **Contract ID** | `CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD` (v2) | `<MAINNET_V2_ID>` (v2, pending deployment) |
| **RPC URL** | `https://soroban-testnet.stellar.org` | `https://soroban-rpc.mainnet.stellar.gateway.fm` |
| **Network** | Testnet | Public mainnet |
| **Friendbot** | Automated funding available | Not available |
| **Wallet Creation** | Generates random keypairs | Requires existing funded wallet |
| **XLM Cost** | Free testnet XLM | Real XLM with monetary value |
| **Data Permanence** | Testnet resets periodically | Permanent production data |
| **allowHttp** | `true` (lenient) | `false` (security enforced) |

## File Outputs

After running scripts, you'll find these files in the mainnet directory:

```
mainnet/
├── README.md                      # This file
├── importSchema.ts                # Schema registration script
├── writeSchemaEntries.ts          # Attestation creation script
├── schemas-identity.jsonl         # Identity schema UIDs (generated)
├── schemas-education.jsonl        # Education schema UIDs (generated)
├── schemas-professional.jsonl     # Professional schema UIDs (generated)
├── schemas-technology.jsonl       # Technology schema UIDs (generated)
├── schemas-civic.jsonl            # Civic schema UIDs (generated)
├── schemas-institutional.jsonl    # Institutional schema UIDs (generated)
├── schemas-financial.jsonl        # Financial schema UIDs (generated)
└── schemas-ai.jsonl              # AI/ML schema UIDs (generated)
```

## Support & Resources

- **Documentation**: [https://docs.attestprotocol.com](https://docs.attestprotocol.com)
- **Discord**: [https://discord.com/invite/7kVur5ja5m](https://discord.com/invite/7kVur5ja5m)
- **GitHub**: [https://github.com/daccred/attest.so](https://github.com/daccred/attest.so)
- **Stellar Expert**: [https://stellar.expert/explorer/public](https://stellar.expert/explorer/public)

## Additional Notes

### Schema Categories Reference

Each category contains domain-specific attestation schemas:

- **Identity** (9 schemas): National ID, passport, driver's license, biometric auth, age verification, trust scores, background checks, MFA
- **Education** (8 schemas): Degrees (Bachelor's, Master's, PhD), certifications, skill badges, courses, language proficiency, transcripts
- **Professional** (4 schemas): Professional licenses, industry certifications, competency assessments, employee IDs
- **Technology** (8 schemas): Code signing, SBOM, hardware attestation, API security, vulnerability assessments, OAuth, SLA, content provenance
- **Civic** (2 schemas): Voter eligibility, public service verification
- **Institutional** (4 schemas): Accreditation, governance audits, partnerships, service quality
- **Financial** (10 schemas): Credit assessments, AML monitoring, investment advisors, insurance, cross-border payments, ESG reporting, audits, compliance
- **AI** (12 schemas): Model training, AI safety, bias audits, generated content, agent capabilities, interpretability, consent, data quality, deepfake detection, agent permissions

### Cost Optimization

To minimize mainnet costs during testing:

1. **Register Selectively**: Start with one category instead of "all"
   ```bash
   npx ts-node mainnet/importSchema.ts identity --secret=SXXX
   ```

2. **Test Small Batches**: Create attestations for a subset of schemas
   - Manually edit JSONL files to include only needed schemas
   - Run writeSchemaEntries.ts on the reduced set

3. **Monitor Gas Prices**: Stellar fees are dynamic; run during low-traffic periods

4. **Batch Operations**: The scripts already batch operations with delays, don't run multiple instances simultaneously

### Maintenance

- **Schema Updates**: If schemas need updates, you must create new schemas with different names (schemas are immutable)
- **Re-running Scripts**: Safe to re-run importSchema.ts (will skip existing schemas)
- **Database Sync**: writeSchemaEntries.ts can be re-run to update database categories without creating duplicate attestations (check script logic)

## Version History

- **v1.0** (November 2025): Initial mainnet scripts with secret key arguments
  - Mainnet Protocol Contract: `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI` (now the v1 entry of the registry)

---

**Remember**: Mainnet operations are permanent and cost real XLM. Always test thoroughly on testnet first!
