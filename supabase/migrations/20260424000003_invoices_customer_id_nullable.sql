-- AP bills (supplier invoices) have no customer — drop the NOT NULL constraint.
ALTER TABLE invoices ALTER COLUMN customer_id DROP NOT NULL;
