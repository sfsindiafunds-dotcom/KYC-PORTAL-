# Security Specification: Mutual Fund Distributor Client Lifecycle & KYC System

## 1. System Invariants & Privacy Principles
1. **Client Isolation**: Client user `X` can NEVER read, query, update, or overwrite any document belonging to client `Y`.
2. **Admin Authority**: Only authenticated distributor administrators (`sfsindiafunds@gmail.com` or verified members of `/admins/{adminId}`) can read all client records, audit logs, and distributor invitations.
3. **Identity Immutability**: On document update, `userId` cannot be modified to spoof another user.
4. **Consent-Before-Collection**: Clients must provide explicit informed consent (`consentObtained == true`) before their KYC personal information is formally processed.
5. **No Blanket Reads**: No query delegation to clients. `allow list` evaluates `resource.data.userId == request.auth.uid` or admin privilege.
6. **Aadhaar Privacy**: Only masked Aadhaar (last 4 digits) is permitted. Full 12-digit Aadhaar storage is disallowed.
7. **Audit Trail**: Every significant compliance action (status change, export, verification) generates an audit entry.

## 2. The "Dirty Dozen" Payloads (Designed to Attack Identity, Integrity, and State)
1. **Unauthenticated Read on /clients/{id}**: Unauthenticated attacker attempts `get /clients/client_abc`. -> EXPECT: PERMISSION_DENIED.
2. **Cross-Tenant Client Read**: Authenticated client `User_A` attempts to read `/clients/User_B`. -> EXPECT: PERMISSION_DENIED.
3. **Cross-Tenant Client List Query**: Authenticated client `User_A` runs `collection('clients').get()` without owner filter. -> EXPECT: PERMISSION_DENIED.
4. **Self-Escalation to Admin**: Authenticated client writes to `/admins/{theirUid}` to grant themselves distributor privileges. -> EXPECT: PERMISSION_DENIED.
5. **Spoofed Admin Email**: Non-verified token with email `sfsindiafunds@gmail.com` (`email_verified == false`) attempts admin read. -> EXPECT: PERMISSION_DENIED.
6. **Arbitrary Status Override by Client**: Client directly patches `{ status: "verified" }` on their profile. -> EXPECT: PERMISSION_DENIED.
7. **Identity Hijacking on Update**: Client attempts to update their client profile changing `userId: "other_victim_uid"`. -> EXPECT: PERMISSION_DENIED.
8. **Shadow Field Injection**: Attacker attempts to inject `{ isSuperuser: true, bypassKyc: true }` into `/clients/{uid}`. -> EXPECT: PERMISSION_DENIED.
9. **Junk/Oversized Document ID Injection**: Attacker writes to `/clients/` with a 4KB malicious path key. -> EXPECT: PERMISSION_DENIED.
10. **Client Reading Audit Logs**: Authenticated client attempts to read `/auditLogs/log_123`. -> EXPECT: PERMISSION_DENIED.
11. **Client Reading Unrelated Invitations**: Authenticated client attempts to list `/invitations`. -> EXPECT: PERMISSION_DENIED.
12. **Malicious Admin Remarks Tampering**: Client attempts to erase or change `adminRemarks` set by distributor. -> EXPECT: PERMISSION_DENIED.
