-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aliases" (
    "id" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "valueNormalized" TEXT NOT NULL,

    CONSTRAINT "aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reliability" TEXT,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "fromEntityId" UUID NOT NULL,
    "toEntityId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "confidenceRaw" JSONB,
    "confidenceScore" DOUBLE PRECISION,
    "qualifier" TEXT,
    "status" TEXT,
    "note" TEXT,
    "asOfRaw" TEXT,
    "evidence" TEXT,
    "derivation" JSONB,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_issues" (
    "id" UUID NOT NULL,
    "recordId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_externalId_key" ON "entities"("externalId");

-- CreateIndex
CREATE INDEX "entities_type_idx" ON "entities"("type");

-- CreateIndex
CREATE INDEX "entities_nameNormalized_idx" ON "entities"("nameNormalized");

-- CreateIndex
CREATE INDEX "aliases_valueNormalized_idx" ON "aliases"("valueNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "aliases_entityId_valueNormalized_key" ON "aliases"("entityId", "valueNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "sources_externalId_key" ON "sources"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_externalId_key" ON "relationships"("externalId");

-- CreateIndex
CREATE INDEX "relationships_fromEntityId_idx" ON "relationships"("fromEntityId");

-- CreateIndex
CREATE INDEX "relationships_toEntityId_idx" ON "relationships"("toEntityId");

-- CreateIndex
CREATE INDEX "relationships_type_idx" ON "relationships"("type");

-- CreateIndex
CREATE INDEX "ingestion_issues_recordId_idx" ON "ingestion_issues"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_issues_recordId_issueType_field_key" ON "ingestion_issues"("recordId", "issueType", "field");

-- AddForeignKey
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
