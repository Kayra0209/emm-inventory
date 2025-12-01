import React, { useRef, useState, useEffect } from 'react';
import { Upload, Download, Database, FileText, Loader2, Users, UserPlus, X, FileQuestion, FilePlus, Archive, Trash2, Lock } from 'lucide-react';
import { db } from '../utils/db';
import { MasterItem, InventoryRecord } from '../types';

interface AdminDashboardProps {
  records: InventoryRecord[];
  setRecords: React.Dispatch<React.SetStateAction<InventoryRecord[]>>;
  onClearRecords: () => void;
  users: string[];
  setUsers: (users: string[]) => void;
  onExportScanned: () => void;
  onLock: () => void;
}

// Helper for robust CSV splitting (handles commas inside quotes)
const splitCSV = (str: string) => {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            result.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    result.push(current.trim());
    return result.map(val => {
        if (val.startsWith('"') && val.endsWith('"')) {
            return val.slice(1, -1).replace(/""/g, '"');
        }
        return val;
    });
}

// Robust file reader with encoding detection (UTF-8 / Big5 / UTF-16)
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const view = new DataView(buffer);
      
      // 1. Detect BOM
      let encoding = 'utf-8'; 
      let offset = 0;

      if (buffer.byteLength >= 3 && view.getUint8(0) === 0xEF && view.getUint8(1) === 0xBB && view.getUint8(2) === 0xBF) {
        encoding = 'utf-8';
        offset = 3;
      } else if (buffer.byteLength >= 2 && view.getUint16(0, true) === 0xFEFF) {
        encoding = 'utf-16le';
        offset = 2;
      } else if (buffer.byteLength >= 2 && view.getUint16(0, false) === 0xFEFF) {
        encoding = 'utf-16be';
        offset = 2;
      } else {
        // No BOM found. Try strict UTF-8 decoding.
        try {
           const decoder = new TextDecoder('utf-8', { fatal: true });
           const text = decoder.decode(buffer);
           resolve(text);
           return;
        } catch (e) {
           // If strict UTF-8 fails, assume Big5 (Traditional Chinese Excel)
           encoding = 'big5';
        }
      }

      try {
        const decoder = new TextDecoder(encoding);
        const text = decoder.decode(buffer.slice(offset));
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ records, setRecords, onClearRecords, users, setUsers, onExportScanned, onLock }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [newUser, setNewUser] = useState('');
  const [isProcessingReport, setIsProcessingReport] = useState(false);

  useEffect(() => {
    db.masterItems.count().then(count => setItemCount(count));
  }, [importing]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setProgress(0);
    setStatusMsg('讀取檔案中...');

    try {
      const text = await readFileAsText(file);
      
      const lines = text.split(/\r\n|\n/);
      const totalLines = lines.length;
      const CHUNK_SIZE = 1000;
      let processed = 0;
      
      await db.clearMasterData();
      
      const chunks = [];
      let currentChunk: MasterItem[] = [];
      let startIndex = 1; 

      for (let i = startIndex; i < totalLines; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = splitCSV(line);
        
        if (cols.length >= 1 && cols[0]) {
          // Reconstruct description if it was split by extra commas
          // CSV Format: PartID(0), ..., CustomerPN(7), Description(8...)
          const description = cols.length > 8 ? cols.slice(8).join(',').trim() : (cols[8] || '');

          currentChunk.push({
            PartID: cols[0],
            VendorSN: cols[1] || '',
            Project: cols[2] || '',
            Class: cols[3] || '',
            Location: cols[4] || '',
            Vendor: cols[5] || '',
            VendorPN: cols[6] || '',
            CustomerPN: cols[7] || '',
            Description: description
          });
        }

        if (currentChunk.length >= CHUNK_SIZE) {
          chunks.push([...currentChunk]);
          currentChunk = [];
        }
      }
      if (currentChunk.length > 0) chunks.push(currentChunk);

      for (let i = 0; i < chunks.length; i++) {
        await db.bulkAdd(chunks[i]);
        processed += chunks[i].length;
        const pct = Math.round(((i + 1) / chunks.length) * 100);
        setProgress(pct);
        setStatusMsg(`正在匯入第 ${i + 1}/${chunks.length} 區塊...`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      setImporting(false);
      setStatusMsg(`匯入完成！共 ${processed} 筆資料。`);
      setTimeout(() => setStatusMsg(''), 3000);
      
      const count = await db.masterItems.count();
      setItemCount(count);

    } catch (err) {
      console.error(err);
      setImporting(false);
      setStatusMsg('匯入失敗：檔案編碼錯誤');
    }
    
    e.target.value = '';
  };

  const handleMergeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if(!window.confirm(`確定要將 ${file.name} 合併到目前的盤點紀錄嗎？\n重複的 PartID 將被忽略。`)) {
      e.target.value = '';
      return;
    }

    try {
      const text = await readFileAsText(file);
      const lines = text.split(/\r\n|\n/);
      const startIndex = lines[0].startsWith('\uFEFF') || lines[0].includes('盤點日期') ? 1 : 0;
      
      const newRecords: InventoryRecord[] = [];
      const currentPartIds = new Set(records.map(r => r.PartID));
      let addedCount = 0;
      let skippedCount = 0;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = splitCSV(line);
        const partID = cols[1];

        if (partID && !currentPartIds.has(partID)) {
          const dateStr = cols[0];
          let timestamp = Date.now();
          if (dateStr) {
             const parsed = Date.parse(dateStr);
             if (!isNaN(parsed)) timestamp = parsed;
          }

          const description = cols.length > 11 ? cols.slice(11, -1).join(',').trim() : (cols[11] || '');

          newRecords.push({
            id: Math.random().toString(36).substr(2, 9),
            InventoryDate: timestamp,
            PartID: partID,
            VendorSN: cols[2] || '',
            Project: cols[3] || '',
            Class: cols[4] || '',
            Location: cols[5] || '',
            Status: (cols[6] as any) || 'OK',
            Vendor: cols[8] || '',
            VendorPN: cols[9] || '',
            CustomerPN: cols[10] || '',
            Description: description,
            scannedBy: cols[cols.length - 1] || 'Imported'
          });
          
          currentPartIds.add(partID);
          addedCount++;
        } else {
          skippedCount++;
        }
      }

      setRecords(prev => [...prev, ...newRecords]);
      alert(`合併完成！\n新增: ${addedCount} 筆\n略過(已存在): ${skippedCount} 筆`);

    } catch (err) {
      console.error(err);
      alert('合併失敗：檔案讀取錯誤');
    }

    e.target.value = '';
  };

  const handleBackupSystem = async () => {
    setIsProcessingReport(true);
    try {
      const allMaster = await db.getAll();
      const backupData = {
        version: "1.5",
        timestamp: Date.now(),
        users: users,
        records: records,
        masterCount: allMaster.length
      };
      
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `EMM_SystemBackup_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (e) {
      alert("備份失敗");
    } finally {
      setIsProcessingReport(false);
    }
  };

  const handleRestoreSystem = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;

     if(!window.confirm("警告：此操作將「覆蓋」目前的盤點紀錄與使用者名單。\n主檔資料(Master)不會被變更。\n確定要還原嗎？")) {
       e.target.value = '';
       return;
     }

     const reader = new FileReader();
     reader.onload = (event) => {
       try {
         const data = JSON.parse(event.target?.result as string);
         if (data.users && Array.isArray(data.users)) {
            setUsers(data.users);
         }
         if (data.records && Array.isArray(data.records)) {
            setRecords(data.records);
         }
         alert(`系統還原成功！\n已恢復 ${data.records?.length || 0} 筆紀錄。`);
       } catch (e) {
         alert("檔案格式錯誤，無法還原。");
       }
     };
     reader.readAsText(file);
     e.target.value = '';
  };

  const downloadCSV = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportFullReport = async () => {
    setIsProcessingReport(true);
    const BOM = "\uFEFF";
    const header = "盤點日期,PartID,Vendor S/N,Project,Class,Location,ScanStatus,InvStatus,Vendor,Vendor P/N,Customer P/N,Description,User\n";
    let csvContent = BOM + header;

    try {
      const scannedMap = new Map<string, InventoryRecord>();
      records.forEach(r => scannedMap.set(r.PartID, r));

      await db.masterItems.each(master => {
        const record = scannedMap.get(master.PartID);
        
        if (record) {
          const dateStr = new Date(record.InventoryDate).toLocaleString('zh-TW', { hour12: false }).replace(',', '');
          const row = [
            dateStr, 
            master.PartID, 
            master.VendorSN || '', 
            master.Project || '', 
            master.Class || '', 
            master.Location || '',
            record.Status, 
            'Normal', // InvStatus
            master.Vendor || '', 
            master.VendorPN || '', 
            master.CustomerPN || '',
            `"${(master.Description || '').replace(/"/g, '""')}"`, 
            record.scannedBy
          ].join(",");
          csvContent += row + "\n";
          scannedMap.delete(master.PartID);
        } else {
          const row = [
            '', 
            master.PartID, 
            master.VendorSN || '', 
            master.Project || '', 
            master.Class || '', 
            master.Location || '',
            '未盤點', 
            'Missing', // InvStatus
            master.Vendor || '', 
            master.VendorPN || '', 
            master.CustomerPN || '',
            `"${(master.Description || '').replace(/"/g, '""')}"`, 
            '-'
          ].join(",");
          csvContent += row + "\n";
        }
      });

      scannedMap.forEach(record => {
        const dateStr = new Date(record.InventoryDate).toLocaleString('zh-TW', { hour12: false }).replace(',', '');
        const row = [
          dateStr, 
          record.PartID, 
          record.VendorSN || '', 
          record.Project || '', 
          record.Class || '', 
          record.Location || '',
          record.Status, 
          '此物料不在清單中', 
          record.Vendor || '', 
          record.VendorPN || '', 
          record.CustomerPN || '',
          `"${(record.Description || '').replace(/"/g, '""')}"`, 
          record.scannedBy
        ].join(",");
        csvContent += row + "\n";
      });

      downloadCSV(csvContent, `TPE_EMM_FullReport_${new Date().toISOString().slice(0,10)}.csv`);

    } catch (e) {
      console.error(e);
      alert("匯出失敗");
    } finally {
      setIsProcessingReport(false);
    }
  };

  const handleExportUnscanned = async () => {
    setIsProcessingReport(true);
    const BOM = "\uFEFF";
    const header = "PartID,Vendor S/N,Project,Class,Location,Vendor,Vendor P/N,Customer P/N,Description\n";
    let csvContent = BOM + header;

    try {
      const scannedSet = new Set(records.map(r => r.PartID));
      let count = 0;

      await db.masterItems.each(item => {
        if (!scannedSet.has(item.PartID)) {
           const row = [
            item.PartID,
            item.VendorSN || '',
            item.Project || '',
            item.Class || '',
            item.Location || '',
            item.Vendor || '',
            item.VendorPN || '',
            item.CustomerPN || '',
            `"${(item.Description || '').replace(/"/g, '""')}"`
          ].join(",");
          csvContent += row + "\n";
          count++;
        }
      });

      if (count === 0) {
        alert("恭喜！所有庫存項目皆已盤點完成。");
      } else {
        downloadCSV(csvContent, `TPE_EMM_Unscanned_${new Date().toISOString().slice(0,10)}.csv`);
      }

    } catch(e) {
      console.error(e);
      alert("匯出失敗");
    } finally {
      setIsProcessingReport(false);
    }
  };

  const addUser = () => {
    if (newUser.trim() && !users.includes(newUser.trim())) {
      setUsers([...users, newUser.trim()]);
      setNewUser('');
    }
  };

  const removeUser = (u: string) => {
    setUsers(users.filter(user => user !== u));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
        <div className="flex justify-between items-center mb-4">
           <h3 className="text-base font-bold text-stone-800 flex items-center gap-2">
             <Database size={18} className="text-stone-600" />
             資料庫與合併
           </h3>
           <button onClick={onLock} className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-amber-600 transition-colors border border-stone-200 rounded-lg px-2 py-1"><Lock size={12} /> 鎖定系統</button>
        </div>
        
        <div className="flex items-center justify-between mb-4 p-3 bg-stone-50 rounded-lg">
          <span className="text-stone-500 text-xs">主檔筆數 (Master)</span>
          <span className="font-mono font-bold text-stone-800 text-sm">
            {itemCount === null ? '讀取中...' : itemCount}
          </span>
        </div>

        <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
        <input type="file" accept=".csv" ref={mergeInputRef} className="hidden" onChange={handleMergeUpload} />
        <input type="file" accept=".json" ref={restoreInputRef} className="hidden" onChange={handleRestoreSystem} />

        <div className="space-y-3">
          {importing ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-stone-500">
                <span>{statusMsg}</span><span>{progress}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2.5">
                <div className="bg-stone-800 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 flex items-center justify-center gap-2 bg-stone-800 text-stone-50 rounded-xl active:scale-95 transition-transform hover:bg-stone-700"
            >
              <Upload size={16} />
              <span className="text-xs">上傳庫存清單 (Master CSV)</span>
            </button>
          )}
          
          <div className="grid grid-cols-2 gap-3">
              <button onClick={() => mergeInputRef.current?.click()} className="py-3 flex flex-col items-center justify-center gap-1 border border-dashed border-stone-300 rounded-xl text-stone-600 hover:bg-stone-50 active:scale-95 transition-all">
                <FilePlus size={16} />
                <span className="text-xs font-bold">合併 CSV</span>
                <span className="text-[10px] font-light text-stone-400">整合盤點結果</span>
              </button>

              <button onClick={() => restoreInputRef.current?.click()} className="py-3 flex flex-col items-center justify-center gap-1 border border-stone-200 bg-stone-100 rounded-xl text-stone-600 hover:bg-stone-200 active:scale-95 transition-all">
                <Upload size={16} />
                <span className="text-xs font-bold">系統還原 (JSON)</span>
                <span className="text-[10px] opacity-70">回復完整備份</span>
              </button>
          </div>
          <p className="text-[10px] text-stone-400 mt-2 text-center">
             主檔匯入格式: PartID, Vendor S/N, Project, Class, Location, Vendor, Vendor P/N, Customer P/N, Description
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
        <h3 className="text-base font-bold text-stone-800 mb-4 flex items-center gap-2">
          <FileText size={18} className="text-stone-600" />
          報表中心
        </h3>
        
        <div className="grid grid-cols-1 gap-3">
          <button 
            onClick={onExportScanned}
            disabled={records.length === 0}
            className="py-3 flex items-center justify-center gap-3 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-100 active:scale-95 transition-all"
          >
            <Download size={18} />
            <div className="flex flex-col items-start">
               <span className="text-sm font-bold">匯出盤點清單</span>
               <span className="text-[10px] opacity-70">目前已整合過的盤點清單</span>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
             <button onClick={handleExportFullReport} disabled={isProcessingReport} className="py-3 flex flex-col items-center justify-center gap-1 border border-stone-200 bg-stone-800 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-700 active:scale-95 transition-all">
               {isProcessingReport ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
               <span className="text-xs font-bold">完整盤點總表</span>
               <span className="text-[9px] opacity-70">含未盤點/不在庫存清單中的物料</span>
             </button>

             <button onClick={handleExportUnscanned} disabled={isProcessingReport || itemCount === 0} className="py-3 flex flex-col items-center justify-center gap-1 border border-amber-200 bg-amber-50 text-amber-900 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-100 active:scale-95 transition-all">
               {isProcessingReport ? <Loader2 size={16} className="animate-spin" /> : <FileQuestion size={16} />}
               <span className="text-xs font-bold">未盤點清單</span>
             </button>
          </div>
          
          <button onClick={handleBackupSystem} className="mt-2 py-2 flex items-center justify-center gap-2 text-stone-500 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors">
            <Archive size={14} />
            <span className="text-xs">下載系統完整備份 (.json)</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
        <h3 className="text-base font-bold text-stone-800 mb-4 flex items-center gap-2">
          <Users size={18} className="text-stone-600" />
          人員管理
        </h3>
        <div className="flex gap-2 mb-4">
          <input 
             value={newUser}
             onChange={e => setNewUser(e.target.value)}
             className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs focus:outline-none focus:border-stone-500"
             placeholder="新增員工 ID..."
          />
          <button onClick={addUser} className="p-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700">
            <UserPlus size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {users.map(u => (
            <div key={u} className="px-3 py-1 bg-stone-100 rounded-full text-xs flex items-center gap-2 text-stone-700">
              <span>{u}</span>
              <button onClick={() => removeUser(u)} className="text-stone-400 hover:text-red-500"><X size={12}/></button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-stone-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button 
              onClick={() => {
                if(window.confirm('確定要清空「已盤點紀錄」嗎？\n主檔資料將被保留。\n(此動作無法復原)')) {
                  onClearRecords();
                }
              }}
              className="py-3 px-4 border border-red-200 bg-red-50 text-red-700 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={16} />
              清空已盤點紀錄 (Clear Scanned)
            </button>

            <button 
              onClick={async () => {
                if(window.confirm('確定要清空「主檔資料庫 (Master DB)」嗎？\n這將移除所有匯入的料號清單。\n(此動作無法復原)')) {
                  await db.clearMasterData();
                  const count = await db.masterItems.count();
                  setItemCount(count);
                }
              }}
              className="py-3 px-4 border border-stone-200 bg-stone-100 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-200 transition-colors flex items-center justify-center gap-2"
            >
              <Database size={16} />
              清空主檔資料 (Clear Master)
            </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;