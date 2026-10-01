let config = null;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('config.json');
    config = await res.json();

    // 自動讀取當年前後年份的國定假日 API (若網路正常)
    const currentYear = new Date().getFullYear();
    await loadAutoHolidays(currentYear);
    await loadAutoHolidays(currentYear + 1);

    initApp();
  } catch (err) {
    console.error('無法載入 config.json:', err);
    document.getElementById('today-duty-display').innerHTML = '<span style="color:red;">載入設定檔失敗</span>';
  }
});

/**
 * 新增函式：自動線上讀取國定假日 API (如 date.nager.at / 台灣國定假日)
 */
async function loadAutoHolidays(year) {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/TW`);
    if (res.ok) {
      const data = await res.json();
      const apiHolidays = data.map(item => item.date);
      const combined = new Set([...(config.holidays || []), ...apiHolidays]);
      config.holidays = Array.from(combined);
    }
  } catch (e) {
    console.warn(`自動讀取 ${year} 年國定假日 API 失敗，將使用 config.json 的預設假日清單`, e);
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
      box.innerHTML = `🔍 <strong>${specificDate} (${dayOfWeekStr})</strong> 為 ${duty.type === 'weekend' ? '週末假日' : '國定假日/放假日'}，無需值日。`;
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
  const dateObj = new Date(todayStr + 'T00:00:00');
  const dayOfWeek = getDayOfWeekStr(todayStr);
  document.getElementById('today-date-display').innerText = `${todayStr} (星期${dayOfWeek})`;

  const duty = calculateDutyForDate(todayStr, config);
  const displayEl = document.getElementById('today-duty-display');
  const noteEl = document.getElementById('today-status-note');

  if (!duty.isWorkday) {
    displayEl.innerHTML = duty.type === 'weekend' ? '🎉 週末放假' : '🏖️ 國定假日 / 放假';
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
      statusText = duty.type === 'weekend' ? '週末' : '國定假日';
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
 * Core Algorithm: Calculate Duty Group for any given date
 */
function calculateDutyForDate(targetDateStr, cfg) {
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  const dayOfWeek = targetDate.getDay();

  // 1. Check Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isWorkday: false, type: 'weekend', members: [] };
  }

  // 2. Check Excluded Holiday
  if (cfg.holidays && cfg.holidays.includes(targetDateStr)) {
    return { isWorkday: false, type: 'holiday', members: [] };
  }

  const anchorDate = new Date(cfg.anchorDate + 'T00:00:00');
  const groupsCount = cfg.groups.length;

  let workdayCount = 0;

  if (targetDate >= anchorDate) {
    let curr = new Date(anchorDate);
    while (curr <= targetDate) {
      const currStr = formatDateYYYYMMDD(curr);
      const dow = curr.getDay();
      const isWeekend = (dow === 0 || dow === 6);
      const isHoliday = (cfg.holidays && cfg.holidays.includes(currStr));

      if (!isWeekend && !isHoliday) {
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
      const dow = curr.getDay();
      const isWeekend = (dow === 0 || dow === 6);
      const isHoliday = (cfg.holidays && cfg.holidays.includes(currStr));

      if (!isWeekend && !isHoliday) {
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
