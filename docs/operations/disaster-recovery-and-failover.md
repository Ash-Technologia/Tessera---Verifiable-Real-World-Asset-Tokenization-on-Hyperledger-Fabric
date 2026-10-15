# Operations Runbook: TESSERA Disaster Recovery & Multi-Org Consensus Failover

**Audience**: Network Operators, DevOps Engineers, Security Administrators  
**Last Updated**: October 2026  
**Classification**: Operational Standard Operating Procedure (SOP)  

---

## 1. High-Availability & Disaster Recovery Objectives

- **Recovery Point Objective (RPO)**: 0 blocks (Hyperledger Fabric Raft consensus guarantees zero data loss across committed blocks).
- **Recovery Time Objective (RTO)**: < 15 minutes for orderer leader re-election; < 30 minutes for peer node state rebuild from block 0.
- **Minimum Quorum for Raft Consensus**: $\lfloor N/2 \rfloor + 1$ active orderer nodes (e.g. 3 of 5 nodes).

---

## 2. Raft Consensus Quorum Loss & Recovery

### Symptoms
- Backend API returns `503 Service Unavailable` or `ENDORSEMENT_POLICY_FAILURE`.
- Peer logs display: `Orderer connection failed: context deadline exceeded`.
- Fabric gateway fails on `submitTransaction` with `No Raft leader found`.

### Resolution Workflow

#### Step 1: Diagnose Orderer Cluster Health
```bash
# Query active raft cluster status across orderer nodes
docker exec -it orderer1.tessera.network osnadmin channel list \
  --channelID rwa-channel \
  --ca-file /var/hyperledger/orderer/tls/ca.crt \
  --client-cert /var/hyperledger/orderer/tls/server.crt \
  --client-key /var/hyperledger/orderer/tls/server.key
```

#### Step 2: Restart Degraded Orderer Containers
```bash
# Gracefully cycle individual orderer nodes one by one
docker-compose -f docker/docker-compose-orderers.yml restart orderer2.tessera.network
docker-compose -f docker/docker-compose-orderers.yml logs --tail 100 -f orderer2.tessera.network
```

#### Step 3: Emergency Quorum Override (If majority of nodes are lost)
If 3 of 5 orderers suffer catastrophic storage loss:
1. Stop all surviving orderer nodes.
2. Edit channel configuration block to remove non-responsive consenter nodes.
3. Sign the update envelope with the required admin MSP identities:
```bash
peer channel update -f emergency_quorum_update.pb -c rwa-channel -o orderer1.tessera.network:7050 --tls --cafile $ORDERER_CA
```
4. Restart the orderer cluster with the new consenters set.

---

## 3. Peer Node Ledger Corruption & Snapshot Rebuild

If a peer's CouchDB world state or LevelDB block storage becomes corrupt:

1. **Halt Corrupted Peer**:
   ```bash
   docker stop peer0.verifier.tessera.network
   ```
2. **Remove Local State Volumes**:
   ```bash
   docker volume rm tessera_peer0_verifier_data
   docker volume rm tessera_peer0_verifier_couchdb_data
   ```
3. **Re-provision Clean Peer Container**:
   ```bash
   docker-compose -f docker/docker-compose-verifier.yml up -d peer0.verifier.tessera.network
   ```
4. **Channel Re-join & Automatic Block Sync**:
   The peer will rejoin `rwa-channel` using its enrolled crypto identity and sync all blocks sequentially from block 0 from neighboring peers via the gossip protocol.

---

## 4. Zero-Downtime TLS & MSP Certificate Renewal

All X.509 cryptographic identities (Orderer, Peer, Client) expire every 365 days.

### Routine Renewal Procedure (T - 30 Days)

1. **Generate New Certificate Keypair via Fabric CA**:
   ```bash
   fabric-ca-client reenroll -u https://admin:adminpw@ca.issuer.tessera.network:7054 \
     --tls.certfiles /etc/hyperledger/fabric-ca/tls-cert.pem \
     --mspdir /var/hyperledger/crypto/issuer/msp
   ```
2. **Submit Channel Config Update with Dual-Root Validity**:
   - Add new Root CA certificate alongside the expiring certificate in the channel MSP configuration.
   - Await consortium endorsement from `IssuerMSP`, `VerifierMSP`, `ComplianceMSP`.
3. **Rolling Peer Restart**:
   - Update node certificates on disk.
   - Restart peers sequentially ensuring at least 1 peer per MSP remains live.
4. **Remove Expired CA**:
   - Once all nodes report the new certificates, submit a second channel config update removing the old Root CA.

---

## 5. MinIO Evidence Storage Backup & Restoration

The off-chain evidence repository stores PDF titles, inspection lab reports, and valuation appraisals.

### Continuous Mirroring
```bash
# Hourly sync from primary MinIO cluster to secondary backup bucket
mc mirror --overwrite --remove primary-minio/tessera-evidence backup-minio/tessera-evidence-cold
```

### Hash Verification Check
To ensure zero bit-rot or off-chain tampering across all anchored documents:
```bash
# Execute evidence audit integrity check against on-chain SHA-256 hashes
node backend/scripts/audit-evidence-integrity.js --channel rwa-channel
```
Any mismatch triggers an instant security alert and marks the associated Asset Passport with `EVIDENCE_INTEGRITY_TAMPERED`.
