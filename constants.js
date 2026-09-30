//constants.js - periods, rooms, holidays, week config and app state

const PERIODS = [
    { id: 'before', name: 'Before School', time: '08:00 - 08:30' },
    { id: 'p1', name: 'Period 1', time: '08:50 - 09:50' },
    { id: 'p2', name: 'Period 2', time: '09:50 - 10:50' },
    { id: 'break', name: 'Break', time: '10:50 - 11:10' },
    { id: 'p3', name: 'Period 3', time: '11:10 - 12:10' },
    { id: 'p4', name: 'Period 4', time: '12:10 - 13:10' },
    { id: 'lunch', name: 'Lunch', time: '13:10 - 13:50' },
    { id: 'p5', name: 'Period 5', time: '14:00 - 15:00' },
    { id: 'after', name: 'After School', time: '15:00 - 16:00' }
];

const ROOMS = [
    { id: 'sports-hall', name: 'Sports Hall', type: 'hall', capacity: 200 },
    { id: 'comp-lab-1', name: 'Computer Lab 1', type: 'computer', capacity: 32 },
    { id: 'comp-lab-2', name: 'Computer Lab 2', type: 'computer', capacity: 32 },
    { id: 'comp-lab-3', name: 'Computer Lab 3', type: 'computer', capacity: 32 },
    { id: 'comp-lab-4', name: 'Computer Lab 4', type: 'computer', capacity: 32 }
];

const HOLIDAYS = [
    { start: '2025-09-02', end: '2025-09-03', name: 'Inset Day' },
    { start: '2025-10-27', end: '2025-10-31', name: 'October Half Term' },
    { start: '2025-12-22', end: '2026-01-02', name: 'Christmas Holiday' },
    { start: '2026-02-16', end: '2026-02-20', name: 'February Half Term' },
    { start: '2026-03-30', end: '2026-04-10', name: 'Spring Holiday' },
    { start: '2026-05-04', end: '2026-05-04', name: 'Inset Day' },
    { start: '2026-05-25', end: '2026-05-29', name: 'May Half Term' }
];

//Monday; used with getMonday() in getWeekABLabel
const WEEK_A_START = new Date('2025-09-08');

//Mon–Fri: key = days after week start (0=Mon-4=Fri)
const WEEK_DAYS = [
    { key: 0, label: 'Mon' },
    { key: 1, label: 'Tue' },
    { key: 2, label: 'Wed' },
    { key: 3, label: 'Thu' },
    { key: 4, label: 'Fri' }
];

let appState = {
    currentUser: null,
    currentWeekStart: null,
    selectedSlot: null,
    selectedSeats: [],
    bookingToDelete: null,
    allData: [],
    reminderTimeout: null,
    notificationQueue: new NotificationQueue(),
    undoStack: new UndoStack(5),
    queueProcessorInterval: null,

    //set for O(1) exclusive-slot conflict checks
    bookingIndexes: {
        occupiedSlotKeys: new Set()
    }
};
