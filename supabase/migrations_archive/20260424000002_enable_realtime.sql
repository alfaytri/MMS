-- Enable Realtime for tables that need live sync
ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE po_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE receivals;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
