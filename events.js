//events.js - DOM listeners for auth, nav, calendar, booking modal, admin, notifications

    //attaches all click and change listeners for auth, nav, calendar, booking and admin
    function setupEventListeners() {
        document.getElementById('login-tab').addEventListener('click', () => {
            document.getElementById('login-tab').classList.add('tab-active');
            document.getElementById('register-tab').classList.remove('tab-active');
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('register-form').classList.add('hidden');
        });

        document.getElementById('register-tab').addEventListener('click', () => {
            document.getElementById('register-tab').classList.add('tab-active');
            document.getElementById('login-tab').classList.remove('tab-active');
            document.getElementById('register-form').classList.remove('hidden');
            document.getElementById('login-form').classList.add('hidden');
        });

        ValidationUtils.addValidationFeedback(document.getElementById('login-email'), 'email');
        ValidationUtils.addValidationFeedback(document.getElementById('register-name'), 'name');
        ValidationUtils.addValidationFeedback(document.getElementById('register-initials'), 'initials');
        ValidationUtils.addValidationFeedback(document.getElementById('register-email'), 'email');
        ValidationUtils.addValidationFeedback(document.getElementById('register-password'), 'password');
        ValidationUtils.addValidationFeedback(document.getElementById('booking-purpose'), 'purpose');

        document.getElementById('login-btn').addEventListener('click', async () => {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            const result = await handleLogin(email, password);
            if (result.success) {
                showLoggedInUI();
                populateNotificationQueue();
                checkReminders();
            } else {
                document.getElementById('login-error').textContent = result.error;
                document.getElementById('login-error').classList.remove('hidden');
            }
        });

        document.getElementById('register-btn').addEventListener('click', async () => {
            const name = document.getElementById('register-name').value;
            const initials = document.getElementById('register-initials').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const role = document.getElementById('register-role').value;

            const result = await handleRegister(name, initials, email, password, role);
            if (result.success) {
                document.getElementById('register-success').textContent = 'Registration successful! Please wait for admin approval.';
                document.getElementById('register-success').classList.remove('hidden');
                document.getElementById('register-error').classList.add('hidden');
            } else {
                document.getElementById('register-error').textContent = result.error;
                document.getElementById('register-error').classList.remove('hidden');
                document.getElementById('register-success').classList.add('hidden');
            }
        });

        document.querySelectorAll('.demo-login').forEach(btn => {
            btn.addEventListener('click', () => handleDemoLogin(btn.dataset.role));
        });

        //navigation
        document.getElementById('nav-calendar').addEventListener('click', showCalendar);
        document.getElementById('nav-my-bookings').addEventListener('click', showMyBookings);
        document.getElementById('nav-admin').addEventListener('click', showAdmin);
        document.getElementById('logout-btn').addEventListener('click', handleLogout);

        //calendar controls
        document.getElementById('prev-week').addEventListener('click', () => {
            appState.currentWeekStart = addDays(appState.currentWeekStart, -7);
            rerender();
        });

        document.getElementById('next-week').addEventListener('click', () => {
            appState.currentWeekStart = addDays(appState.currentWeekStart, 7);
            rerender();
        });

        document.getElementById('today-btn').addEventListener('click', () => {
            appState.currentWeekStart = getMonday(new Date());
            rerender();
        });

        document.getElementById('room-filter').addEventListener('change', rerender);

        document.getElementById('cancel-booking').addEventListener('click', closeBookingModal);
        document.getElementById('confirm-booking').addEventListener('click', confirmBooking);
        document.getElementById('close-view-only').addEventListener('click', closeBookingModal);

        document.getElementById('booking-room').addEventListener('change', (e) => {
            if (e.target.value && appState.selectedSlot) {
                handleRoomSelection(e.target.value, appState.selectedSlot.date, appState.selectedSlot.period);
            }
        });

        document.getElementById('seat-count-input').addEventListener('input', (e) => {
            const count = parseInt(e.target.value);
            if (!isNaN(count) && count > 0) {
                document.getElementById('selected-seats-count').textContent =
                    count + ' seat' + (count !== 1 ? 's' : '') + ' requested';
            }
        });

        document.getElementById('booking-recurrence').addEventListener('change', (e) => {
            const preview = document.getElementById('recurrence-preview');
            if (e.target.value !== 'none' && appState.selectedSlot) {
                const dates = generateRecurringDates(appState.selectedSlot.date, e.target.value, 8);
                preview.innerHTML = '<strong>Will book on:</strong><br>' + dates.map(d => formatDateDisplay(new Date(d))).join(', ');
                preview.classList.remove('hidden');
            } else {
                preview.classList.add('hidden');
            }
        });

        document.getElementById('cancel-delete').addEventListener('click', () => {
            document.getElementById('delete-modal').classList.add('hidden');
            appState.bookingToDelete = null;
        });
        document.getElementById('confirm-delete').addEventListener('click', executeDeleteBooking);

        document.getElementById('dismiss-reminder').addEventListener('click', dismissReminder);

        document.getElementById('export-excel').addEventListener('click', exportToCSV);

        document.getElementById('notification-bell').addEventListener('click', toggleNotificationPanel);
        document.getElementById('close-notification-panel').addEventListener('click', () => {
            document.getElementById('notification-panel').classList.add('hidden');
        });

        document.getElementById('undo-btn').addEventListener('click', executeUndo);

        document.getElementById('admin-stats-tab').addEventListener('click', () => {
            setAdminTab('stats');
            renderAdminStats();
        });

        document.getElementById('admin-audit-tab').addEventListener('click', () => {
            setAdminTab('audit');
            renderAuditLog();
        });

        document.getElementById('admin-users-tab').addEventListener('click', () => {
            setAdminTab('users');
            renderUserManagement();
        });
    }

    //switches visible admin panel (stats, audit or users) and tab styling
    function setAdminTab(tab) {
        const tabs = ['stats', 'audit', 'users'];
        tabs.forEach(t => {
            document.getElementById('admin-' + t + '-tab').classList.toggle('tab-active', t === tab);
            document.getElementById('admin-' + t + '-tab').classList.toggle('text-gray-500', t !== tab);
            document.getElementById('admin-' + t + '-panel').classList.toggle('hidden', t !== tab);
        });
    }

    document.getElementById('booking-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeBookingModal();
    });

    document.getElementById('delete-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('delete-modal').classList.add('hidden');
            appState.bookingToDelete = null;
        }
    });
