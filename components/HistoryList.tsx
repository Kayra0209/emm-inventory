import React, { useState, useMemo, useEffect } from 'react';
import { Search, Trash2, CheckSquare, Square, Calendar, Check, Box, History } from 'lucide-react';
import { InventoryRecord, ScanStatus, MasterItem } from '../types';
import { db } from '../utils/db';

interface HistoryListProps {
  records: InventoryRecord[];
  onDelete: (ids: string[]) => void;
  onUpdateStatus: (ids: string[], status: ScanStatus) => void;
  lastRecord?: InventoryRecord;
}

type ListMode = 'HISTORY' | 'RELATED';

const HistoryList: React.FC<HistoryListProps> = ({ records, onDelete, onUpdateStatus, lastRecord }) => {
  const [mode, setMode] = useState<ListMode>('HISTORY');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;
  
  // Related Items State
  const [relatedItems, setRelatedItems] = useState<MasterItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  
  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-switch to related mode if lastRecord changes
  useEffect(() => {
    if (lastRecord) {
      // Switch view if we have scanned something new
      setMode('RELATED');
      setRelatedLoading(true);
      
      // Use the new smarter search
      db.findRelatedItems({
        VendorPN: lastRecord.VendorPN,
        Description: lastRecord.Description
      }).then(items => {
        setRelatedItems(items);
        setRelatedLoading(false);
      });
    }
  }, [lastRecord]);

  // --- Filter Logic for HISTORY ---
  const filteredHistory = useMemo(() => {
    return records.filter(r => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        r.PartID.toLowerCase().includes(term) || 
        (r.Description?.toLowerCase().includes(term) || false);
      
      const recordDate = new Date(r.InventoryDate).toISOString().split('T')[0];
      
      let matchesDate = true;
      if (startDate && recordDate < startDate) matchesDate = false;
      if (endDate && recordDate > endDate) matchesDate = false;

      return matchesSearch && matchesDate;
    }).sort((a, b) => b.InventoryDate - a.InventoryDate);
  }, [records, searchTerm, startDate, endDate]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = filteredHistory.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // --- Logic for RELATED ---
  // In related mode, we want to see Master items.
  // We need to know if they are scanned.
  const scannedPartIds = useMemo(() => new Set(records.map(r => r.PartID)), [records]);

  // Selection Logic
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
    
    if (newSet.size === 0 && isSelectionMode) {
      setIsSelectionMode(false);
    }
  };

  const handleLongPress = (id: string) => {
    if (mode === 'HISTORY' && !isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
      if (navigator.vibrate) navigator.vibrate(50);
    }
  };

  const handleBatchDelete = () => {
    if (window.confirm(`確定要刪除選取的 ${selectedIds.size} 筆資料嗎？`)) {
      onDelete(Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  const handleBatchCheck = () => {
    if (window.confirm(`確定要將選取的 ${selectedIds.size} 筆資料標記為「已確認」嗎？`)) {
      onUpdateStatus(Array.from(selectedIds), 'Checked');
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  const quitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      
      {/* Top Tab Switcher */}
      {!isSelectionMode && (
        <div className="flex p-1 bg-stone-200 rounded-xl">
          <button 
            onClick={() => setMode('HISTORY')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
              mode === 'HISTORY' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <History size={14} />
            盤點紀錄
          </button>
          <button 
            onClick={() => setMode('RELATED')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
              mode === 'RELATED' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Box size={14} />
            相關庫存 ({lastRecord ? relatedItems.length : 0})
          </button>
        </div>
      )}

      {/* Header / Search Bar */}
      {isSelectionMode ? (
        <div className="sticky top-0 bg-stone-800 text-stone-50 z-10 py-3 px-4 rounded-xl flex justify-between items-center shadow-md animate-in slide-in-from-top-2">
           <div className="flex items-center gap-3">
             <button onClick={quitSelectionMode} className="text-stone-300 text-xs font-bold">取消</button>
             <span className="font-bold text-sm">已選 {selectedIds.size} 筆</span>
           </div>
           <div className="flex items-center gap-2">
             <button 
               onClick={handleBatchCheck}
               className="flex items-center gap-1 text-blue-300 hover:text-blue-100 px-2"
             >
               <Check size={16} />
               <span className="text-xs">確認</span>
             </button>
             <button 
               onClick={handleBatchDelete}
               className="flex items-center gap-1 text-red-300 hover:text-red-100 px-2"
             >
               <Trash2 size={16} />
               <span className="text-xs">刪除</span>
             </button>
           </div>
        </div>
      ) : (
        mode === 'HISTORY' && (
          <div className="flex flex-col gap-2 sticky top-0 bg-stone-50 z-10 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input
                type="text"
                placeholder="搜尋 PartID 或品名..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent shadow-sm text-sm"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" size={12} />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 bg-white border border-stone-200 rounded-lg text-stone-600 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
              <span className="text-stone-400 text-xs">-</span>
              <div className="relative flex-1">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" size={12} />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 bg-white border border-stone-200 rounded-lg text-stone-600 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
            </div>
          </div>
        )
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-20 no-scrollbar">
        
        {mode === 'HISTORY' && (
          paginatedHistory.length === 0 ? (
            <div className="text-center py-10 text-stone-400">
              無符合資料
            </div>
          ) : (
            paginatedHistory.map((record) => (
              <HistoryItem 
                key={record.id}
                record={record}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.has(record.id)}
                onToggle={() => toggleSelection(record.id)}
                onLongPress={() => handleLongPress(record.id)}
              />
            ))
          )
        )}

        {mode === 'RELATED' && (
          <div className="space-y-3">
             {!lastRecord ? (
                <div className="text-center py-10 text-stone-400 p-4 bg-white rounded-xl border border-dashed border-stone-200">
                  <Box size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">請先掃描任一項目，<br/>系統將自動列出同款庫存。</p>
                </div>
             ) : (
                <>
                  <div className="bg-stone-800 text-stone-50 p-4 rounded-xl shadow-md mb-4">
                     <h4 className="text-[10px] text-stone-400 mb-1 uppercase tracking-wider">當前比對品項</h4>
                     <p className="font-bold text-sm line-clamp-2">{lastRecord.Description}</p>
                     <div className="flex justify-between items-end mt-2">
                        {relatedLoading ? (
                          <span className="text-xs">比對中...</span>
                        ) : (
                          <span className="text-[10px] bg-stone-700 px-2 py-1 rounded">
                             找到 {relatedItems.length} 筆相似庫存
                          </span>
                        )}
                     </div>
                  </div>

                  {relatedLoading ? (
                     <div className="text-center py-4 text-stone-500 text-sm">載入中...</div>
                  ) : relatedItems.length === 0 ? (
                     <div className="text-center py-4 text-stone-500">
                        <p className="text-sm">找不到其他相似項目</p>
                        <p className="text-[10px] opacity-60 mt-1">已嘗試比對料號與品名關鍵字</p>
                     </div>
                  ) : (
                     relatedItems.map((item) => {
                       const isScanned = scannedPartIds.has(item.PartID);
                       return (
                         <div key={item.PartID} className={`p-4 rounded-xl border flex justify-between items-center ${
                            isScanned ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-stone-200'
                         }`}>
                            <div>
                               <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-stone-800 text-sm">{item.PartID}</span>
                                  {isScanned ? (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
                                      <Check size={10} /> 已盤
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded-full">未盤</span>
                                  )}
                               </div>
                               <div className="text-xs text-stone-500 mt-1">
                                  {item.Location && <span>Loc: {item.Location} • </span>}
                                  {item.Vendor && <span>{item.Vendor}</span>}
                               </div>
                               <div className="text-[10px] text-stone-400 mt-0.5 truncate max-w-[200px]">
                                 {item.Description}
                               </div>
                            </div>
                         </div>
                       );
                     })
                  )}
                </>
             )}
          </div>
        )}

      </div>

      {/* Pagination (Only for History) */}
      {mode === 'HISTORY' && totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 py-2 text-xs text-stone-600">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1 disabled:opacity-30 border border-stone-200 rounded-lg hover:bg-stone-50"
          >
            上一頁
          </button>
          <span>{page} / {totalPages}</span>
          <button 
             disabled={page === totalPages}
             onClick={() => setPage(p => Math.min(totalPages, p + 1))}
             className="px-3 py-1 disabled:opacity-30 border border-stone-200 rounded-lg hover:bg-stone-50"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
};

// Extracted Item component for gesture handling
const HistoryItem = ({ record, isSelectionMode, isSelected, onToggle, onLongPress }: any) => {
  const timeoutRef = React.useRef<any>(null);

  const handleTouchStart = () => {
    timeoutRef.current = setTimeout(() => {
      onLongPress();
    }, 600);
  };

  const handleTouchEnd = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handleClick = () => {
    if (isSelectionMode) {
      onToggle();
    }
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onClick={handleClick}
      className={`bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center transition-all cursor-pointer select-none
        ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-stone-100'}`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isSelectionMode && (
          <div className="text-blue-600">
            {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
             {/* Adjusted to text-base from text-lg */}
             <h3 className="font-mono font-bold text-stone-800 truncate text-base">{record.PartID}</h3>
             {record.Status === 'Not Found' && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">未建檔</span>}
             {record.Status === 'Duplicated' && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">重複</span>}
             {record.Status === 'Checked' && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">已確認</span>}
          </div>
          <p className="text-stone-500 text-xs truncate mt-0.5">{record.Description || '未知品項'}</p>
          <div className="flex gap-3 mt-1 text-[10px] text-stone-400">
            <span>{new Date(record.InventoryDate).toLocaleString()}</span>
            <span>{record.scannedBy}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HistoryList;