import Dexie, { Table } from 'dexie';
import { MasterItem } from '../types';

class InventoryDB extends Dexie {
  masterItems!: Table<MasterItem>;

  constructor() {
    super('ZenInventoryDB');
    (this as any).version(3).stores({
      masterItems: 'PartID, Project, Description, VendorPN' 
    });
  }

  async bulkAdd(items: MasterItem[]) {
    return this.masterItems.bulkPut(items);
  }

  async findItem(partId: string): Promise<MasterItem | undefined> {
    return this.masterItems.get(partId);
  }

  // Improved Logic: Smart Search for Related Items using Description Structure
  async findRelatedItems(record: { VendorPN?: string, Description?: string }): Promise<MasterItem[]> {
    // 1. VendorPN Match
    if (record.VendorPN && record.VendorPN !== 'NA' && record.VendorPN.length > 2) {
       const byVendorPN = await this.masterItems.where('VendorPN').equals(record.VendorPN).toArray();
       if (byVendorPN.length > 0) return byVendorPN;
    }

    // 2. Description Segment Match (First 4 parts)
    if (record.Description && record.Description !== 'NA') {
      const desc = record.Description.toLowerCase().trim();
      
      // Split by comma and take first 4 segments
      const parts = desc.split(',').map(p => p.trim());
      const searchKey = parts.slice(0, 4).join(',').toLowerCase();

      // Fallback if description is too short
      if (searchKey.length < 3) {
          return [];
      }

      // Filter items containing the constructed search key
      return this.masterItems.filter(item => {
        const itemDesc = (item.Description || '').toLowerCase();
        return itemDesc.includes(searchKey);
      }).toArray();
    }

    return [];
  }

  async searchMasterItems(term: string): Promise<MasterItem[]> {
    if (!term || term.length < 2) return [];
    const lower = term.toLowerCase();
    
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
