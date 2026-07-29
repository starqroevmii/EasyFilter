let activeFiles = [];
let rawDataRows = [];
let rawUnfilteredJson = [];
let allClients = [];
let allStatuses = [];
let allCallStatuses = [];

let selectedClients = new Set();
let selectedStatuses = new Set();
let selectedCallStatuses = new Set();

// total endo
let customEndoValues = JSON.parse(localStorage.getItem('CIMB_CUSTOM_ENDO_VALS') || '{}');

// dom
const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const loaderOverlay = document.getElementById('loaderOverlay');
const emptyState = document.getElementById('emptyState');
const resultsSection = document.getElementById('resultsSection');
const errorBox = document.getElementById('errorBox');
const errorMsg = document.getElementById('errorMsg');
const clearBtn = document.getElementById('clearBtn');
const fileListPanel = document.getElementById('fileListPanel');
const fileListTitle = document.getElementById('fileListTitle');
const fileListItems = document.getElementById('fileListItems');
const filtersWrap = document.getElementById('filtersWrap');
const uploadBoxTitle = document.getElementById('uploadBoxTitle');
const uploadBoxSub = document.getElementById('uploadBoxSub');

// history
const historyToggleBtn = document.getElementById('historyToggleBtn');
const historyDropdown = document.getElementById('historyDropdown');
const historyListContainer = document.getElementById('historyListContainer');
const historyCount = document.getElementById('historyCount');

// stat card
const elUniqueAccounts = document.getElementById('uniqueAccounts');
const elTotalDials = document.getElementById('totalDials');
const elTotalBalance = document.getElementById('totalBalance');
const elPtpCount = document.getElementById('ptpCount');
const elPtpTotal = document.getElementById('ptpTotal');
const elClaimCount = document.getElementById('claimCount');
const elClaimTotal = document.getElementById('claimTotal');
const elTableBody = document.getElementById('tableBody');
const elTableBadge = document.getElementById('tableBadge');

// filter
const clientSearch = document.getElementById('clientSearch');
const filterList = document.getElementById('filterList');
const filterCount = document.getElementById('filterCount');

const statusSearch = document.getElementById('statusSearch');
const statusFilterList = document.getElementById('statusFilterList');
const statusFilterCount = document.getElementById('statusFilterCount');

const callStatusSearch = document.getElementById('callStatusSearch');
const callStatusFilterList = document.getElementById('callStatusFilterList');
const callStatusFilterCount = document.getElementById('callStatusFilterCount');

const DB_NAME = 'CIMB_Dashboard_DB_v2';
const STORE_NAME = 'upload_history';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSessionToHistory(fileName, rows) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const dateStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    await store.add({
      fileName: fileName,
      timestamp: dateStr,
      rowCount: rows.length,
      rows: rows
    });
    refreshHistoryMenu();
  } catch (err) {
    console.warn("Could not save session:", err);
  }
}

async function getHistorySessions() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

async function deleteHistorySession(id, e) {
  if (e) e.stopPropagation();
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    refreshHistoryMenu();
  } catch (err) {
    console.warn("Could not delete item:", err);
  }
}

async function refreshHistoryMenu() {
  const sessions = await getHistorySessions();
  historyCount.textContent = `${sessions.length} saved`;
  
  if (sessions.length === 0) {
    historyListContainer.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.75rem;">No upload history yet</div>`;
    return;
  }

  let html = '';
  sessions.reverse().forEach(item => {
    html += `
      <div class="history-item" onclick="loadSessionFromHistory(${item.id})">
        <div class="history-info">
          <span class="history-name">${item.fileName}</span>
          <span class="history-date">${item.timestamp} • ${item.rowCount.toLocaleString()} rows</span>
        </div>
        <button class="history-del" onclick="deleteHistorySession(${item.id}, event)" title="Delete session">✕</button>
      </div>
    `;
  });
  historyListContainer.innerHTML = html;
}

