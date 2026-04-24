-- AddColumn last_measured_value to report_alerts
ALTER TABLE report_alerts ADD COLUMN last_measured_value NUMERIC(12,2);
