# Security Specification — FrancoDroid FLL Analytics

## 1. Data Invariants
1. Every document in `/rounds/{roundId}` and `/aiTraining/{ruleId}` belongs strictly to one authenticated, email-verified user (`ownerId == request.auth.uid`).
2. Every document ID matches `^[a-zA-Z0-9_\-]+$` (max 128 chars) and matches `incoming().id`.
3. `ownerId` and `createdAt` are immutable after creation; `createdAt` (on create) and `updatedAt` (on create/update) must equal `request.time`.
4. All strings and arrays enforce strict `.size()` bounds; `missionResults` is capped at 20 entries and validated as a list of maps.
5. `list` queries explicitly enforce `resource.data.ownerId == request.auth.uid` at the rule level.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write**: `auth == null` reading `/rounds/round_1` -> Denied.
2. **Unverified email write**: `auth.token.email_verified == false` creating `/rounds/round_1` -> Denied.
3. **Identity spoofing**: User A creates `/rounds/r1` with `ownerId: "userB"` -> Denied.
4. **Shadow/ghost field injection**: User A creates `/rounds/r1` with extra `isAdmin: true` -> Denied (`hasOnly`).
5. **Path ID mismatch**: Creating `/rounds/r1` with body `id: "r2"` -> Denied.
6. **Path ID poisoning**: Creating `/rounds/../../users/x` or >128-char ID -> Denied (`isValidId`).
7. **Timestamp forgery**: Creating `/aiTraining/t1` with client `createdAt` instead of `request.time` -> Denied.
8. **Immutable field mutation**: Updating `/rounds/r1` to change `ownerId` or `createdAt` -> Denied.
9. **Resource exhaustion (DoW)**: Sending `notes` > 2500 chars or `snapshotBase64` > 360000 chars -> Denied.
10. **Array flooding**: Sending `missionResults` with 25 items or non-map first element -> Denied.
11. **Cross-user list scraping**: User B querying `/aiTraining` without filtering `ownerId == userB` -> Denied.
12. **Cross-user delete**: User B attempting `delete` on `/rounds/userA_round` -> Denied.
