-- Contract PDFs: public storage buckets for the generated contract-invoice PDF
-- and the contract/quotation document PDF. Mirrors the other public *-pdfs
-- buckets (writes go via the service-role client on the server; public-read so
-- the /pay portal + WhatsApp can link them). `contract-documents` stays private
-- (operator-uploaded terms / signed docs) — these are the GENERATED docs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-invoice-pdfs', 'contract-invoice-pdfs', true),
       ('contract-pdfs',         'contract-pdfs',         true)
ON CONFLICT (id) DO NOTHING;