async function loadSessionFromHistory(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get(id);

  req.onsuccess = () => {
    const session = req.result;
    if (session) {
      activeFiles = [{
        id: Date.now() + Math.random(),
        fileName: session.fileName,
        rows: session.rows,
        minDateKey: extractEarliestDateKey(session.rows)
      }];

      rebuildActiveDataset();
      historyDropdown.classList.remove('is-open');
    }
  };
}

historyToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  historyDropdown.classList.toggle('is-open');
});

document.addEventListener('click', (e) => {
  if (!historyDropdown.contains(e.target) && e.target !== historyToggleBtn) {
    historyDropdown.classList.remove('is-open');
  }
});

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFiles(e.dataTransfer.files);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFiles(e.target.files);
    fileInput.value = ''; // Reset input to allow re-uploading same file if deleted
  }
});

clearBtn.addEventListener('click', resetApp);

document.querySelectorAll('.filter-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.filter-panel').classList.toggle('is-collapsed');
  });
});

async function parseSingleFile(file) {
  const data = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "" });
}

function extractEarliestDateKey(rows) {
  if (!rows || rows.length === 0) return '9999-99-99';
  const sample = rows[0];
  const dateKeyLabel = findColKey(sample, 'Date');

  let minKey = '9999-99-99';
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const dt = normalizeDate(rows[i][dateKeyLabel]);
    if (dt && dt.key < minKey) {
      minKey = dt.key;
    }
  }
  return minKey;
}

async function handleFiles(files) {
  showLoader(true);
  hideError();

  try {
    const fileArray = Array.from(files);

    for (let file of fileArray) {
      const jsonRows = await parseSingleFile(file);
      if (jsonRows && jsonRows.length > 0) {
        activeFiles.push({
          id: Date.now() + Math.random(),
          fileName: file.name,
          rows: jsonRows,
          minDateKey: extractEarliestDateKey(jsonRows)
        });
      }
    }

    if (activeFiles.length === 0) {
      throw new Error("The selected file(s) are empty or missing headers.");
    }

    rebuildActiveDataset();

  } catch (err) {
    showError(err.message || "Failed to process the uploaded file(s).");
  } finally {
    showLoader(false);
  }
}

function removeFileFromStack(fileId) {
  activeFiles = activeFiles.filter(f => f.id !== fileId);
  if (activeFiles.length === 0) {
    resetApp();
  } else {
    rebuildActiveDataset();
  }
}

