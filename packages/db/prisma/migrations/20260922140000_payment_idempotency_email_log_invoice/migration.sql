-- Payment idempotency: Stripe retries webhook deliveries, so the same charge
-- could be recorded twice. Fails loudly if duplicates already exist rather
-- than silently dropping a recorded payment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Payment"
    WHERE "stripeChargeId" IS NOT NULL
    GROUP BY "stripeChargeId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Payment.stripeChargeId rows exist; reconcile them before applying this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "Payment_stripeChargeId_key" ON "Payment"("stripeChargeId");

-- Overdue reminders dedupe per invoice, not per booking (a booking can have
-- several invoices, and the old query skipped the second one).
ALTER TABLE "EmailLog" ADD COLUMN "invoiceId" TEXT;

ALTER TABLE "EmailLog"
  ADD CONSTRAINT "EmailLog_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmailLog_invoiceId_idx" ON "EmailLog"("invoiceId");
