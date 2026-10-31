/**
 * One-off mongosh backfill for ventor mine visibility.
 *
 * Usage:
 *   mongosh "$MONGODB_URI" --file scripts/backfill-ventor-mine-visibility.mongosh.js
 *
 * 1) Sets ventorMineVisibilityDays=45 on potential-buyer steps missing the field
 *    (preserves prior hardcoded 45-day mine window).
 * 2) For customers with assignedTo and empty/missing assignedDate, sets
 *    assignedDate from the latest CustomerAssignmentChangeLog.createdAt (or now).
 */
const stepsResult = db.customer_steps.updateMany(
  {
    isPotentialBuyer: true,
    $or: [
      { ventorMineVisibilityDays: { $exists: false } },
      { ventorMineVisibilityDays: null },
    ],
  },
  { $set: { ventorMineVisibilityDays: 45 } },
);
printjson({ potentialBuyerStepsUpdated: stepsResult.modifiedCount });

const customers = db.customers
  .find({
    assignedTo: { $exists: true, $nin: [null, ''] },
    $or: [
      { assignedDate: { $exists: false } },
      { assignedDate: null },
      { assignedDate: '' },
    ],
  })
  .project({ _id: 1 })
  .toArray();

let assignedDateUpdated = 0;
const nowIso = new Date().toISOString();
for (const customer of customers) {
  const latestLog = db.customerassignmentchangelogs
    .find({ customerId: customer._id })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray()[0];
  const assignedDate =
    latestLog && latestLog.createdAt
      ? new Date(latestLog.createdAt).toISOString()
      : nowIso;
  const updateResult = db.customers.updateOne(
    { _id: customer._id },
    { $set: { assignedDate } },
  );
  assignedDateUpdated += updateResult.modifiedCount;
}
printjson({
  customersMissingAssignedDate: customers.length,
  assignedDateUpdated,
});
