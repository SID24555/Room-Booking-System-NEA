//utils.js - hashing, dates, holidays, week A/B, merge sort, stats, room search, slot indexes

//returns hex string of sha-256 hash of message for password hashing
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

//128-bit salt (hex); used for salted password hashing
function generateSaltHex(bytes = 16) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

//derives password hash using salt for secure storage
async function hashPasswordWithSalt(password, saltHex) {
    return sha256(`${saltHex}:${password}`);
}

//returns true if user record uses salted password scheme
function userHasSalt(userRecord) {
    return !!(userRecord && typeof userRecord.salt === 'string' && userRecord.salt.length > 0);
}

//local date YYYY-MM-DD for calendar and HOLIDAYS comparison
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

//returns locale date string for display (e.g. Mon, 27 Jan)
function formatDateDisplay(date) {
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

//Monday of the week; returns new Date, does not mutate input
function getMonday(date) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1);
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
}

//returns new date offset by given days without mutating input
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

//returns holiday object { name, start, end } or null; uses formatDate for comparison
function isHoliday(date) {
    const dateStr = formatDate(date);
    for (const holiday of HOLIDAYS) {
        if (dateStr >= holiday.start && dateStr <= holiday.end) {
            return holiday;
        }
    }
    return null;
}

//same as isHoliday but accepts YYYY-MM-DD string
function getHolidayForISODate(isoDate) {
    for (const holiday of HOLIDAYS) {
        if (isoDate >= holiday.start && isoDate <= holiday.end) {
            return holiday;
        }
    }
    return null;
}

//returns true if date is Saturday or Sunday
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

//true if any Mon–Fri in week is not a holiday; uses getMonday + addDays, no mutation
function weekHasSchoolDay(weekStartDate) {
    const monday = getMonday(weekStartDate);
    for (let i = 0; i < 5; i++) {
        const day = addDays(monday, i);
        if (!isHoliday(day)) return true;
    }
    return false;
}

//Week A/B or Holiday; full-holiday week -> Holiday, partial -> A/B; holiday weeks skipped in count
function getWeekABLabel(weekStart) {
    const start = getMonday(WEEK_A_START);
    const target = getMonday(weekStart);
    start.setHours(12, 0, 0, 0);
    target.setHours(12, 0, 0, 0);

    if (!weekHasSchoolDay(target)) {
        return { label: 'Holiday', isHoliday: true };
    }

    const direction = target >= start ? 1 : -1;
    let count = 0;
    let cursor = new Date(start);

    while ((direction === 1 && cursor < target) || (direction === -1 && cursor > target)) {
        cursor.setDate(cursor.getDate() + 7 * direction);
        if (weekHasSchoolDay(cursor)) count++;
    }

    const isWeekA = (count % 2 === 0);
    return { label: isWeekA ? 'Week A' : 'Week B', isHoliday: false };
}

//returns true if date is the current calendar day
function isToday(date) {
    const today = new Date();
    return formatDate(date) === formatDate(today);
}


//returns unique short id for new records
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

//sorts array by key using merge sort (stable by date for bookings)
function mergeSort(arr, key) {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    const left = mergeSort(arr.slice(0, mid), key);
    const right = mergeSort(arr.slice(mid), key);
    return merge(left, right, key);
}

//merges two sorted arrays by key for merge sort
function merge(left, right, key) {
    const result = [];
    let i = 0, j = 0;
    while (i < left.length && j < right.length) {
        if (left[i][key] <= right[j][key]) {
            result.push(left[i++]);
        } else {
            result.push(right[j++]);
        }
    }
    return result.concat(left.slice(i)).concat(right.slice(j));
}

//computes mean, median and standard deviation for admin stats
function calculateStats(values) {
    if (values.length === 0) return { avg: 0, median: 0, std: 0 };

    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(avgSquareDiff);

    return { avg: avg.toFixed(2), median: median.toFixed(2), std: std.toFixed(2) };
}

//skips holidays and weekends; weekly or biweekly up to maxWeeks
function generateRecurringDates(startDate, type, maxWeeks) {
    const dates = [];
    const daysToAdd = type === 'weekly' ? 7 : 14;
    const currentDate = new Date(startDate);

    maxWeeks = maxWeeks || 8;

    for (let week = 0; week < maxWeeks * 2; week++) {
        if (dates.length >= maxWeeks) break;

        if (week > 0) {
            currentDate.setDate(currentDate.getDate() + daysToAdd);
        }

        if (!isHoliday(currentDate) && !isWeekend(currentDate)) {
            dates.push(formatDate(currentDate));
        }
    }

    return dates;
}

