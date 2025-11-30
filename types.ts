export type ScanStatus = 'OK' | 'Not Found' | 'Duplicated' | 'Checked';

export interface InventoryRecord {
  id: string; // uuid
  InventoryDate: number; // Timestamp
  Status: ScanStatus;
  scannedBy: string;
  
  // Fields from TPE EMM CSV format
  PartID: string;
  VendorSN?: string;
  Project?: string;
  Class?: string;
  Location?: string;
  Vendor?: string;
  VendorPN?: string;
  CustomerPN?: string;
  Description?: string;
}

export interface MasterItem {
  PartID: string;
  VendorSN: string;
  Project: string;
  Class: string;
  Location: string;
  Vendor: string;
  VendorPN: string;
  CustomerPN: string;
  Description: string;
}

export interface CsvImportStats {
  total: number;
  success: number;
  errors: number;
}