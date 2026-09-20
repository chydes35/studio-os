-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "amountCents" INTEGER NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_ownerId_idx" ON "Expense"("ownerId");

-- CreateIndex
CREATE INDEX "Expense_bookingId_idx" ON "Expense"("bookingId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
