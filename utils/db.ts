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

    // Strategy 2: Fuzzy Match via Description
    // Instead of exact match, we filter items that contain significant parts of the description
    if (record.Description && record.Description !== 'NA') {
      const desc = record.Description.toLowerCase().trim();
      
      // Use the first 15 chars as a "Project/Series" key or token based approach
      const searchKey = desc.substring(0, Math.min(desc.length, 15));

      return this.masterItems.filter(item => {
        const itemDesc = (item.Description || '').toLowerCase();
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