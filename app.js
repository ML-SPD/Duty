let config = null;
let calendarDataMap = {}; // 快取台灣官方行事曆資料 (Key: YYYY-MM-DD, Value: { isHoliday, description })

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('config.json');
    config = await res.json();

    // 自動讀取當年前後年份的台灣官方行事曆 (Taiwan Calendar / 政府開放資料 123662)
    const currentYear = new Date().getFullYear();
    await loadTaiwanCalendar(currentYear - 1);
    await loadTaiwanCalendar(currentYear);
    await loadTaiwanCalendar(currentYear + 1);

    initApp();
  } catch (err) {
    console.error('無法載入 config.json:', err);
    document.getElementById('today-duty-display').innerHTML = '<span style="color:red;">載入設定檔失敗</span>';
  }
});

/**
 * 讀取台灣行政院人事行政總處官方辦公日曆表
 * 資料來源：政府資料開放平臺 Dataset 123662 & TaiwanCalendar 開放專案
 */
async function loadTaiwanCalendar(year) {
  // 管道 A: TaiwanCalendar (基於政府 123662 資料集)
  try {
    const res = await fetch(`https://raw.githubusercontent.com/ruyut/TaiwanCalendar/master/data/${year}.json`);
    if (res.ok) {
      const data = await res.json();
      data.forEach(item => {
        const y = item.date.substring(0, 4);
        const m = item.date.substring(4, 6);
        const d = item.date.substring(6, 8);
        const formattedDate = `${y}-${m}-${d}`;
        
        calendarDataMap[formattedDate] = {
          isHoliday: item.isHoliday,
          description: item.description || ''
        };
      });
      console.log(`已成功載入 ${year} 年政府辦公日曆表資料 (${data.length} 天)`);
      return;
    }
  } catch (e) {
    console.warn(`管道 A (TaiwanCalendar) 載入 ${year} 年失敗，嘗試備援管道`, e);
  }

  // 管道 B: 政府資料開放平臺 123662 API 備援
  try {
    const res = await fetch(`https://data.ntpc.gov.tw/api/datasets/30823960-0934-4062-9f4e-7b32d3d40e5f/json?page=0&size=1000`);
    if (res.ok) {
      const data = await res.json();
      data.forEach(item => {
        if (!item.date) return;
        // 轉格式 YYYYMMDD -> YYYY-MM-DD
        const dateStr = item.date;
        const formattedDate = dateStr.length === 8 ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` : item.date;
        const isHoliday = item.isHoliday === "是" || item.isHoliday === true || item.isHoliday === "1";
        
        calendarDataMap[formattedDate] = {
          isHoliday: isHoliday,
          description: item.name || item.description || ''
        };
      });
      console.log(`已成功透過政府 123662 API 載入行事曆資料`);
    }
  } catch (e) {
    console.warn(`管道 B (政府 123662 API) 載入失敗，將使用 config.json 與週末備援`, e);
  }
}

function initApp() {
  const todayStr = getTodayYYYYMMDD();
  
  // Set current month in picker
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
  document.getElementById('month-select').value = currentMonthStr;

  // Render Today's Duty
  renderTodayDuty(todayStr);

  // Render Schedule Table for current month
  renderMonthTable(currentMonthStr);

  // Setup Event Listeners
  document.getElementById('month-select').addEventListener('change', (e) => {
    if (e.target.value) {
      renderMonthTable(e.target.value);
    }
  });

  document.getElementById('btn-this-month').addEventListener('click', () => {
    const monthStr = getTodayYYYYMMDD().substring(0, 7);
    document.getElementById('month-select').value = monthStr;
    renderMonthTable(monthStr);
  });

  document.getElementById('btn-prev-month').addEventListener('click', () => {
    changeMonth(-1);
  });

  document.getElementById('btn-next-month').addEventListener('click', () => {
    changeMonth(1);
  });

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

  // 1. 檢查是否為假日
  if (calendarDataMap[targetDateStr] !== undefined) {
    const dayData = calendarDataMap[targetDateStr];
    if (dayData.isHoliday) {
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      return { 
        isWorkday: false, 
        type: isWeekend ? 'weekend' : 'holiday',
        description: dayData.description,
        members: [] 
      };
    }
  } else {
    // 備援判斷
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { isWorkday: false, type: 'weekend', members: [] };
    }
    if (cfg.holidays && cfg.holidays.includes(targetDateStr)) {
      return { isWorkday: false, type: 'holiday', members: [] };
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
