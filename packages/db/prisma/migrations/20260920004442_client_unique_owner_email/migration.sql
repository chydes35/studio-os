-- CreateIndex
CREATE UNIQUE INDEX "Client_ownerId_email_key" ON "Client"("ownerId", "email");
