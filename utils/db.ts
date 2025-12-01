import Dexie, { Table } from 'dexie';
import { MasterItem } from '../types';

class InventoryDB extends Dexie {
  masterItems!: Table<MasterItem>;

  constructor() {
    super('ZenInventoryDB');
    // Bump version to 3 for schema update
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

  // UPDATED LOGIC: Match by Full Description
  async findRelatedItems(record: { VendorPN?: string, Description?: string }): Promise<MasterItem[]> {
    // 1. VendorPN Match (Strongest signal)
    if (record.VendorPN && record.VendorPN !== 'NA' && record.VendorPN.length > 2) {
       const byVendorPN = await this.masterItems.where('VendorPN').equals(record.VendorPN).toArray();
       if (byVendorPN.length > 0) return byVendorPN;
    }

    // 2. Full Description Match
    if (record.Description && record.Description !== 'NA') {
      const targetDesc = record.Description.toLowerCase().trim();
      
      if (targetDesc.length < 2) return [];

      // Filter items that match the FULL description exactly
      return this.masterItems.filter(item => {
        const itemDesc = (item.Description || '').toLowerCase().trim();
        return itemDesc === targetDesc;
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