let config = null;
let calendarDataMap = {}; // 快取台灣官方行事曆資料 (Key: YYYY-MM-DD, Value: { isHoliday, description })
let lastRenderedDate = ''; // 紀錄上次渲染畫面時的日期 (YYYY-MM-DD)
let midnightTimer = null; // 跨夜自動刷新計時器
let autoRefreshListenersInitialized = false; // 避免重複註冊 auto-refresh 事件監聽器

// Service Worker 註冊
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('ServiceWorker 註冊失敗:', err));
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('config.json?t=' + Date.now());
    config = await res.json();

    // 1. 先根據 config.json 立即渲染畫面
    initApp();
    setupNotificationSystem();

    // 2. 背景非同步讀取台灣官方線上行事曆 API (優先使用 100% 支援 CORS 的全球 CDN)
    const currentYear = new Date().getFullYear();
    await loadTaiwanCalendar(currentYear - 1);
    await loadTaiwanCalendar(currentYear);
    await loadTaiwanCalendar(currentYear + 1);
    
    // 3. 讀取完線上 API 後再次更新畫面
    initApp();

    // 4. 設定跨日自動刷新與頁面可見性/焦點恢復監聽
    setupAutoRefreshOnDateChange();
  } catch (err) {
    console.error('無法載入 config.json:', err);
    document.getElementById('today-duty-display').innerHTML = '<span style="color:red;">載入設定檔失敗</span>';
  }
});

/**
 * 讀取台灣行政院人事行政總處官方辦公日曆表
 * 優先使用 100% 支援跨域 (CORS Allow-Origin: *) 的 jsDelivr CDN & GitHub Raw 管道
 */
