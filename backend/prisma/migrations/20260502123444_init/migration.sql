-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "PostPlatform" AS ENUM ('TWITTER', 'LINKEDIN', 'GENERIC');

-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('COMMITS', 'NEWS');

-- CreateEnum
CREATE TYPE "NewsSourceKind" AS ENUM ('GOOGLE_NEWS', 'TECHCRUNCH', 'HACKER_NEWS', 'REDDIT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "NewsItemStatus" AS ENUM ('NEW', 'USED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubRepoId" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "description" TEXT,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "autoSync" BOOLEAN NOT NULL DEFAULT false,
    "webhookId" BIGINT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorName" TEXT,
    "authorEmail" TEXT,
    "authoredAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "filesChanged" INTEGER NOT NULL DEFAULT 0,
    "diffPreview" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "PostKind" NOT NULL DEFAULT 'COMMITS',
    "title" TEXT,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "platform" "PostPlatform" NOT NULL DEFAULT 'GENERIC',
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "commitShas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "newsItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rangeFrom" TIMESTAMP(3),
    "rangeTo" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "assetId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GallerySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultRatio" TEXT NOT NULL DEFAULT 'INSTAGRAM_PORTRAIT',
    "marginTopPct" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "marginBottomPct" DOUBLE PRECISION NOT NULL DEFAULT 16,
    "marginLeftPct" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "marginRightPct" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "fontSize" INTEGER NOT NULL DEFAULT 48,
    "fontColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "textAlign" TEXT NOT NULL DEFAULT 'left',
    "verticalAlign" TEXT NOT NULL DEFAULT 'center',
    "bgFit" TEXT NOT NULL DEFAULT 'cover',
    "bgFillColor" TEXT NOT NULL DEFAULT '#000000',
    "defaultAssetId" TEXT,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GallerySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NewsSourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "query" TEXT,
    "subreddit" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT,
    "externalId" TEXT NOT NULL,
    "kind" "NewsSourceKind" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "author" TEXT,
    "snippet" TEXT,
    "contentHtml" TEXT,
    "publishedAt" TIMESTAMP(3),
    "status" "NewsItemStatus" NOT NULL DEFAULT 'NEW',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_githubRepoId_key" ON "Project"("githubRepoId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Commit_projectId_authoredAt_idx" ON "Commit"("projectId", "authoredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Commit_projectId_sha_key" ON "Commit"("projectId", "sha");

-- CreateIndex
CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_projectId_createdAt_idx" ON "Post"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryAsset_userId_idx" ON "GalleryAsset"("userId");

-- CreateIndex
CREATE INDEX "GalleryImage_userId_createdAt_idx" ON "GalleryImage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryImage_postId_idx" ON "GalleryImage"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "GallerySettings_userId_key" ON "GallerySettings"("userId");

-- CreateIndex
CREATE INDEX "NewsSource_userId_idx" ON "NewsSource"("userId");

-- CreateIndex
CREATE INDEX "NewsItem_userId_publishedAt_idx" ON "NewsItem"("userId", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsItem_sourceId_idx" ON "NewsItem"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_userId_externalId_key" ON "NewsItem"("userId", "externalId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commit" ADD CONSTRAINT "Commit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryAsset" ADD CONSTRAINT "GalleryAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "GalleryAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GallerySettings" ADD CONSTRAINT "GallerySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsSource" ADD CONSTRAINT "NewsSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
