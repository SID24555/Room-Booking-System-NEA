//index.js - app entry point and init

    //loads data, attaches event listeners and shows auth screen
    function initApp() {
        updateAppData();
        setupEventListeners();
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('main-container').classList.remove('hidden');
        showAuthUI();
    }

    initApp();