async function loadTaiwanCalendar(year) {
  // 管道 1: jsDelivr CDN (官方明確支援 CORS Access-Control-Allow-Origin: *，不會報錯且速度最快)
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
          const y = item.date.substring(0, 4);
          const m = item.date.substring(4, 6);
          const d = item.date.substring(6, 8);
          const formattedDate = `${y}-${m}-${d}`;
          
          calendarDataMap[formattedDate] = {
            isHoliday: item.isHoliday === true || item.isHoliday === "true",
            description: item.description || item.caption || ''
          };
        });
        console.log(`已成功透過 管道 1 (jsDelivr CDN) 載入 ${year} 年台灣官方行事曆資料 (${data.length} 天)`);
        return;
      }
    }
  } catch (e) {
    console.warn(`管道 1 (jsDelivr) 載入 ${year} 年失敗，嘗試管道 2`, e);
  }

  // 管道 2: GitHub Raw 鏡像 (同樣 100% 支援 CORS 跨域存取)
  try {
    const res = await fetch(`https://raw.githubusercontent.com/ruyut/TaiwanCalendar/master/data/${year}.json`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
          const y = item.date.substring(0, 4);
          const m = item.date.substring(4, 6);
          const d = item.date.substring(6, 8);
          const formattedDate = `${y}-${m}-${d}`;
          
          calendarDataMap[formattedDate] = {
            isHoliday: item.isHoliday === true || item.isHoliday === "true",
            description: item.description || item.caption || ''
          };
        });
        console.log(`已成功透過 管道 2 (GitHub Raw) 載入 ${year} 年政府辦公日曆表資料 (${data.length} 天)`);
        return;
      }
    }
  } catch (e) {
    console.warn(`管道 2 (GitHub Raw) 載入 ${year} 年失敗，嘗試管道 3`, e);
  }

  // 管道 3: 880831ian / pin-yi.me API 備援
  try {
    const res = await fetch(`https://api.pin-yi.me/taiwan-calendar/${year}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
          const y = item.date.substring(0, 4);
          const m = item.date.substring(4, 6);
          const d = item.date.substring(6, 8);
          const formattedDate = `${y}-${m}-${d}`;
          
          calendarDataMap[formattedDate] = {
            isHoliday: item.isHoliday === true || item.isHoliday === "true",
            description: item.caption || item.description || ''
          };
        });
        console.log(`已成功透過 管道 3 (880831ian API) 載入 ${year} 年台灣官方行事曆資料 (${data.length} 天)`);
        return;
      }
    }
  } catch (e) {
    console.warn(`管道 3 (pin-yi.me API) 載入失敗，將使用 config.json 靜態假日備援`, e);
  }
}

function initApp() {
  const todayStr = getTodayYYYYMMDD();
  lastRenderedDate = todayStr;
  
  // Set current month in picker
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
  document.getElementById('month-select').value = currentMonthStr;

  // Render Today's Duty
  renderTodayDuty(todayStr);

  // Render Schedule Table for current month
  renderMonthTable(currentMonthStr);

  // Setup Event Listeners
  setupEventListeners();
}

let listenersInitialized = false;
function setupEventListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  document.getElementById('month-select').addEventListener('change', (e) => {
    if (e.target.value) {
      renderMonthTable(e.target.value);
    }
  });

  const goToThisMonth = () => {
    const monthStr = getTodayYYYYMMDD().substring(0, 7);
    document.getElementById('month-select').value = monthStr;
    renderMonthTable(monthStr);
  };

  // 頂部按鈕事件
  document.getElementById('btn-this-month').addEventListener('click', goToThisMonth);
  document.getElementById('btn-prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => changeMonth(1));

  // 底部按鈕事件
  document.getElementById('btn-this-month-bottom').addEventListener('click', goToThisMonth);
  document.getElementById('btn-prev-month-bottom').addEventListener('click', () => changeMonth(-1));
  document.getElementById('btn-next-month-bottom').addEventListener('click', () => changeMonth(1));

  document.getElementById('btn-search-date').addEventListener('click', () => {
    const specificDate = document.getElementById('specific-date').value;
    if (!specificDate) return;
    const duty = calculateDutyForDate(specificDate, config);
    const box = document.getElementById('search-result-box');
    box.classList.remove('hidden');

    const dayOfWeekStr = getDayOfWeekStr(specificDate);
    if (!duty.isWorkday) {
      box.style.backgroundColor = '#fef2f2';
      box.style.borderColor = '#fca5a5';
      box.style.color = '#991b1b';
      const desc = duty.description ? ` (${duty.description})` : '';
      box.innerHTML = `🔍 <strong>${specificDate} (${dayOfWeekStr})</strong> 為 ${duty.type === 'weekend' ? '週末假日' : '國定假日/放假日'}${desc}，無需值日。`;
    } else {
      box.style.backgroundColor = '#ecfdf5';
      box.style.borderColor = '#a7f3d0';
      box.style.color = '#065f46';
      box.innerHTML = `🔍 <strong>${specificDate} (${dayOfWeekStr})</strong> 值日生：<strong>${duty.members.join(' + ')}</strong>`;
    }
  });
}

/**
 * 推播通知系統 (Web Notification API)
 */
let notificationTimer = null;

function setupNotificationSystem() {
  const toggle = document.getElementById('notification-toggle');
  const testBtn = document.getElementById('btn-test-notification');
  const statusMsg = document.getElementById('notification-status-msg');

  if (!('Notification' in window)) {
    statusMsg.innerText = '⚠️ 您的瀏覽器不支援 Web 推播通知功能。';
    toggle.disabled = true;
    return;
  }

  const isSavedEnabled = localStorage.getItem('duty_notification_enabled') === 'true';

  if (isSavedEnabled && Notification.permission === 'granted') {
    toggle.checked = true;
    testBtn.classList.remove('hidden');
    statusMsg.innerHTML = '✅ 每日 11:30 推播提醒已開啟。';
    scheduleDaily1130Check();
  } else {
    toggle.checked = false;
    testBtn.classList.add('hidden');
  }

  toggle.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem('duty_notification_enabled', 'true');
        testBtn.classList.remove('hidden');
        statusMsg.innerHTML = '✅ 成功開啟通知！系統將於有值日生的日子每日 11:30 發送提醒。';
        sendDutyNotification('🎉 推播提醒開啟成功', '系統已設定於每個工作日 11:30 自動發送值日生提醒！');
        scheduleDaily1130Check();
      } else {
        toggle.checked = false;
        localStorage.setItem('duty_notification_enabled', 'false');
        testBtn.classList.add('hidden');
        statusMsg.innerHTML = '❌ 瀏覽器通知權限被拒絕。請點選瀏覽器網址列旁的鎖頭圖示開啟通知權限。';
      }
    } else {
      localStorage.setItem('duty_notification_enabled', 'false');
      testBtn.classList.add('hidden');
      statusMsg.innerText = '已關閉每日推播提醒。';
      if (notificationTimer) clearTimeout(notificationTimer);
    }
  });

  testBtn.addEventListener('click', () => {
    const todayStr = getTodayYYYYMMDD();
    const duty = calculateDutyForDate(todayStr, config);
    if (duty.isWorkday) {
      sendDutyNotification('📅 今日值日生測試推播 (11:30)', `今日值日生：【${duty.members.join(' + ')}】`);
    } else {
      sendDutyNotification('🏖️ 今日放假無值日生', `今天（${todayStr}）為假日，無需派遣值日生。`);
    }
  });
}

function scheduleDaily1130Check() {
  if (notificationTimer) clearTimeout(notificationTimer);

  const now = new Date();
  const target = new Date();
  target.setHours(11, 30, 0, 0);

  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();
  console.log(`下一次 11:30 提醒將在 ${(delay / 1000 / 60).toFixed(1)} 分鐘後觸發`);

  notificationTimer = setTimeout(() => {
    trigger1130NotificationCheck();
    scheduleDaily1130Check();
  }, delay);
}

function trigger1130NotificationCheck() {
  if (localStorage.getItem('duty_notification_enabled') !== 'true') return;
  if (Notification.permission !== 'granted') return;

  const todayStr = getTodayYYYYMMDD();
  const duty = calculateDutyForDate(todayStr, config);

  if (duty.isWorkday && duty.members && duty.members.length > 0) {
    sendDutyNotification(
      '📅 今日值日生提醒 (11:30)',
      `今天（${todayStr}）的值日生是：【${duty.members.join(' + ')}】，請記得進行值日工作！`
    );
  }
}

function sendDutyNotification(title, body) {
  if (Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body: body,
        icon: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png',
        tag: 'duty-notification',
        renotify: true
      });
    });
  } else {
    new Notification(title, {
      body: body,
      icon: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png'
    });
  }
}

function getTodayYYYYMMDD() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayOfWeekStr(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return days[date.getDay()];
}

function changeMonth(offset) {
  const currentVal = document.getElementById('month-select').value;
  if (!currentVal) return;
  const [year, month] = currentVal.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newMonthStr = `${newYear}-${newMonth}`;
  document.getElementById('month-select').value = newMonthStr;
  renderMonthTable(newMonthStr);
}

function renderTodayDuty(todayStr) {
  const dayOfWeek = getDayOfWeekStr(todayStr);
  document.getElementById('today-date-display').innerText = `${todayStr} (星期${dayOfWeek})`;

  const duty = calculateDutyForDate(todayStr, config);
  const displayEl = document.getElementById('today-duty-display');
  const noteEl = document.getElementById('today-status-note');

  if (!duty.isWorkday) {
    const desc = duty.description ? ` - ${duty.description}` : '';
    displayEl.innerHTML = duty.type === 'weekend' ? '🎉 週末放假' : `🏖️ 國定假日 / 放假${desc}`;
    noteEl.innerText = '今天不需要派駐值日生';
  } else {
    displayEl.innerText = duty.members.join(' + ');
    noteEl.innerText = '';
  }
}

function renderMonthTable(yearMonthStr) {
  const [year, month] = yearMonthStr.split('-').map(Number);
  document.getElementById('table-title').innerText = `${year}年${month}月 值日生輪換表`;

  const tbody = document.getElementById('schedule-tbody');
  tbody.innerHTML = '';

  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = getTodayYYYYMMDD();

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${dayStr}`;
    const dayOfWeekStr = getDayOfWeekStr(dateStr);
    const duty = calculateDutyForDate(dateStr, config);

    const tr = document.createElement('tr');

    if (dateStr === todayStr) {
      tr.classList.add('today-row');
    }

    if (!duty.isWorkday) {
      if (duty.type === 'weekend') {
        tr.classList.add('weekend-row');
      } else {
        tr.classList.add('holiday-row');
      }
    }

    let statusText = '工作日';
    let membersText = duty.members.join(' + ');

    if (!duty.isWorkday) {
      const holidayDesc = duty.description ? ` (${duty.description})` : '';
      statusText = duty.type === 'weekend' ? '週末' : `國定假日${holidayDesc}`;
      membersText = '-';
    }

    tr.innerHTML = `
      <td>${month}/${day}</td>
      <td>(${dayOfWeekStr})</td>
      <td>${statusText}</td>
      <td><strong>${membersText}</strong></td>
    `;

    tbody.appendChild(tr);
  }
}

