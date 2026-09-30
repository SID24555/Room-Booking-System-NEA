//ui.js - main UI (auth/calendar/bookings/admin), timetable, modals, user management

//shows login/register screen and hides all other sections
function showAuthUI() {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('calendar-section').classList.add('hidden');
    document.getElementById('my-bookings-section').classList.add('hidden');
    document.getElementById('admin-section').classList.add('hidden');
    document.getElementById('user-nav').classList.add('hidden');
    document.getElementById('reminder-banner').classList.add('hidden');
}

//shows main app with user bar and calendar after successful login
function showLoggedInUI() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('user-nav').classList.remove('hidden');

    const user = appState.currentUser;
    const permissions = user.getPermissions();

    document.getElementById('user-display').textContent = user.name + ' (' + user.initials + ') - ' + user.role.charAt(0).toUpperCase() + user.role.slice(1);

    if (permissions.canManageUsers) {
        document.getElementById('nav-admin').classList.remove('hidden');
    } else {
        document.getElementById('nav-admin').classList.add('hidden');
    }

    updateUndoButton();

    showCalendar();
}

//switches to calendar view and renders current week
function showCalendar() {
    document.getElementById('calendar-section').classList.remove('hidden');
    document.getElementById('my-bookings-section').classList.add('hidden');
    document.getElementById('admin-section').classList.add('hidden');

    if (!appState.currentWeekStart) {
        appState.currentWeekStart = getMonday(new Date());
    }

    rerender();
}

//updates the week range and week A/B label in the calendar header
function updateHeader(weekStart) {
    document.getElementById('current-week-display').textContent =
        formatDateDisplay(weekStart) + ' - ' + formatDateDisplay(addDays(weekStart, 4));
    const weekIndicator = document.getElementById('week-indicator');
    const weekLabel = getWeekABLabel(appState.currentWeekStart);
    weekIndicator.textContent = weekLabel.label;
}

//refreshes calendar header and timetable for the current week
function rerender() {
    updateHeader(appState.currentWeekStart);
    renderTimetable();
}

//switches to my bookings view and lists current user's upcoming bookings
function showMyBookings() {
    document.getElementById('calendar-section').classList.add('hidden');
    document.getElementById('my-bookings-section').classList.remove('hidden');
    document.getElementById('admin-section').classList.add('hidden');

    renderMyBookings();
}

//switches to admin panel and displays stats
function showAdmin() {
    document.getElementById('calendar-section').classList.add('hidden');
    document.getElementById('my-bookings-section').classList.add('hidden');
    document.getElementById('admin-section').classList.remove('hidden');

    renderAdminStats();
}

