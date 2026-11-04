/**
 * One-off mongosh migration: manual/missing-source `call` events stored as
 * wall-clock-as-Z → true UTC (America/Bogota, UTC−5).
 *
 * Skips `source: 'lead_conversation'` (already true UTC).
 * Idempotent via marker `callScheduledAtEncoding: 'true_utc'`.
 *
 * Usage (dry-run — default):
 *   mongosh "$MONGODB_URI" --file scripts/migrate-manual-call-scheduled-at-to-true-utc.mongosh.js
 *
 * Apply:
 *   APPLY=1 mongosh "$MONGODB_URI" --file scripts/migrate-manual-call-scheduled-at-to-true-utc.mongosh.js
 */
const applyFlag =
  typeof process !== 'undefined' && process.env && process.env.APPLY === '1';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const MARKER = 'true_utc';

const collectionName = db.getCollectionNames().includes('ventor_schedule_events')
  ? 'ventor_schedule_events'
  : 'ventorscheduleevents';
const col = db.getCollection(collectionName);

const filter = {
  eventType: 'call',
  callScheduledAtEncoding: { $ne: MARKER },
  $or: [
    { source: { $exists: false } },
    { source: null },
    { source: 'manual' },
  ],
};

const candidates = col.find(filter).project({ _id: 1, scheduledAt: 1, source: 1 }).toArray();
printjson({
  collection: collectionName,
  dryRun: !applyFlag,
  candidateCount: candidates.length,
  sample: candidates.slice(0, 5).map((doc) => ({
    _id: doc._id,
    source: doc.source ?? null,
    before: doc.scheduledAt,
    after: doc.scheduledAt
      ? new Date(doc.scheduledAt.getTime() + BOGOTA_OFFSET_MS)
      : null,
  })),
});

if (!applyFlag) {
  print('Dry-run only. Re-run with APPLY=1 to write.');
  quit(0);
}

let updated = 0;
for (const doc of candidates) {
  if (!doc.scheduledAt) {
    continue;
  }
  const nextScheduledAt = new Date(doc.scheduledAt.getTime() + BOGOTA_OFFSET_MS);
  const result = col.updateOne(
    { _id: doc._id, callScheduledAtEncoding: { $ne: MARKER } },
    {
      $set: {
        scheduledAt: nextScheduledAt,
        callScheduledAtEncoding: MARKER,
      },
    },
  );
  updated += result.modifiedCount;
}

printjson({ applied: true, updated });