function rebuildActiveDataset() {
  // Sort files by date chronologically
  activeFiles.sort((a, b) => a.minDateKey.localeCompare(b.minDateKey));

  // Merge rows from all active files
  rawUnfilteredJson = [];
activeFiles.forEach(f => {
  rawUnfilteredJson = rawUnfilteredJson.concat(f.rows);
});

  // Render file list UI stack
  fileListTitle.textContent = `${activeFiles.length} file(s) loaded`;
  let stackHtml = '';
  activeFiles.forEach(f => {
    stackHtml += `
      <div class="file-stack-item">
        <div class="file-stack-info">
          <span class="file-stack-name" title="${f.fileName}">${f.fileName}</span>
          <span class="file-stack-date">${f.rows.length.toLocaleString()} rows</span>
        </div>
        <button class="file-remove-btn" onclick="removeFileFromStack(${f.id})" title="Remove file">✕</button>
      </div>
    `;
  });
  fileListItems.innerHTML = stackHtml;

  processDataset(rawUnfilteredJson);

  fileListPanel.style.display = 'block';
  clearBtn.style.display = 'inline-block';
  filtersWrap.style.display = 'block';
  emptyState.style.display = 'none';
  resultsSection.style.display = 'block';
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

function findColKey(row, targetLabel) {
  if (!row) return null;
  const keys = Object.keys(row);
  if (keys.includes(targetLabel)) return targetLabel;
  const targetLower = targetLabel.toLowerCase().trim();
  return keys.find(k => k.toLowerCase().trim() === targetLower) || null;
}

function parseAmount(val) {
  if (val === null || val === undefined || val === '') return null;
  const cleaned = String(val).replace(/[₱$€£,]/g, '').trim();
  if (cleaned === '') return null;
  const num = parseFloat(cleaned);
  return (isNaN(num) || num === 0) ? null : num;
}

function parseBalance(val) {
  if (val === null || val === undefined || val === '') return 0;
  const cleaned = String(val).replace(/[₱$€£,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const dt = new Date(raw);
  if (isNaN(dt.getTime())) return null;

  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const dateKey = `${yyyy}-${mm}-${dd}`;

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const display = `${monthNames[dt.getMonth()]} ${dt.getDate()}, ${yyyy}`;

  return { key: dateKey, display: display };
}

function processDataset(rows) {
  if (rows.length === 0) return;

  const sample = rows[0];
  const acctKey = findColKey(sample, 'Account No.');
  const balKey = findColKey(sample, 'Balance');
  const dateKey = findColKey(sample, 'Date');
  const clientKey = findColKey(sample, 'Client');
  const remarkKey = findColKey(sample, 'Remark Type');
  const ptpKey = findColKey(sample, 'PTP Amount');
  const claimKey = findColKey(sample, 'Claim Paid Amount');
  const statusKey = findColKey(sample, 'Status');
  const callStatusKey = findColKey(sample, 'Call Status');
  const campaignKey = findColKey(sample, 'Campaign');

  rawDataRows = [];
  const clientSet = new Set();
  const statusSet = new Set();
  const callStatusSet = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const acct = String(row[acctKey] || '').trim();
    if (!acct || acct.toLowerCase() === 'nan') continue;

    const dateInfo = normalizeDate(row[dateKey]);
    if (!dateInfo) continue;

    const client = String(row[clientKey] || '').trim() || '(no client)';
    const remarkType = String(row[remarkKey] || '').trim();
    const status = String(row[statusKey] || '').trim() || '(no status)';
    const callStatus = String(row[callStatusKey] || '').trim() || '(blank)';
    const campaign = String(row[campaignKey] || client).trim();

    const ptpVal = parseAmount(row[ptpKey]);
    const claimVal = parseAmount(row[claimKey]);

    clientSet.add(client);
    statusSet.add(status);
    callStatusSet.add(callStatus);

    rawDataRows.push({
      dateKey: dateInfo.key,
      display: dateInfo.display,
      acct: acct,
      balance: parseBalance(row[balKey]),
      client: client,
      campaign: campaign,
      isSMS: remarkType.toUpperCase() === 'SMS',
      hasPTP: ptpVal !== null,
      ptpAmt: ptpVal || 0,
      hasClaim: claimVal !== null,
      claimAmt: claimVal || 0,
      status: status,
      callStatus: callStatus
    });
  }

  allClients = Array.from(clientSet).sort();
  allStatuses = Array.from(statusSet).sort();
  allCallStatuses = Array.from(callStatusSet).sort();

  selectedClients = new Set(allClients);
  selectedStatuses = new Set(allStatuses);
  selectedCallStatuses = new Set(allCallStatuses);

  buildFilterUI();
  applyFilter();
}

function buildFilterUI() {
  buildFilterGroup(allClients, selectedClients, filterList, 'cb_c_', () => applyFilter());
  buildFilterGroup(allStatuses, selectedStatuses, statusFilterList, 'cb_s_', () => applyFilter());
  buildFilterGroup(allCallStatuses, selectedCallStatuses, callStatusFilterList, 'cb_cs_', () => applyFilter());

  setupFilterControls(clientSearch, filterList, 'selectAllBtn', 'clearAllBtn', allClients, selectedClients);
  setupFilterControls(statusSearch, statusFilterList, 'statusSelectAllBtn', 'statusClearAllBtn', allStatuses, selectedStatuses);
  setupFilterControls(callStatusSearch, callStatusFilterList, 'callStatusSelectAllBtn', 'callStatusClearAllBtn', allCallStatuses, selectedCallStatuses);
}

function buildFilterGroup(items, selectedSet, listContainer, prefix, onChangeCallback) {
  listContainer.innerHTML = '';
  items.forEach(item => {
    const label = document.createElement('label');
    label.className = 'filter-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item;
    checkbox.checked = selectedSet.has(item);
    checkbox.id = prefix + item.replace(/\s+/g, '_');

    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) selectedSet.add(item);
      else selectedSet.delete(item);
      onChangeCallback();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + item));
    listContainer.appendChild(label);
  });
}