//shows temporary toast notification with success, error or warning styling
function showToast(message, type) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    type = type || 'success';

    toast.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all transform';

    if (type === 'success') {
        toast.classList.add('bg-green-500', 'text-white');
    } else if (type === 'error') {
        toast.classList.add('bg-red-500', 'text-white');
    } else {
        toast.classList.add('bg-yellow-400', 'text-green-900');
    }

    toastMessage.textContent = message;
    toast.classList.remove('hidden', 'translate-y-full');

    setTimeout(() => {
        toast.classList.add('translate-y-full');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

//normalises room name to uppercase trimmed for sorting and search
function normalizeRoomName(name) {
    return (name || '').trim().toUpperCase();
}

//cached sorted copy by name; invalidated when source or length changes
let _roomsSortedByNameCache = null;
let _roomsSortedByNameCacheSource = null;
let _roomsSortedByNameCacheLen = 0;

//returns rooms sorted by name, using cache to avoid repeated sorts
function getRoomsSortedByNameOnce(rooms) {
    if (!Array.isArray(rooms)) return [];

    if (_roomsSortedByNameCacheSource !== rooms || !_roomsSortedByNameCache || _roomsSortedByNameCacheLen !== rooms.length) {
        _roomsSortedByNameCacheSource = rooms;
        _roomsSortedByNameCacheLen = rooms.length;
        _roomsSortedByNameCache = [...rooms].sort((a, b) => {
            return normalizeRoomName(a.name).localeCompare(normalizeRoomName(b.name));
        });
    }

    return _roomsSortedByNameCache;
}

//finds room by name in sorted list using binary search
function binarySearchRoomByName(sortedRooms, targetName) {
    if (!Array.isArray(sortedRooms) || sortedRooms.length === 0) return null;

    const target = normalizeRoomName(targetName);
    if (!target) return null;

    let left = 0;
    let right = sortedRooms.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midName = normalizeRoomName(sortedRooms[mid] && sortedRooms[mid].name);

        if (midName === target) {
            return sortedRooms[mid] || null;
        }

        if (midName < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    return null;
}

//gets room by id using name hint for binary search when available
function getRoomByIdWithBinarySearch(roomId, roomNameHint) {
    const sortedRooms = getRoomsSortedByNameOnce(typeof ROOMS !== 'undefined' ? ROOMS : []);

    if (roomNameHint) {
        const roomByName = binarySearchRoomByName(sortedRooms, roomNameHint);
        if (roomByName && roomByName.id === roomId) return roomByName;
    }

    const roomLinear = (typeof ROOMS !== 'undefined' && Array.isArray(ROOMS))
        ? ROOMS.find(r => r.id === roomId)
        : null;

    if (!roomLinear) return null;

    return binarySearchRoomByName(sortedRooms, roomLinear.name) || roomLinear;
}

//returns full room display name: booking.roomName if present, else ROOMS lookup by roomId
function getRoomDisplayName(booking) {
    if (!booking) return '';
    const name = booking.roomName || booking.room_name;
    if (name) return name;
    const room = (typeof ROOMS !== 'undefined' && Array.isArray(ROOMS))
        ? ROOMS.find(r => r.id === (booking.roomId || booking.room_id))
        : null;
    return room ? room.name : (booking.roomId || booking.room_id || '');
}

//builds unique key for one booking per room/date/period (e.g. hall) conflict checks
function makeSlotKey(roomId, dateISO, periodId) {
    return `${roomId}|${dateISO}|${periodId}`;
}

//returns true for room types that allow only one booking per slot (e.g. Sports Hall)
function isExclusiveSlotRoom(roomId) {
    const room = (typeof ROOMS !== 'undefined' && Array.isArray(ROOMS))
        ? ROOMS.find(r => r.id === roomId)
        : null;
    return !!(room && room.type === 'hall');
}

//builds set of occupied slot keys from bookings for exclusive-slot rooms
function rebuildOccupiedSlotKeys(bookings) {
    const occupiedSlotKeys = new Set();

    if (!Array.isArray(bookings)) return occupiedSlotKeys;

    bookings.forEach(b => {
        if (b && isExclusiveSlotRoom(b.roomId)) {
            occupiedSlotKeys.add(makeSlotKey(b.roomId, b.date, b.period));
        }
    });

    return occupiedSlotKeys;
}

//normalises seat string (e.g. "1, 2, 3" or "1,2,3") to Set of integers; handles empty/null
function seatsToSet(seats) {
    const seatSet = new Set();
    if (seats == null || seats === '') return seatSet;
    const str = String(seats).trim();
    if (!str) return seatSet;
    str.split(',').forEach(part => {
        const num = parseInt(part.trim(), 10);
        if (!isNaN(num)) seatSet.add(num);
    });
    return seatSet;
}

//returns set of seat numbers already booked for a slot to prevent double booking
function getBookedSeatsForSlot(bookings, roomId, dateISO, periodId) {
    const bookedSeatsForSlot = new Set();

    if (!Array.isArray(bookings)) return bookedSeatsForSlot;

    bookings.forEach(b => {
        if (!b) return;
        if (b.roomId !== roomId || b.date !== dateISO || b.period !== periodId) return;
        seatsToSet(b.seats).forEach(seatNum => bookedSeatsForSlot.add(seatNum));
    });

    return bookedSeatsForSlot;
}

//repopulates occupied slot keys from stored bookings after load
function rebuildBookingIndexesFromStorage() {
    if (typeof appState === 'undefined') return;

    if (!appState.bookingIndexes) {
        appState.bookingIndexes = { occupiedSlotKeys: new Set() };
    }

    appState.bookingIndexes.occupiedSlotKeys = rebuildOccupiedSlotKeys(getBookings());
}

//adds one booking's slot to occupied set when creating (exclusive-slot rooms only)
function addBookingToOccupiedSlotKeys(booking) {
    if (!booking || typeof appState === 'undefined') return;
    if (!appState.bookingIndexes || !appState.bookingIndexes.occupiedSlotKeys) return;

    if (isExclusiveSlotRoom(booking.roomId)) {
        appState.bookingIndexes.occupiedSlotKeys.add(makeSlotKey(booking.roomId, booking.date, booking.period));
    }
}

//removes slot from occupied set when last booking for that slot is deleted
function removeBookingFromOccupiedSlotKeys(booking) {
    if (!booking || typeof appState === 'undefined') return;
    if (!appState.bookingIndexes || !appState.bookingIndexes.occupiedSlotKeys) return;

    if (!isExclusiveSlotRoom(booking.roomId)) return;

    const slotKey = makeSlotKey(booking.roomId, booking.date, booking.period);

    const stillOccupied = getBookings().some(b =>
        b.roomId === booking.roomId && b.date === booking.date && b.period === booking.period
    );

    if (!stillOccupied) {
        appState.bookingIndexes.occupiedSlotKeys.delete(slotKey);
    }
}
