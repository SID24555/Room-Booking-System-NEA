//reminders.js - reminder timeout and banner dismiss (confirmations via notification queue)

//clears reminder timeout and hides reminder banner
function checkReminders() {
    if (appState.reminderTimeout) {
        clearTimeout(appState.reminderTimeout);
        appState.reminderTimeout = null;
    }

    const banner = document.getElementById('reminder-banner');
    if (banner) banner.classList.add('hidden');
}

//hides the reminder banner when user dismisses
function dismissReminder() {
    document.getElementById('reminder-banner').classList.add('hidden');
}
