//notifications.js - reminder dismissals (on booking), queue refresh, today/urgent reminders, confirmations

//marks booking as dismissed for today or urgent reminder so it does not reappear
function markBookingReminderDismissed(bookingId, reminderType) {
    if (!bookingId) return;
    const idx = appState.allData.findIndex(item => item && item.type === 'booking' && item.id === bookingId);
    if (idx < 0) return;

    const booking = appState.allData[idx];
    if (reminderType === 'urgent') {
        booking.dismissedUrgentReminder = true;
    } else if (reminderType === 'today') {
        booking.dismissedTodayReminder = true;
    }

    appState.allData[idx] = booking;
    updateAppData(appState.allData);
}

//rebuilds queue with today and urgent reminders for current user, keeping existing confirmations
function populateNotificationQueue() {
    const existing = appState.notificationQueue.getAll();
    const preservedConfirmations = existing.filter(n => n && n.kind === 'confirmation');

    appState.notificationQueue.setAll(preservedConfirmations);

    const now = new Date();
    const today = formatDate(now);
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const currentUserId = appState.currentUser ? appState.currentUser.id : null;

    const todayBookings = getBookings().filter(b =>
        b.date === today &&
        b.userId === currentUserId
    );

    todayBookings.forEach(booking => {
        const period = PERIODS.find(p => p.id === booking.period);
        if (!period) return;

        const startTimeParts = period.time.split(' - ')[0].split(':');
        const startHour = parseInt(startTimeParts[0]);
        const startMin = parseInt(startTimeParts[1]);
        const bookingTime = startHour * 60 + startMin;
        const timeUntil = bookingTime - currentTime;

        let priority;
        let message;

        if (timeUntil > 0 && timeUntil <= 15) {
            priority = NotificationPriority.HIGH;
            message = '🔴 URGENT: ' + booking.roomName + ' in ' + timeUntil + ' minutes (' + period.name + ')';
        } else if (timeUntil > 15) {
            priority = NotificationPriority.MEDIUM;
            message = '📅 Today: ' + booking.roomName + ' at ' + period.name;
        } else {
            return;
        }

        if (priority === NotificationPriority.HIGH && booking.dismissedUrgentReminder === true) return;
        if (priority === NotificationPriority.MEDIUM && booking.dismissedTodayReminder === true) return;

        const bookingStart = new Date(today + 'T' + startTimeParts[0] + ':' + startTimeParts[1] + ':00');
        const triggerAt = bookingStart.toISOString();

        appState.notificationQueue.enqueue(message, priority, booking.id, { kind: 'scheduled', triggerAt });
    });

    updateNotificationBadge();
    startQueueProcessor(); //keeps reminders as accurate as possible
}

//starts 60s interval to refresh notification queue (runs once)
function startQueueProcessor() {
    if (appState.queueProcessorInterval) return;

    appState.queueProcessorInterval = setInterval(() => {
        populateNotificationQueue();
    }, 60000);
}

//updates bell badge count and visibility from queue size
function updateNotificationBadge() {
    const count = appState.notificationQueue.size();
    const badge = document.getElementById('notification-badge');

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

//shows or hides notification panel and renders list when opening
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    const isHidden = panel.classList.contains('hidden');

    if (isHidden) {
        renderNotificationQueue();
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

//renders notification list with dismiss buttons and persists reminder dismissals
function renderNotificationQueue() {
    const list = document.getElementById('notification-list');
    const count = document.getElementById('queue-count');
    const notifications = appState.notificationQueue.getAll();

    count.textContent = notifications.length;
    list.innerHTML = '';

    if (notifications.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-center py-4">No notifications</p>';
        return;
    }

    notifications.forEach(notification => {
        const item = document.createElement('div');

        let priorityColor = 'bg-gray-200 text-gray-700';
        if (notification.priority === NotificationPriority.HIGH) {
            priorityColor = 'bg-red-100 text-red-700 border border-red-300';
        } else if (notification.priority === NotificationPriority.MEDIUM) {
            priorityColor = 'bg-yellow-100 text-yellow-800 border border-yellow-300';
        }

        item.className = 'flex items-center justify-between p-3 rounded-lg ' + priorityColor;

        item.innerHTML = `
      <div class="flex-1 text-sm">
        ${notification.message}
      </div>
      <button class="dismiss-notification-btn ml-2 px-2 py-1 bg-gray-500 hover:bg-gray-400 text-white rounded text-xs" data-id="${notification.id}">
        Dismiss
      </button>
    `;

        list.appendChild(item);
    });

    list.querySelectorAll('.dismiss-notification-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const all = appState.notificationQueue.getAll();
            const notif = all.find(n => n && n.id === id);

            if (notif && notif.kind === 'scheduled' && notif.bookingId) {
                const reminderType = (notif.priority === NotificationPriority.HIGH) ? 'urgent' : 'today';
                markBookingReminderDismissed(notif.bookingId, reminderType);
            }

            appState.notificationQueue.dismiss(id);
            renderNotificationQueue();
            updateNotificationBadge();
        });
    });
}

//adds booking confirmation message to notification queue after successful create
function enqueueBookingConfirmation(roomName, dateISO, periodId) {
    if (!appState || !appState.currentUser) return;

    const period = PERIODS.find(p => p.id === periodId);
    const periodName = period ? period.name : periodId;
    const dateObj = new Date(dateISO);
    const dateLabel = formatDateDisplay(dateObj);

    const message = '✅ Confirmed: ' + roomName + ' on ' + dateLabel + ' (' + periodName + ')';
    appState.notificationQueue.enqueue(
        message,
        NotificationPriority.MEDIUM,
        null,
        { kind: 'confirmation', triggerAt: new Date().toISOString() }
    );

    updateNotificationBadge();
}

window.enqueueBookingConfirmation = enqueueBookingConfirmation;
