-- The chat-attachments bucket is used both for outbound uploads (agents
-- sending files) and inbound mirroring (customer media downloaded from
-- WHAPI/WATI then re-stored so the proxy never has to be hit again).
--
-- The original allow-list missed PDFs people commonly send each other on
-- WhatsApp: zip archives, plain text, csv, RTF, application/octet-stream
-- (the default when the provider doesn't report a type), HEIC photos from
-- iPhones, and pptx/ppt presentations. When the upload to the bucket
-- fails because of mime restrictions, the mirror falls back to the
-- provider proxy URL and we keep burning the WHAPI quota for that file.
--
-- WhatsApp itself caps documents at 100 MB; the bucket was at 25 MB which
-- also dropped legitimate inbound files. Bump it to match WhatsApp.
--
-- Dropping the allow-list entirely is safer than chasing every new type —
-- the agents who upload are authenticated employees and WhatsApp filters
-- truly hostile types on its own side.

UPDATE storage.buckets
SET
  allowed_mime_types = NULL,        -- accept any type
  file_size_limit    = 104857600    -- 100 MB
WHERE id = 'chat-attachments';
