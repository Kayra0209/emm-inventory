import React, { useState, useEffect, useCallback } from 'react';
import { Scan, List, BarChart3, Settings, User, ArrowRight, X, Download, Lock, Eye, EyeOff } from 'lucide-react';
import ScannerInput from './components/ScannerInput';
import StatusFeedback from './components/StatusFeedback';
import HistoryList from './components/HistoryList';
import StockStatus from './components/StockStatus';
import AdminDashboard from './components/AdminDashboard';
import ScanResultOverlay from './components/ScanResultOverlay';
import { InventoryRecord, ScanStatus, MasterItem } from './types';
import { db } from './utils/db';

const generateId = () => Math.random().toString(36).substr(2, 9);

type View = 'SCAN' | 'LIST' | 'STATUS' | 'ADMIN';

// --- Sound Utility ---
const playSound = (type: 'success' | 'error' | 'warning') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;

  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'success') {
    // Pleasant high pitch beep
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Quick chirp
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } else if (type === 'warning') {
    // Double beep for duplicate
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    
    setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(440, ctx.currentTime);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.1);
    }, 150);

  } else {
    // Low pitch error buzz
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  // Cleanup AudioContext after sound finishes to prevent resource leaks
  setTimeout(() => {
    if (ctx.state !== 'closed') {
      ctx.close();
    }
  }, 500);
};