/**
 * 判斷單一日期是否為工作日
 */
function isWorkday(dateStr, cfg) {
  if (calendarDataMap[dateStr] !== undefined) {
    return !calendarDataMap[dateStr].isHoliday;
  }
  const dateObj = new Date(dateStr + 'T00:00:00');
  const dow = dateObj.getDay();
  const isWeekend = (dow === 0 || dow === 6);
  const isHoliday = (cfg.holidays && cfg.holidays.includes(dateStr));
  return (!isWeekend && !isHoliday);
}

/**
 * Core Algorithm: Calculate Duty Group for any given date
 */
function calculateDutyForDate(targetDateStr, cfg) {
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  const dayOfWeek = targetDate.getDay();

  // 1. 優先檢查是否在線上 API 資料快取中
  if (calendarDataMap[targetDateStr] !== undefined) {
    const dayData = calendarDataMap[targetDateStr];
    if (dayData.isHoliday) {
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      return { 
        isWorkday: false, 
        type: isWeekend ? 'weekend' : 'holiday',
        description: dayData.description || (cfg.holidays.includes(targetDateStr) ? '國定假日' : ''),
        members: [] 
      };
    }
  } else {
    // 2. 備援判斷：檢查週末與 config.json 靜態假日陣列
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { isWorkday: false, type: 'weekend', members: [] };
    }
    if (cfg.holidays && cfg.holidays.includes(targetDateStr)) {
      return { 
        isWorkday: false, 
        type: 'holiday', 
        description: '國定假日',
        members: [] 
      };
    }
  }

  const anchorDate = new Date(cfg.anchorDate + 'T00:00:00');
  const groupsCount = cfg.groups.length;

  let workdayCount = 0;

  if (targetDate >= anchorDate) {
    let curr = new Date(anchorDate);
    while (curr <= targetDate) {
      const currStr = formatDateYYYYMMDD(curr);
      if (isWorkday(currStr, cfg)) {
        workdayCount++;
      }
      curr.setDate(curr.getDate() + 1);
    }

    const groupIdx = (cfg.anchorGroupIndex + (workdayCount - 1)) % groupsCount;
    const finalIdx = (groupIdx + groupsCount) % groupsCount;
    return {
      isWorkday: true,
      members: cfg.groups[finalIdx].members
    };
  } else {
    // Target date is before anchor date
    let curr = new Date(anchorDate);
    curr.setDate(curr.getDate() - 1);
    while (curr >= targetDate) {
      const currStr = formatDateYYYYMMDD(curr);
      if (isWorkday(currStr, cfg)) {
        workdayCount++;
      }
      curr.setDate(curr.getDate() - 1);
    }

    const groupIdx = (cfg.anchorGroupIndex - workdayCount) % groupsCount;
    const finalIdx = (groupIdx + groupsCount) % groupsCount;
    return {
      isWorkday: true,
      members: cfg.groups[finalIdx].members
    };
  }
}