function setupFilterControls(searchInput, listContainer, selectAllId, clearAllId, fullArray, selectedSet) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const items = listContainer.querySelectorAll('.filter-item');
    items.forEach(item => {
      const txt = item.textContent.toLowerCase();
      item.classList.toggle('hidden', !txt.includes(query));
    });
  });

  document.getElementById(selectAllId).onclick = () => {
    fullArray.forEach(i => selectedSet.add(i));
    updateCheckboxes(listContainer, true);
    setTimeout(() => applyFilter(), 0); // Decouples from execution stack
  };

  document.getElementById(clearAllId).onclick = () => {
    selectedSet.clear();
    updateCheckboxes(listContainer, false);
    setTimeout(() => applyFilter(), 0); // Decouples from execution stack
  };
}

function updateCheckboxes(container, checked) {
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
  });
}

function applyFilter() {
  updateFilterCounts();

  const dayMap = {};
  const globalSeenAccounts = new Set();
  const uniqueAccountBalances = new Map(); // Account -> Balance map for unique balance total
  const filteredRows = [];

  let grandDials = 0;
  let grandPtpCount = 0;
  let grandPtpTotal = 0;
  let grandClaimCount = 0;
  let grandClaimTotal = 0;

  for (let i = 0; i < rawDataRows.length; i++) {
    const r = rawDataRows[i];
    if (!selectedClients.has(r.client)) continue;
    if (!selectedStatuses.has(r.status)) continue;
    if (!selectedCallStatuses.has(r.callStatus)) continue;

    filteredRows.push(r);

    if (!dayMap[r.dateKey]) {
      dayMap[r.dateKey] = {
        display: r.display,
        seenAccts: new Set(),
        totalBalance: 0,
        dialCount: 0,
        ptpCount: 0,
        ptpTotal: 0,
        claimCount: 0,
        claimTotal: 0
      };
    }

    const day = dayMap[r.dateKey];

    if (!day.seenAccts.has(r.acct)) {
      day.seenAccts.add(r.acct);
      day.totalBalance += r.balance;
    }

    globalSeenAccounts.add(r.acct);
    if (!uniqueAccountBalances.has(r.acct)) {
      uniqueAccountBalances.set(r.acct, r.balance);
    }

    if (!r.isSMS) {
      day.dialCount++;
      grandDials++;
    }

    if (r.hasPTP) {
      day.ptpCount++;
      day.ptpTotal += r.ptpAmt;
      grandPtpCount++;
      grandPtpTotal += r.ptpAmt;
    }

    if (r.hasClaim) {
      day.claimCount++;
      day.claimTotal += r.claimAmt;
      grandClaimCount++;
      grandClaimTotal += r.claimAmt;
    }
  }

  // Calculate total balance from unique accounts
  let grandUniqueBalance = 0;
  uniqueAccountBalances.forEach(bal => grandUniqueBalance += bal);

  elUniqueAccounts.textContent = globalSeenAccounts.size.toLocaleString();
  elTotalDials.textContent = grandDials.toLocaleString();
  elTotalBalance.textContent = formatCurrency(grandUniqueBalance);
  elPtpCount.textContent = grandPtpCount.toLocaleString();
  elPtpTotal.textContent = formatCurrency(grandPtpTotal);
  elClaimCount.textContent = grandClaimCount.toLocaleString();
  elClaimTotal.textContent = formatCurrency(grandClaimTotal);

  renderTable(dayMap);
  renderPenetrationReport(filteredRows);
}

