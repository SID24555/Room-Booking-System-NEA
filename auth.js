//auth.js - handles login, registration, demo login and logout

//validates credentials against stored users and sets current user on success
async function handleLogin(email, password) {
    const users = getUsers();
    const userData = users.find(u => u.email === email);

    if (!userData) return { success: false, error: 'Invalid email or password' };

    //backwards compatible: old accounts sha256(password), new accounts sha256(salt:password)
    const expectedHash = userHasSalt(userData)
        ? await hashPasswordWithSalt(password, userData.salt)
        : await sha256(password);

    if (userData.hashed_password !== expectedHash) {
        return { success: false, error: 'Invalid email or password' };
    }

    //auto-upgrade legacy accounts to salted hashes on next login
    if (!userHasSalt(userData)) {
        const newSalt = generateSaltHex();
        userData.salt = newSalt;
        userData.hashed_password = await hashPasswordWithSalt(password, newSalt);
        updateUser(userData);
    }

    if (!userData.approved) {
        return { success: false, error: 'Your account is pending admin approval' };
    }

    appState.currentUser = createUserInstance(userData);
    logAudit('USER_LOGIN', appState.currentUser.name + ' logged in');
    return { success: true };
}

//validates input, checks duplicate email and creates unapproved user record
async function handleRegister(name, initials, email, password, role) {
    const nameValidation = ValidationUtils.validateName(name);
    if (!nameValidation.isValid) {
        return { success: false, error: nameValidation.message };
    }

    const initialsValidation = ValidationUtils.validateInitials(initials);
    if (!initialsValidation.isValid) {
        return { success: false, error: initialsValidation.message };
    }

    const emailValidation = ValidationUtils.validateEmail(email);
    if (!emailValidation.isValid) {
        return { success: false, error: emailValidation.message };
    }

    const passwordValidation = ValidationUtils.validatePassword(password);
    if (!passwordValidation.isValid) {
        return { success: false, error: passwordValidation.message };
    }

    const users = getUsers();

    //O(1) duplicate email check via set; storage format unchanged
    const existingEmails = new Set(users.map(u => u.email));
    if (existingEmails.has(email)) {
        return { success: false, error: 'An account with this email already exists' };
    }

    const salt = generateSaltHex();
    const hashed_password = await hashPasswordWithSalt(password, salt);

    const success = createUser({
        name,
        email,
        hashed_password,
        salt,
        initials: initialsValidation.value,
        role,
        approved: false
    });


    if (success) {
        return { success: true };
    }
    return { success: false, error: 'Registration failed. Please try again.' };
}

//logs in as demo admin, teacher or student; creates account if missing
async function handleDemoLogin(role) {
    const demoAccounts = {
        admin: { name: 'Demo Admin', email: 'admin@demo.herschel.sch.uk', initials: 'ADM', role: 'admin' },
        teacher: { name: 'Demo Teacher', email: 'teacher@demo.herschel.sch.uk', initials: 'TCH', role: 'teacher' },
        student: { name: 'Demo Student', email: 'student@demo.herschel.sch.uk', initials: 'STU', role: 'student' }
    };

    const demo = demoAccounts[role];
    const users = getUsers();
    let userData = users.find(u => u.email === demo.email);

    if (!userData) {
        const salt = generateSaltHex();
        const hashed_password = await hashPasswordWithSalt('demo123', salt);
        createUser({ ...demo, hashed_password, salt, approved: true });

        userData = getUsers().find(u => u.email === demo.email);
    }

    if (userData) {
        appState.currentUser = createUserInstance(userData);
        logAudit('USER_LOGIN', appState.currentUser.name + ' logged in (demo)');
        showLoggedInUI();
        populateNotificationQueue();
        checkReminders();
    }
}

//clears user state, notification queue and undo stack then shows login screen
function handleLogout() {
    logAudit('USER_LOGOUT', (appState.currentUser ? appState.currentUser.name : 'Unknown') + ' logged out');
    appState.currentUser = null;
    if (appState.reminderTimeout) {
        clearTimeout(appState.reminderTimeout);
    }
    if (appState.queueProcessorInterval) {
        clearInterval(appState.queueProcessorInterval);
    }

    appState.notificationQueue.clear();
    appState.undoStack.clear();
    updateUndoButton();
    updateNotificationBadge();

    showAuthUI();
}