//builds the week grid with period rows, date columns, room filter and booking chips
function renderTimetable() {
    const weekStart = appState.currentWeekStart;
    const headerDates = WEEK_DAYS.map(day => addDays(weekStart, day.key));

    const roomFilter = document.getElementById('room-filter');
    const currentValue = roomFilter.value;
    roomFilter.innerHTML = '<option value="all">All Rooms</option>';
    ROOMS.forEach(room => {
        roomFilter.innerHTML += '<option value="' + room.id + '">' + room.name + '</option>';
    });
    roomFilter.value = currentValue || 'all';

    const header = document.getElementById('calendar-header');
    header.innerHTML = '<th class="p-3 text-left font-medium w-32">Period</th>';

    headerDates.forEach(date => {
        const holidayObj = isHoliday(date);
        const todayClass = isToday(date) ? 'bg-yellow-500' : '';

        header.innerHTML += `
          <th class="p-3 text-center font-medium ${todayClass}">
            ${formatDateDisplay(date)}
            ${holidayObj !== null ? '<br><span class="text-xs">' + holidayObj.name + '</span>' : ''}
          </th>
        `;
    });

    const body = document.getElementById('calendar-body');
    body.innerHTML = '';

    const filteredRoom = roomFilter.value;
    let roomsToShow;

    if (filteredRoom === 'all') {
        roomsToShow = ROOMS;
    } else {
        const selectedOption = roomFilter.options[roomFilter.selectedIndex];
        const nameHint = selectedOption ? selectedOption.textContent : '';
        const sortedRooms = getRoomsSortedByNameOnce(ROOMS);
        const roomByBinary = binarySearchRoomByName(sortedRooms, nameHint);

        roomsToShow = roomByBinary ? [roomByBinary] : ROOMS.filter(r => r.id === filteredRoom);
    }

    PERIODS.forEach(period => {
        const row = document.createElement('tr');
        row.className = 'border-t';

        row.innerHTML = `
          <td class="p-2 bg-gray-50">
            <div class="font-medium text-sm">${period.name}</div>
            <div class="text-xs text-gray-500">${period.time}</div>
          </td>
        `;

        headerDates.forEach(date => {
            const dateStr = formatDate(date);
            const holidayObj = isHoliday(date);
            const todayBg = isToday(date) ? 'bg-yellow-50' : '';

            if (holidayObj !== null) {
                row.innerHTML += `
              <td class="p-2 bg-gray-200 text-center text-sm text-gray-500">
                Holiday
              </td>
            `;
            } else {
                let cellContent = '';

                roomsToShow.forEach(room => {
                    const bookings = getBookings().filter(b =>
                        b.date === dateStr &&
                        b.period === period.id &&
                        b.roomId === room.id
                    );

                    bookings.forEach(booking => {
                        const isOwn = booking.userId === (appState.currentUser ? appState.currentUser.id : null);
                        const bgColor = isOwn ? 'bg-green-500' : 'bg-red-500';
                        const initials = booking.initials || booking.userName.substring(0, 3).toUpperCase();

                        cellContent += `
                  <div class="${bgColor} text-white text-xs px-2 py-1 rounded mb-1 truncate" title="${getRoomDisplayName(booking)} - ${booking.purpose} - ${booking.userName}">
                    ${room.name} - ${initials}
                  </div>
                `;
                    });
                });

                row.innerHTML += `
              <td class="p-1 ${todayBg} booking-cell cursor-pointer hover:bg-green-50 transition align-top"
                  data-date="${dateStr}" data-period="${period.id}">
                ${cellContent}
                <div class="text-xs text-gray-400 text-center">+ Click to book</div>
              </td>
            `;
            }
        });

        body.appendChild(row);
    });

    body.querySelectorAll('[data-date]').forEach(cell => {
        cell.addEventListener('click', () => {
            openBookingModal(cell.dataset.date, cell.dataset.period);
        });
    });
}

//lists current user's future bookings with cancel button where allowed
function renderMyBookings() {
    const bookings = getBookings().filter(b => b.userId === (appState.currentUser ? appState.currentUser.id : null));
    const sortedBookings = mergeSort(bookings, 'date');
    const futureBookings = sortedBookings.filter(b => b.date >= formatDate(new Date()));

    const list = document.getElementById('my-bookings-list');
    const noBookings = document.getElementById('no-bookings');

    if (futureBookings.length === 0) {
        list.innerHTML = '';
        noBookings.classList.remove('hidden');
        return;
    }

    noBookings.classList.add('hidden');
    list.innerHTML = '';

    futureBookings.forEach(booking => {
        const date = new Date(booking.date);
        const period = PERIODS.find(p => p.id === booking.period);

        const canDelete = appState.currentUser ? appState.currentUser.canDelete() : false;

        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition';

        item.innerHTML = `
          <div class="flex-1">
            <div class="font-medium text-green-800">${getRoomDisplayName(booking)}</div>
            <div class="text-sm text-gray-600">${formatDateDisplay(date)} - ${period ? period.name : booking.period}</div>
            <div class="text-sm text-gray-500">${booking.purpose}</div>
            ${booking.seats ? '<div class="text-xs text-gray-400">Seats: ' + booking.seats + '</div>' : ''}
            ${booking.isRecurring ? '<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Recurring</span>' : ''}
          </div>
          ${canDelete ? `
            <button class="delete-booking-btn px-3 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg text-sm transition" data-id="${booking.id}">
              Cancel
            </button>
          ` : ''}
        `;

        list.appendChild(item);
    });

    list.querySelectorAll('.delete-booking-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const booking = getBookings().find(b => b.id === btn.dataset.id);
            if (booking) {
                confirmDeleteBooking(booking);
            }
        });
    });
}

