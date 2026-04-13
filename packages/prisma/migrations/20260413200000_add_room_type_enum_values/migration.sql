-- Add new RoomType enum values for room wizard support
ALTER TYPE "RoomType" ADD VALUE IF NOT EXISTS 'science_lab';
ALTER TYPE "RoomType" ADD VALUE IF NOT EXISTS 'wood_workshop';
ALTER TYPE "RoomType" ADD VALUE IF NOT EXISTS 'outdoor_yard';
ALTER TYPE "RoomType" ADD VALUE IF NOT EXISTS 'indoor_yard';