function formatDateYYYYMMDD(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 跨日自動刷新與頁面可見性/焦點恢復監聽系統
 */
function setupAutoRefreshOnDateChange() {
  // 1. 排定午夜跨日 (00:00:01) 自動刷新
  scheduleMidnightRefresh();

  if (autoRefreshListenersInitialized) return;
  autoRefreshListenersInitialized = true;

  // 2. 監聽頁面可見性改變 (例如從其他分頁切回，或裝置從休眠狀態喚醒)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAndRefreshIfDateChanged();
    }
  });

  // 3. 監聽視窗焦點獲得
  window.addEventListener('focus', () => {
    checkAndRefreshIfDateChanged();
  });
}

/**
 * 檢查系統日期是否改變，若改變則自動重新初始化畫面與更新推播排程
 */
function checkAndRefreshIfDateChanged() {
  const todayStr = getTodayYYYYMMDD();
  if (lastRenderedDate && todayStr !== lastRenderedDate) {
    console.log(`[Auto Refresh] 偵測到日期已變更 (${lastRenderedDate} -> ${todayStr})，正在自動更新畫面...`);
    initApp();
    
    // 如果開啟了每日推播，重新排定當日 11:30 推播通知
    if (localStorage.getItem('duty_notification_enabled') === 'true' && Notification.permission === 'granted') {
      scheduleDaily1130Check();
    }
  }
}

/**
 * 計算離下一個午夜 (00:00:01) 的時間差距，設定計時器於跨夜時刷新
 */
function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer);

  const now = new Date();
  // 將目標設為隔天凌晨 00:00:01
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  const delay = nextMidnight.getTime() - now.getTime();

  console.log(`[Auto Refresh] 下一次跨日自動更新排定在 ${(delay / 1000 / 3600).toFixed(2)} 小時後 (00:00:01)`);

  midnightTimer = setTimeout(() => {
    checkAndRefreshIfDateChanged();
    scheduleMidnightRefresh(); // 繼續排定下一天的午夜計時器
  }, delay);
}