//fills admin stats panel with booking counts, popular room, busy period and user statistics
function renderAdminStats() {
    const bookings = getBookings();
    const users = getUsers().filter(u => u.approved);
    const futureBookings = bookings.filter(b => b.date >= formatDate(new Date()));
    //total upcoming bookings
    document.getElementById('stat-total-bookings').textContent = futureBookings.length;

    //most booked room
    const roomCounts = {};
    bookings.forEach(b => {
        const rn = getRoomDisplayName(b);
        roomCounts[rn] = (roomCounts[rn] || 0) + 1;
    });
    const popularRoom = Object.entries(roomCounts).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('stat-popular-room').textContent = popularRoom ? popularRoom[0] : '-';


    //most booked period
    const periodCounts = {};
    bookings.forEach(b => {
        periodCounts[b.period] = (periodCounts[b.period] || 0) + 1;
    });
    const busyPeriod = Object.entries(periodCounts).sort((a, b) => b[1] - a[1])[0];
    const busyPeriodObj = busyPeriod ? PERIODS.find(p => p.id === busyPeriod[0]) : null;
    document.getElementById('stat-busy-period').textContent = busyPeriodObj ? busyPeriodObj.name : '-';

    const teacherBookings = {};
    bookings.filter(b => {
        const user = getUsers().find(u => u.id === b.userId);
        return user && user.role === 'teacher';
    }).forEach(b => {
        teacherBookings[b.userName] = (teacherBookings[b.userName] || 0) + 1;
    });
    const activeTeacher = Object.entries(teacherBookings).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('stat-active-teacher').textContent = activeTeacher ? activeTeacher[0] : '-';

    const userBookingCounts = users.map(u =>
        bookings.filter(b => b.userId === u.id).length
    ).filter(c => c > 0);

    const stats = calculateStats(userBookingCounts);
    document.getElementById('stat-avg-bookings').textContent = stats.avg;
    document.getElementById('stat-median-bookings').textContent = stats.median;
    document.getElementById('stat-std-bookings').textContent = stats.std;
}

//displays latest audit entries with action type and timestamp
function renderAuditLog() {
    const logs = getAuditLogs();
    const sortedLogs = mergeSort(logs, 'timestamp').reverse().slice(0, 50);

    const list = document.getElementById('audit-log-list');
    list.innerHTML = '';

    if (sortedLogs.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-center py-4">No audit entries yet</p>';
        return;
    }

    sortedLogs.forEach(log => {
        const date = new Date(log.timestamp);
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 bg-gray-50 rounded text-sm';

        let actionColor = 'bg-gray-200 text-gray-700';
        if (log.action.includes('CREATE') || log.action.includes('LOGIN')) {
            actionColor = 'bg-green-100 text-green-700';
        } else if (log.action.includes('DELETE') || log.action.includes('REJECT')) {
            actionColor = 'bg-red-100 text-red-700';
        } else if (log.action.includes('APPROVE')) {
            actionColor = 'bg-blue-100 text-blue-700';
        }

        item.innerHTML = `
          <div class="flex-1">
            <span class="${actionColor} px-2 py-0.5 rounded text-xs font-medium mr-2">${log.action}</span>
            <span class="text-gray-600">${log.details}</span>
          </div>
          <span class="text-gray-400 text-xs">${date.toLocaleString()}</span>
        `;

        list.appendChild(item);
    });
}

//displays pending and approved users in admin dashboard with approval and remove controls
function renderUserManagement() {
    const users = getUsers();
    const pendingUsers = users.filter(u => !u.approved);
    const approvedUsers = users.filter(u => u.approved);

    const pendingList = document.getElementById('pending-users-list');
    const noPending = document.getElementById('no-pending');

    if (pendingUsers.length === 0) {
        pendingList.innerHTML = '';
        noPending.classList.remove('hidden');
    } else {
        noPending.classList.add('hidden');
        pendingList.innerHTML = '';

        pendingUsers.forEach(user => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3 bg-yellow-50 rounded-lg';

            item.innerHTML = `
                <div>
                  <div class="font-medium">${user.name} (${user.initials})</div>
                  <div class="text-sm text-gray-500">${user.email} - ${user.role}</div>
                </div>
                <div class="flex space-x-2">
                  <button class="approve-user-btn px-3 py-1 bg-green-500 hover:bg-green-400 text-white rounded text-sm" data-id="${user.id}">Approve</button>
                  <button class="reject-user-btn px-3 py-1 bg-red-500 hover:bg-red-400 text-white rounded text-sm" data-id="${user.id}">Reject</button>
                </div>
            `;

            pendingList.appendChild(item);
        });

        pendingList.querySelectorAll('.approve-user-btn').forEach(btn => {
            btn.addEventListener('click', () => approveUser(btn.dataset.id));
        });

        pendingList.querySelectorAll('.reject-user-btn').forEach(btn => {
            btn.addEventListener('click', () => rejectUser(btn.dataset.id));
        });
    }

    const allList = document.getElementById('all-users-list');
    allList.innerHTML = '';

    approvedUsers.forEach(user => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';

        const roleColor =
            user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                user.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700';

        const isCurrentUser = appState.currentUser && user.id === appState.currentUser.id;
        const isDemo = isDemoAccountUser(user);

        item.innerHTML = `
            <div class="flex-1">
              <div class="font-medium">${user.name} (${user.initials}) ${isCurrentUser ? '(You)' : ''}</div>
              <div class="text-sm text-gray-500">${user.email}</div>
            </div>
            <span class="${roleColor} px-2 py-1 rounded text-sm font-medium">${user.role}</span>
            <div class="ml-3">
              ${
            isCurrentUser
                ? ''
                : (isDemo
                        ? '<span class="text-xs text-gray-400">Demo</span>'
                        : `<button class="remove-user-btn px-3 py-1 bg-red-500 hover:bg-red-400 text-white rounded text-sm" data-id="${user.id}">Remove</button>`
                )
        }
            </div>
        `;

        allList.appendChild(item);
    });

    allList.querySelectorAll('.remove-user-btn').forEach(btn => {
        btn.addEventListener('click', () => removeUser(btn.dataset.id));
    });
}

