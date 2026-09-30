//storage.js - localStorage load/save, data accessors, user/booking/audit mutations

const STORAGE_KEY = 'herschel_booking_data';

//reads and parses app data from localStorage, returns empty array on error
function loadDataFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

//writes app data to localStorage as JSON
function saveDataToStorage(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch (error) {
        return false;
    }
}

//loads or saves data, normalises records, rebuilds indexes and refreshes visible UI
function updateAppData(newData) {
    if (newData !== undefined) {
        appState.allData = newData;
        saveDataToStorage(newData);
    } else {
        appState.allData = loadDataFromStorage();
    }

    if (!Array.isArray(appState.allData)) {
        appState.allData = [];
        saveDataToStorage(appState.allData);
    }

    let changed = false;

    for (const item of appState.allData) {
        if (!item || typeof item !== 'object') continue;

        if (item.type === 'user') {
            if (item.salt == null) {
                item.salt = '';
                changed = true;
            }
            if (item.hashed_password == null && item.passwordHash != null) {
                item.hashed_password = item.passwordHash;
                changed = true;
            }
            if (item.date_created == null && item.createdAt != null) {
                item.date_created = item.createdAt;
                changed = true;
            }
        }

        if (item.type === 'booking') {
            if (item.dismissedTodayReminder == null) {
                item.dismissedTodayReminder = false;
                changed = true;
            }
            if (item.dismissedUrgentReminder == null) {
                item.dismissedUrgentReminder = false;
                changed = true;
            }
        }
    }

    if (changed) {
        saveDataToStorage(appState.allData);
    }

    if (!newData || !appState.bookingIndexes || !appState.bookingIndexes.occupiedSlotKeys) {
        rebuildBookingIndexesFromStorage();
    }

    if (appState.currentUser) {
        const updatedUser = getUsers().find(u => u.id === appState.currentUser.id);
        if (updatedUser) {
            appState.currentUser = createUserInstance(updatedUser);
        }

        if (!document.getElementById('calendar-section').classList.contains('hidden')) {
            rerender();
        }
        if (!document.getElementById('my-bookings-section').classList.contains('hidden')) {
            renderMyBookings();
        }
        if (!document.getElementById('admin-section').classList.contains('hidden')) {
            if (!document.getElementById('admin-stats-panel').classList.contains('hidden')) {
                renderAdminStats();
            }
            if (!document.getElementById('admin-audit-panel').classList.contains('hidden')) {
                renderAuditLog();
            }
            if (!document.getElementById('admin-users-panel').classList.contains('hidden')) {
                renderUserManagement();
            }
        }
    }
}

//returns all user records from app state
function getUsers() {
    return appState.allData.filter(item => item && item.type === 'user');
}

//returns all booking records from app state
function getBookings() {
    return appState.allData.filter(item => item && item.type === 'booking');
}

//returns all audit log entries from app state
function getAuditLogs() {
    return appState.allData.filter(item => item && item.type === 'audit');
}

//adds new user to app data and logs registration
function createUser(userData) {
    const newUser = {
        id: generateId(),
        type: 'user',
        name: userData.name,
        email: userData.email,
        hashed_password: userData.hashed_password,
        initials: userData.initials,
        role: userData.role,
        approved: userData.approved,
        date_created: new Date().toISOString(),
        salt: userData.salt || ''
    };

    appState.allData.push(newUser);
    updateAppData(appState.allData);
    logAudit('USER_REGISTERED', `New ${userData.role} registration: ${userData.name}`);
    return true;
}

//adds new booking to app data, updates slot index and logs creation
function createBooking(bookingData) {
    const newBooking = {
        id: generateId(),
        type: 'booking',
        roomId: bookingData.roomId || bookingData.room_id,
        roomName: bookingData.roomName || bookingData.room_name,
        date: bookingData.date,
        period: bookingData.period,
        purpose: bookingData.purpose,
        userId: bookingData.userId || bookingData.user_id,
        userName: bookingData.userName || bookingData.user_name,
        isRecurring: bookingData.isRecurring || bookingData.is_recurring || false,
        recurrenceId: bookingData.recurrenceId || bookingData.recurrence_id || '',
        seats: bookingData.seats || '',
        date_created: new Date().toISOString(),
        dismissedTodayReminder: bookingData.dismissedTodayReminder === true,
        dismissedUrgentReminder: bookingData.dismissedUrgentReminder === true
    };

    appState.allData.push(newBooking);
    addBookingToOccupiedSlotKeys(newBooking);
    updateAppData(appState.allData);
    logAudit('BOOKING_CREATED', `${newBooking.userName} booked ${newBooking.roomName} on ${newBooking.date} ${newBooking.period}`);
    return true;
}

//removes booking from app data, updates slot index and logs deletion
function deleteBooking(booking) {
    const index = appState.allData.findIndex(item => item && item.id === booking.id);
    if (index > -1) {
        const removed = appState.allData.splice(index, 1)[0];
        try {
            removeBookingFromOccupiedSlotKeys(removed);
        } catch (_) {}
        updateAppData(appState.allData);
        logAudit('BOOKING_DELETED', `${booking.userName} cancelled ${booking.roomName} on ${booking.date}`);
        return true;
    }
    return false;
}

//removes user and all their bookings, returns counts
function deleteUserAndBookings(userId) {
    if (!userId) return { removedUser: false, deletedBookings: 0 };

    let deletedBookings = 0;

    for (let i = appState.allData.length - 1; i >= 0; i--) {
        const item = appState.allData[i];
        if (item && item.type === 'booking' && (item.userId || item.user_id) === userId) {
            const removed = appState.allData.splice(i, 1)[0];
            deletedBookings++;
            try {
                removeBookingFromOccupiedSlotKeys(removed);
            } catch (_) {}
        }
    }

    const userIndex = appState.allData.findIndex(item => item && item.type === 'user' && item.id === userId);
    const removedUser = userIndex > -1;
    if (removedUser) {
        appState.allData.splice(userIndex, 1);
    }

    if (deletedBookings > 0 || removedUser) {
        updateAppData(appState.allData);
    }

    return { removedUser, deletedBookings };
}

//updates existing user in app data and persists
function updateUser(user) {
    const index = appState.allData.findIndex(item => item && item.id === user.id);
    if (index > -1) {
        appState.allData[index] = user;
        updateAppData(appState.allData);
        return true;
    }
    return false;
}

//appends audit entry with action, details and timestamp to app data
function logAudit(action, details) {
    //timestamped audit object
    const auditEntry = {
        id: generateId(),
        type: 'audit',
        action,
        details,
        timestamp: new Date().toISOString(),
        userName: appState.currentUser ? appState.currentUser.name : 'System'
    };

    appState.allData.push(auditEntry);
    updateAppData(appState.allData);
}