function renderTable(dayMap) {
  const sortedKeys = Object.keys(dayMap).sort();
  elTableBadge.textContent = `${sortedKeys.length} day${sortedKeys.length !== 1 ? 's' : ''}`;

  if (sortedKeys.length === 0) {
    elTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">No data matches the current filter criteria.</td></tr>`;
    return;
  }

  let html = '';
  sortedKeys.forEach((dk, idx) => {
    const d = dayMap[dk];
    html += `
      <tr>
        <td style="color:var(--text-muted);">${idx + 1}</td>
        <td style="font-weight:600; font-family:var(--sans);">${d.display}</td>
        <td>${d.seenAccts.size.toLocaleString()}</td>
        <td>${d.dialCount.toLocaleString()}</td>
        <td>${formatCurrency(d.totalBalance)}</td>
        <td>${d.ptpCount.toLocaleString()}</td>
        <td>${formatCurrency(d.ptpTotal)}</td>
        <td>${d.claimCount.toLocaleString()}</td>
        <td>${formatCurrency(d.claimTotal)}</td>
      </tr>
    `;
  });

  elTableBody.innerHTML = html;
}

function renderPenetrationReport(filteredRows) {
  const tbody = document.getElementById('penTableBody');
  const tfoot = document.getElementById('penTableTotal');

  const campaignConfigs = [
    { key: 'cimb_pl_co',   label: 'CIMB PL CO',   match: (val) => /PL|PLOAN|PERSONAL/i.test(val) && /CO\b|WRITEOFF/i.test(val) && !/PCO/i.test(val) },
    { key: 'cimb_pl_pco',  label: 'CIMB PL PCO',  match: (val) => /PL|PLOAN|PERSONAL/i.test(val) && /PCO\b/i.test(val) },
    { key: 'cimb_revi_co', label: 'CIMB REVI CO',  match: (val) => /REVI/i.test(val) && /CO\b|WRITEOFF/i.test(val) && !/PCO/i.test(val) },
    { key: 'cimb_revi_pco',label: 'CIMB REVI PCO', match: (val) => /REVI/i.test(val) && /PCO\b/i.test(val) }
  ];

  tbody.innerHTML = '';

  let totalEndoSum = 0, totalWorked = 0, totalConnected = 0, totalRPC = 0, totalDials = 0;
  let totalPTPCount = 0, totalPTPAmount = 0, totalKEPTCount = 0, totalKEPTAmount = 0;

  campaignConfigs.forEach(cfg => {
    const rows = filteredRows.filter(r => {
      const cmp = (r.campaign || r.client || '').toUpperCase();
      return cfg.match(cmp);
    });

    const calculatedEndo = new Set(rows.map(r => r.acct)).size;
    // Check if user has entered a custom Total Endo value previously
    const endo = customEndoValues[cfg.key] !== undefined ? customEndoValues[cfg.key] : calculatedEndo;

    const worked = new Set(rows.map(r => r.acct)).size;
    const connected = new Set(rows.filter(r => /connected|contacted|rpc|ptp/i.test(r.callStatus)).map(r => r.acct)).size;
    const rpc = new Set(rows.filter(r => /positive contact/i.test(r.Status)).map(r => r.acct)).size;
    const dials = rows.filter(r => !r.isSMS).length;

    const workedPct = endo > 0 ? ((worked / endo) * 100).toFixed(0) + '%' : '0%';
    const penRate = worked > 0 ? ((dials / worked) * 100).toFixed(0) + '%' : '0%';
    const passes = endo > 0 ? Math.round(dials / endo) : 0;
    const connRate = worked > 0 ? ((connected / worked) * 100).toFixed(0) + '%' : '0%';

    const ptpCount = new Set(rows.filter(r => r.hasPTP).map(r => r.acct)).size;
    const ptpAmt = rows.reduce((s, r) => s + r.ptpAmt, 0);
    const keptCount = new Set(rows.filter(r => r.hasClaim).map(r => r.acct)).size;
    const keptAmt = rows.reduce((s, r) => s + r.claimAmt, 0);

    totalEndoSum += Number(endo);
    totalWorked += worked;
    totalConnected += connected;
    totalRPC += rpc;
    totalDials += dials;
    totalPTPCount += ptpCount;
    totalPTPAmount += ptpAmt;
    totalKEPTCount += keptCount;
    totalKEPTAmount += keptAmt;

    tbody.innerHTML += `
      <tr>
        <td class="text-left">${cfg.label}</td>
        <td>
          <input type="number" class="endo-input" data-key="${cfg.key}" value="${endo}" onchange="updateEndoValue('${cfg.key}', this.value)">
        </td>
        <td>${worked.toLocaleString()}</td>
        <td>${connected.toLocaleString()}</td>
        <td>${rpc.toLocaleString()}</td>
        <td>${dials.toLocaleString()}</td>
        <td>${workedPct}</td>
        <td>${penRate}</td>
        <td>${passes}</td>
        <td>${connRate}</td>
        <td>${ptpCount.toLocaleString()}</td>
        <td>${ptpAmt > 0 ? ptpAmt.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0'}</td>
        <td>${keptCount.toLocaleString()}</td>
        <td>${keptAmt > 0 ? keptAmt.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0'}</td>
      </tr>
    `;
  });

  const grandWorkedPct = totalEndoSum > 0 ? ((totalWorked / totalEndoSum) * 100).toFixed(0) + '%' : '0%';
  const grandPenRate = totalEndoSum > 0 ? ((totalDials / totalEndoSum) * 100).toFixed(0) + '%' : '0%';
  const grandPasses = totalEndoSum > 0 ? Math.round(totalDials / totalEndoSum) : 0;
  const grandConnRate = totalDials > 0 ? ((totalConnected / totalDials) * 100).toFixed(0) + '%' : '0%';

  tfoot.innerHTML = `
    <td class="text-left">TOTAL</td>
    <td>${totalEndoSum.toLocaleString()}</td>
    <td>${totalWorked.toLocaleString()}</td>
    <td>${totalConnected.toLocaleString()}</td>
    <td>${totalRPC.toLocaleString()}</td>
    <td>${totalDials.toLocaleString()}</td>
    <td>${grandWorkedPct}</td>
    <td>${grandPenRate}</td>
    <td>${grandPasses}</td>
    <td>${grandConnRate}</td>
    <td>${totalPTPCount.toLocaleString()}</td>
    <td>${totalPTPAmount > 0 ? totalPTPAmount.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}</td>
    <td>${totalKEPTCount.toLocaleString()}</td>
    <td>${totalKEPTAmount > 0 ? totalKEPTAmount.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}</td>
  `;
}