//returns true if user is a demo account (by flag or email domain)
function isDemoAccountUser(user) {
    if (!user) return false;
    if (user.isDemo === true) return true;
    const email = (user.email || '').toLowerCase();
    return email.endsWith('@demo.herschel.sch.uk');
}

//formats a name with capital first letter per word for display in modals
function toTitleCaseName(name) {
    return String(name || '')
        .trim()
        .split(/\s+/)
        .map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : '')
        .join(' ');
}

//shows confirmation dialog before removing a user and runs callback on confirm
function showRemoveUserModal(user, onConfirm) {
    const modal = document.getElementById('remove-user-modal');
    const msg = document.getElementById('remove-user-message');
    const okBtn = document.getElementById('remove-user-ok');
    const cancelBtn = document.getElementById('remove-user-cancel');

    if (!modal || !msg || !okBtn || !cancelBtn) return;

    const displayName = toTitleCaseName(user.name);
    msg.textContent =
        'Are you sure you want to remove ' + displayName + '?\n\n' +
        'This will delete all of their existing bookings and cannot be undone.';

    modal.classList.remove('hidden');

    const close = () => {
        modal.classList.add('hidden');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    cancelBtn.onclick = close;
    okBtn.onclick = () => {
        close();
        onConfirm();
    };
}

//marks a pending user as approved and refreshes user list
function approveUser(userId) {
    const user = getUsers().find(u => u.id === userId);
    if (user) {
        user.approved = true;
        const success = updateUser(user);
        if (success) {
            logAudit('USER_APPROVED', 'Admin approved ' + user.name);
            showToast(user.name + ' has been approved');
            renderUserManagement();
        }
    }
}

//rejects a pending user and deletes their bookings, then refreshes user list
function rejectUser(userId) {
    const user = getUsers().find(u => u.id === userId);
    if (user) {
        if (isDemoAccountUser(user)) {
            showToast('Demo accounts cannot be removed', 'error');
        return;
    }

        const result = deleteUserAndBookings(user.id);

        logAudit(
            'USER_REJECTED',
            'Admin rejected ' + user.name +
            (result.deletedBookings ? (' and deleted ' + result.deletedBookings + ' booking(s)') : '')
        );

        showToast(
            user.name + ' has been rejected' +
            (result.deletedBookings ? (' (and ' + result.deletedBookings + ' booking(s) removed)') : ''),
            'error'
        );

        renderUserManagement();
    }
}

//removes an approved user after confirmation (and their bookings), blocks demo and self-remove
function removeUser(userId) {
    const user = getUsers().find(u => u.id === userId);
    if (!user) return;

    if (isDemoAccountUser(user)) {
        showToast('Demo accounts cannot be removed', 'error');
        return;
    }

    if (appState.currentUser && user.id === appState.currentUser.id) {
        showToast('You cannot remove your own account while logged in', 'error');
        return;
    }

    showRemoveUserModal(user, () => {
        const result = deleteUserAndBookings(user.id);

        if (result.removedUser) {
            logAudit(
                'USER_REMOVED',
                'Admin removed ' + user.name +
                (result.deletedBookings ? (' and deleted ' + result.deletedBookings + ' booking(s)') : '')
            );

            showToast(
                user.name + ' has been removed' +
                (result.deletedBookings ? (' (and ' + result.deletedBookings + ' booking(s) removed)') : ''),
                'error'
            );

            renderUserManagement();
        } else {
            showToast('Failed to remove user', 'error');
        }
    });
}
