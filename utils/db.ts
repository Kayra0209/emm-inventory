import Dexie, { Table } from 'dexie';
import { MasterItem } from '../types';

class InventoryDB extends Dexie {
  masterItems!: Table<MasterItem>;

  constructor() {
    super('ZenInventoryDB');
    // Bump version to 3 for schema update (adding Description index)
    (this as any).version(3).stores({
      masterItems: 'PartID, Project, Description, VendorPN' // Ensure VendorPN is indexed
    });
  }

  // Optimize bulk add for large CSVs
  async bulkAdd(items: MasterItem[]) {
    return this.masterItems.bulkPut(items);
  }

  async findItem(partId: string): Promise<MasterItem | undefined> {
    return this.masterItems.get(partId);
  }

  // Improved Logic: Smart Search for Related Items
  async findRelatedItems(record: { VendorPN?: string, Description?: string }): Promise<MasterItem[]> {
    // Strategy 1: Strong Match via VendorPN (if available and not 'NA')
    if (record.VendorPN && record.VendorPN !== 'NA' && record.VendorPN.length > 2) {
       const byVendorPN = await this.masterItems.where('VendorPN').equals(record.VendorPN).toArray();
       if (byVendorPN.length > 0) return byVendorPN;
    }

    // Strategy 2: Structured Match via Description
    // Search using the first 4 segments of the comma-separated description
    if (record.Description && record.Description !== 'NA') {
      const desc = record.Description.toLowerCase().trim();
      
      // NEW LOGIC: Take the first 4 comma-separated segments as the "Series/Model Key"
      const parts = desc.split(',').map(p => p.trim());
      // Join first 4 parts or less if description is short
      const searchKey = parts.slice(0, 4).join(',').toLowerCase();

      // If search key is too short, fallback to simpler check
      if (searchKey.length < 5) {
          return this.masterItems.filter(item => {
            return (item.Description || '').toLowerCase().includes(searchKey);
          }).toArray();
      }

      return this.masterItems.filter(item => {
        const itemDesc = (item.Description || '').toLowerCase();
        // Check if item starts with the same series key
        return itemDesc.includes(searchKey);
      }).toArray();
    }

    return [];
  }

  // New method for autocomplete
  async searchMasterItems(term: string): Promise<MasterItem[]> {
    if (!term || term.length < 2) return [];
    const lower = term.toLowerCase();
    
    // Filter items where PartID or VendorPN contains the search term
    // Limiting to 5 results for UI performance
    return this.masterItems
      .filter(item => 
        item.PartID.toLowerCase().includes(lower) || 
        (item.VendorPN || '').toLowerCase().includes(lower)
      )
      .limit(5)
      .toArray();
  }

  async clearMasterData() {
    return this.masterItems.clear();
  }

  async getAll(): Promise<MasterItem[]> {
    return this.masterItems.toArray();
  }
}

export const db = new InventoryDB();