function App() {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
      return localStorage.getItem('zen_auth') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // UI State
  const [currentView, setCurrentView] = useState<View>('SCAN');
  const [isScanning, setIsScanning] = useState(false);
  const [hasSelectedUser, setHasSelectedUser] = useState(false); 
  
  // Overlay State
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayRecord, setOverlayRecord] = useState<InventoryRecord | undefined>(undefined);
  const [overlayStatus, setOverlayStatus] = useState<ScanStatus | 'IDLE'>('IDLE');
  
  // User Management
  const [users, setUsers] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('zen_users');
      const parsed = s ? JSON.parse(s) : null;
      return (Array.isArray(parsed) && parsed.length > 0) 
        ? parsed 
        : ['Kayra', 'Lynn', 'Jamilla', 'Hannah', 'Devin'];
    } catch (e) {
      return ['Kayra', 'Lynn', 'Jamilla', 'Hannah', 'Devin'];
    }
  });
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('zen_current_user') || users[0]);

  const [records, setRecords] = useState<InventoryRecord[]>(() => {
    const saved = localStorage.getItem('zen_records');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [lastScanStatus, setLastScanStatus] = useState<ScanStatus | 'IDLE'>('IDLE');
  const [lastRecord, setLastRecord] = useState<InventoryRecord | undefined>(undefined);
  
  // Manual Input & Autocomplete State
  const [manualInput, setManualInput] = useState('');
  const [suggestions, setSuggestions] = useState<MasterItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    localStorage.setItem('zen_records', JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    localStorage.setItem('zen_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('zen_current_user', currentUser);
  }, [currentUser]);

  // Autocomplete Logic
  useEffect(() => {
    const fetchSuggestions = async () => {
        if (manualInput.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        
        // Use optimized DB search
        const matched = await db.searchMasterItems(manualInput);
        
        setSuggestions(matched);
        setShowSuggestions(matched.length > 0);
    };

    const timer = setTimeout(fetchSuggestions, 300); // Debounce
    return () => clearTimeout(timer);
  }, [manualInput]);

  // REMOVED: beforeunload event listener to stop the annoying prompt on refresh.
  // Data is saved to localStorage/IndexedDB automatically, so this prompt is unnecessary.

  // Scan Overlay Timer
  useEffect(() => {
    let timer: any;
    if (showOverlay) {
      timer = setTimeout(() => {
        setShowOverlay(false);
      }, 1500); // Overlay shows for 1.5 seconds
    }
    return () => clearTimeout(timer);
  }, [showOverlay]);

  const handleUserSelect = (user: string) => {
    setCurrentUser(user);
    setHasSelectedUser(true);
  };

  const handleScan = useCallback(async (partId: string) => {
    if (!partId.trim()) return;

    // 1. Check for duplicates locally
    const existingRecord = records.find(r => r.PartID === partId);
    
    if (existingRecord) {
      setLastScanStatus('Duplicated');
      setLastRecord(existingRecord);
      
      // Trigger Overlay
      setOverlayStatus('Duplicated');
      setOverlayRecord(existingRecord);
      setShowOverlay(true);

      playSound('warning');
      if (navigator.vibrate) navigator.vibrate(200); // Short double buzz for warning
      return; 
    }
    
    // 2. Query Master DB
    const masterItem = await db.findItem(partId);
    const status: ScanStatus = masterItem ? 'OK' : 'Not Found';
    
    // Create new record snapshotting master data
    const newRecord: InventoryRecord = {
      id: generateId(),
      InventoryDate: Date.now(),
      Status: status,
      scannedBy: currentUser,
      
      PartID: partId,
      VendorSN: masterItem?.VendorSN || '',
      Project: masterItem?.Project || '',
      Class: masterItem?.Class || '',
      Location: masterItem?.Location || '',
      Vendor: masterItem?.Vendor || '',
      VendorPN: masterItem?.VendorPN || '',
      CustomerPN: masterItem?.CustomerPN || '',
      Description: masterItem?.Description || ''
    };

    setRecords(prev => [newRecord, ...prev]);
    setLastRecord(newRecord);
    setLastScanStatus(status);
    
    // Trigger Overlay
    setOverlayStatus(status);
    setOverlayRecord(newRecord);
    setShowOverlay(true);

    if (status === 'OK') {
        playSound('success');
        if (navigator.vibrate) navigator.vibrate(50); // Short crisp buzz for success
    } else {
        playSound('error');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Long buzz pattern for error
    }
    
    // Clear manual input state
    setManualInput('');
    setShowSuggestions(false);
    
  }, [records, currentUser]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScan(manualInput);
  };

  const handleSuggestionClick = (partId: string) => {
      handleScan(partId);
  };

  const handleViewRelated = () => {
    setCurrentView('LIST');
  };

  const deleteRecords = (ids: string[]) => {
    setRecords(prev => prev.filter(r => !ids.includes(r.id)));
  };

  const handleDeleteSingle = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(window.confirm('確定要刪除此筆掃描紀錄嗎？')) {
          deleteRecords([id]);
          if (lastRecord && lastRecord.id === id) {
              setLastRecord(undefined);
              setLastScanStatus('IDLE');
          }
      }
  };

  const updateRecordsStatus = (ids: string[], newStatus: ScanStatus) => {
    setRecords(prev => prev.map(r => ids.includes(r.id) ? { ...r, Status: newStatus } : r));
  };

  const clearRecords = () => {
    setRecords([]);
    setLastScanStatus('IDLE');
    setLastRecord(undefined);
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

  const handleExportScanned = () => {
    const BOM = "\uFEFF";
    const header = "盤點日期,PartID,Vendor S/N,Project,Class,Location,ScanStatus,InvStatus,Vendor,Vendor P/N,Customer P/N,Description,User\n";
    let csvContent = BOM + header;
    
    records.forEach(r => {
      const dateStr = new Date(r.InventoryDate).toLocaleString('zh-TW', { hour12: false }).replace(',', '');
      const row = [
        dateStr, 
        r.PartID, 
        r.VendorSN || '', 
        r.Project || '', 
        r.Class || '', 
        r.Location || '',
        r.Status, 
        'Normal', 
        r.Vendor || '', 
        r.VendorPN || '', 
        r.CustomerPN || '',
        `"${(r.Description || '').replace(/"/g, '""')}"`, 
        r.scannedBy
      ].join(",");
      csvContent += row + "\n";
    });

    downloadCSV(csvContent, `TPE_EMM_ScannedOnly_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordInput === '20251201') {
          setIsAuthenticated(true);
          localStorage.setItem('zen_auth', 'true'); // Persist login
          setAuthError(false);
          setPasswordInput('');
      } else {
          setAuthError(true);
          setPasswordInput('');
      }
  };

  const handleLock = () => {
      setIsAuthenticated(false);
      localStorage.removeItem('zen_auth');
      setHasSelectedUser(false); // Also reset user selection
      setPasswordInput('');
  };

  // --- Password Protection Screen ---
  if (!isAuthenticated) {
      return (
        <div className="h-screen bg-stone-800 flex flex-col items-center justify-center p-6 text-stone-50">
            <div className="w-16 h-16 bg-stone-700 rounded-full flex items-center justify-center mb-6">
                <Lock size={32} className="text-amber-500" />
            </div>
            <h1 className="text-xl font-bold mb-2">系統鎖定</h1>
            <p className="text-stone-400 text-xs mb-8">請輸入存取密碼以繼續</p>
            
            <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
                <div className="relative">
                    <input 
                        type={showPassword ? "text" : "password"} 
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full bg-stone-700 border border-stone-600 rounded-xl px-4 py-3 pr-12 text-center text-lg tracking-widest focus:outline-none focus:border-amber-500 transition-colors"
                        placeholder="••••"
                        inputMode="numeric"
                        maxLength={8}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-stone-400 hover:text-stone-200 transition-colors"
                    >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                </div>
                {authError && <p className="text-red-400 text-xs text-center">密碼錯誤</p>}
                <button 
                    type="submit"
                    className="w-full bg-amber-600 text-white rounded-xl py-3 font-bold active:scale-95 transition-transform"
                >
                    解鎖
                </button>
            </form>
        </div>
      );
  }

  // --- Login Screen (User Select) ---
  if (!hasSelectedUser) {
    return (
       <div className="h-screen bg-stone-50 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="mb-10 text-center">
             <div className="w-20 h-20 bg-stone-800 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-xl shadow-stone-200">
                <div className="w-4 h-4 bg-amber-500 rounded-full animate-bounce-short"></div>
             </div>
             <h1 className="text-lg font-bold text-stone-800 tracking-tight mb-2">EMM 盤點系統</h1>
             <p className="text-stone-400 text-sm">請選擇您的使用者名稱以開始</p>
          </div>

          <div className="w-full max-w-sm grid grid-cols-2 gap-3">
             {users.map(u => (
               <button
                 key={u}
                 onClick={() => handleUserSelect(u)}
                 className="p-4 bg-white border-2 border-stone-100 rounded-2xl font-bold text-stone-600 hover:border-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-all active:scale-95 shadow-sm text-sm"
               >
                 {u}
               </button>
             ))}
          </div>
          
          <div className="mt-12 text-[10px] text-stone-300">
            Version 1.5 • Offline First
          </div>
       </div>
    );
  }

  // --- Main App ---
  return (
    <div className="flex flex-col h-screen bg-stone-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      {/* Header */}
      <header className="bg-stone-800 text-stone-50 p-3 shadow-md z-20 flex justify-between items-center">
        <h1 className="font-bold text-sm tracking-wide flex items-center gap-2">
          <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
          EMM盤點系統
        </h1>
        <div className="flex items-center gap-2 text-xs bg-stone-700 px-3 py-1.5 rounded-full border border-stone-600">
          <User size={14} className="text-amber-400" />
          <span className="text-stone-200 font-medium">{currentUser}</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto p-4 pb-24 no-scrollbar">
          
          {currentView === 'SCAN' && (
            <div className="flex flex-col h-full gap-4">
              
              {/* Export Button in Scan Interface */}
              <div className="flex justify-end -mb-2 z-10">
                <button 
                  onClick={handleExportScanned}
                  className="flex items-center gap-1 text-[10px] bg-stone-200 hover:bg-emerald-100 hover:text-emerald-800 text-stone-600 px-2 py-1 rounded-full transition-colors border border-stone-300"
                >
                   <Download size={12} />
                   匯出清單 (CSV)
                </button>
              </div>

              <StatusFeedback 
                status={lastScanStatus} 
                lastRecord={lastRecord} 
                onViewRelated={handleViewRelated} // Pass the callback
              />
              
              <div className="flex-1 flex flex-col items-center justify-center min-h-[250px]">
                <button
                  onClick={() => setIsScanning(true)}
                  className="w-32 h-32 rounded-full bg-stone-800 shadow-xl border-4 border-stone-200 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all duration-200 group mb-6 hover:shadow-2xl hover:border-amber-500/30"
                >
                  <Scan size={36} className="text-stone-100 group-hover:text-amber-400 transition-colors" />
                  <span className="text-stone-200 font-medium text-xs">啟動掃描</span>
                </button>

                {/* Manual Input Form with Autocomplete */}
                <form onSubmit={handleManualSubmit} className="w-full max-w-xs px-2 relative z-10">
                  <div className="relative flex items-center group">
                    <input 
                       type="text" 
                       value={manualInput}
                       onChange={(e) => setManualInput(e.target.value)}
                       placeholder="輸入 PartID (支援搜尋)..."
                       className="w-full py-3 px-4 bg-white border border-stone-300 rounded-xl focus:outline-none focus:border-stone-800 focus:ring-1 focus:ring-stone-800 transition-all text-stone-800 placeholder-stone-400 shadow-sm text-sm"
                    />
                    <button 
                      type="submit"
                      disabled={!manualInput.trim()}
                      className="absolute right-2 p-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>

                  {/* Suggestions Dropdown */}
                  {showSuggestions && (
                      <div className="absolute w-full mt-2 bg-white rounded-xl shadow-xl border border-stone-100 overflow-hidden z-20 max-h-60 overflow-y-auto">
                          {suggestions.map(item => (
                              <button
                                  key={item.PartID}
                                  type="button"
                                  onClick={() => handleSuggestionClick(item.PartID)}
                                  className="w-full text-left px-4 py-3 hover:bg-amber-50 border-b border-stone-50 last:border-0 flex flex-col transition-colors"
                              >
                                  <span className="font-bold text-stone-700 text-sm">{item.PartID}</span>
                                  <div className="flex justify-between items-center w-full">
                                    <span className="text-xs text-stone-400 truncate max-w-[180px]">{item.Description}</span>
                                    {item.VendorPN && item.VendorPN !== 'NA' && (
                                      <span className="text-[10px] bg-stone-100 text-stone-500 px-1 rounded">{item.VendorPN}</span>
                                    )}
                                  </div>
                              </button>
                          ))}
                      </div>
                  )}
                </form>
              </div>

              {/* Recent Records */}
              <div className="mt-auto bg-white rounded-xl px-4 py-3 shadow-sm border border-stone-100 opacity-90">
                <div className="flex justify-between items-center mb-2">
                   <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">最近紀錄</h4>
                   <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{records.length} 筆</span>
                </div>
                {records.length === 0 ? (
                  <p className="text-xs text-stone-300 py-1">尚無資料</p>
                ) : (
                  <div className="space-y-1">
                    {records.slice(0, 3).map(r => (
                      <div key={r.id} className="flex justify-between items-center py-1.5 text-sm border-b border-stone-50 last:border-0 group">
                        <span className="font-mono text-stone-700 font-medium">{r.PartID}</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            r.Status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 
                            r.Status === 'Checked' ? 'bg-blue-100 text-blue-700' :
                            r.Status === 'Duplicated' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            }`}>{r.Status}</span>
                            
                            {/* Quick Delete Button */}
                            <button 
                                onClick={(e) => handleDeleteSingle(r.id, e)}
                                className="p-1 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === 'LIST' && (
            <HistoryList 
              records={records} 
              onDelete={deleteRecords} 
              onUpdateStatus={updateRecordsStatus}
              lastRecord={lastRecord}
            />
          )}

          {currentView === 'STATUS' && (
            <StockStatus records={records} />
          )}

          {currentView === 'ADMIN' && (
            <AdminDashboard 
              records={records} 
              setRecords={setRecords}
              onClearRecords={clearRecords} 
              users={users}
              setUsers={setUsers}
              onExportScanned={handleExportScanned}
              onLock={handleLock}
            />
          )}

        </div>
      </main>

      <ScannerInput 
        onScan={handleScan} 
        isScanning={isScanning} 
        setIsScanning={setIsScanning} 
      />

      <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-stone-200 px-6 py-3 flex justify-between items-center z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <NavButton 
          active={currentView === 'SCAN'} 
          onClick={() => setCurrentView('SCAN')} 
          icon={<Scan size={22} />} 
          label="盤點" 
        />
        <NavButton 
          active={currentView === 'LIST'} 
          onClick={() => setCurrentView('LIST')} 
          icon={<List size={22} />} 
          label="明細" 
        />
        <NavButton 
          active={currentView === 'STATUS'} 
          onClick={() => setCurrentView('STATUS')} 
          icon={<BarChart3 size={22} />} 
          label="狀態" 
        />
        <NavButton 
          active={currentView === 'ADMIN'} 
          onClick={() => setCurrentView('ADMIN')} 
          icon={<Settings size={22} />} 
          label="管理" 
        />
      </nav>
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center gap-1 transition-all duration-200 ${
      active ? 'text-stone-800 scale-110 font-bold' : 'text-stone-400 hover:text-stone-600'
    }`}
  >
    {icon}
    <span className="text-[10px]">{label}</span>
  </button>
);

export default App;