function updateEndoValue(key, value) {
  const numVal = parseFloat(value);
  if (!isNaN(numVal) && numVal >= 0) {
    customEndoValues[key] = numVal;
    localStorage.setItem('CIMB_CUSTOM_ENDO_VALS', JSON.stringify(customEndoValues));
    applyFilter(); // Triggers live recalculation across dependent columns
  }
}

function updateFilterCounts() {
  filterCount.textContent = `${selectedClients.size}/${allClients.length}`;
  statusFilterCount.textContent = `${selectedStatuses.size}/${allStatuses.length}`;
  callStatusFilterCount.textContent = `${selectedCallStatuses.size}/${allCallStatuses.length}`;
}

function formatCurrency(val) {
  return '₱' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function resetApp() {
  activeFiles = [];
  rawDataRows = [];
  rawUnfilteredJson = [];
  fileInput.value = '';

  fileListPanel.style.display = 'none';
  filtersWrap.style.display = 'none';
  clearBtn.style.display = 'none';
  resultsSection.style.display = 'none';
  emptyState.style.display = 'block';
  hideError();
}

function showLoader(visible) {
  if (visible) loaderOverlay.classList.add('is-visible');
  else loaderOverlay.classList.remove('is-visible');
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorBox.style.display = 'block';
}

function hideError() {
  errorBox.style.display = 'none';
  errorMsg.textContent = '';
}

window.addEventListener('DOMContentLoaded', refreshHistoryMenu);