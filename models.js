//models.js - user/booking/recurring classes, notification queue, undo stack, validation utils

//base user class with role-based permission stubs; subclasses override for students, teachers, admins
class User {
    //builds user from stored data, assigning defaults for id and date if missing
    constructor(data) {
        this.id = data.id || generateId();
        this.name = data.name;
        this.email = data.email;
        this.role = data.role;
        this.initials = data.initials;
        this.hashed_password = data.hashed_password || data.hashed_password;
        this.approved = data.approved;
        this.salt = data.salt || '';
        this.date_created = data.date_created || data.date_created || new Date().toISOString();
    }

    //base: no booking permission; overridden by teacher and admin
    canBook() {
        return false;
    }

    //base: no recurring booking; overridden by teacher
    canRecurringBook() {
        return false;
    }

    //base: no user management; overridden by admin
    canManageUsers() {
        return false;
    }

    //base: no audit access; overridden by admin
    canAccessAudit() {
        return false;
    }

    //base: no analytics access; overridden by admin
    canViewAnalytics() {
        return false;
    }

    //base: no delete permission; overridden by teacher and admin
    canDelete() {
        return false;
    }

    //returns single object used by UI to show/hide features and enforce booking limits
    getPermissions() {
        return {
            canBook: this.canBook(),
            canDelete: this.canDelete(),
            canManageUsers: this.canManageUsers(),
            canAccessAudit: this.canAccessAudit(),
            canViewAnalytics: this.canViewAnalytics(),
            canRecurringBook: this.canRecurringBook(),
            bookingLimit: typeof this.getBookingLimit === 'function' ? this.getBookingLimit() : 0
        };
    }

}

//student role: view-only, no booking or delete
class Student extends User {
    //builds student from stored data
    constructor(data) {
        super(data);
    }

    //students cannot book
    canBook() {
        return false;
    }

    //students cannot delete bookings
    canDelete() {
        return false;
    }
}

//teacher role: can book and delete own bookings, recurring allowed, cap of 10 active bookings
class Teacher extends User {
    //builds teacher from stored data
    constructor(data) {
        super(data);
    }

    //teachers can book rooms
    canBook() {
        return true;
    }

    //teachers can delete their own bookings
    canDelete() {
        return true;
    }

    //used by booking modal to enforce teacher limit
    getBookingLimit() {
        return 10;
    }

    //teachers can create weekly/biweekly recurring bookings
    canRecurringBook() {
        return true;
    }

    //extends base permissions with teacher flags and booking limit
    getPermissions() {
        return {
            ...super.getPermissions(),
            canBook: true,
            canDelete: true,
            canRecurringBook: true,
            bookingLimit: this.getBookingLimit()
        };
    }
}

//admin role: inherits teacher abilities plus user management, audit and analytics
class Admin extends Teacher {
    //builds admin from stored data
    constructor(data) {
        super(data);
    }
    //admins can approve/reject/remove users
    canManageUsers() {
        return true;
    }
    //admins can view audit log
    canAccessAudit() {
        return true;
    }
    //admins can view stats panel
    canViewAnalytics() {
        return true;
    }
    //admins not limited by the teacher booking cap
    getBookingLimit() {
        return Infinity;
    }
    //extends base permissions with admin flags
    getPermissions() {
        return {
            ...super.getPermissions(),
            canManageUsers: true,
            canAccessAudit: true,
            canViewAnalytics: true,
            bookingLimit: Infinity
        };
    }
}

//returns the correct user class instance (Admin, Teacher, Student) from stored user data
function createUserInstance(userData) {
    if (!userData) return null;

    switch(userData.role) {
        case 'admin':
            return new Admin(userData);
        case 'teacher':
            return new Teacher(userData);
        case 'student':
            return new Student(userData);
        default:
            return new User(userData);
    }
}

//single booking record; handles both camelCase and snake_case from storage for backward compatibility
class Booking {
    //builds booking from stored data (camelCase or snake_case)
    constructor(data) {
        this.id = data.id || generateId();
        this.roomId = data.roomId || data.room_id;
        this.roomName = data.roomName || data.room_name;
        this.date = data.date;
        this.period = data.period;
        this.purpose = data.purpose;
        this.userId = data.userId || data.user_id;
        this.userName = data.userName || data.user_name;
        this.seats = data.seats || '';
        this.date_created = data.date_created || data.date_created || new Date().toISOString();
    }

    //returns true if this booking clashes with another (same room/date/period); for computer labs checks seat overlap or full-room
    hasConflict(otherBooking) {
        if (this.date !== otherBooking.date) return false;
        if (this.period !== otherBooking.period) return false;
        if (this.roomId !== otherBooking.roomId) return false;

        const room = (typeof ROOMS !== 'undefined' && Array.isArray(ROOMS))
            ? ROOMS.find(r => r.id === this.roomId)
            : null;

        if (room && room.type === 'hall') {
            return true;
        }

        if (room && room.type === 'computer') {
            const cap = room.capacity != null ? room.capacity : 32;
            const mySeats = typeof seatsToSet === 'function' ? seatsToSet(this.seats) : new Set();
            const theirSeats = typeof seatsToSet === 'function' ? seatsToSet(otherBooking.seats) : new Set();
            const fullA = mySeats.size === 0 || mySeats.size === cap;
            const fullB = theirSeats.size === 0 || theirSeats.size === cap;
            if (fullA || fullB) return true;
            for (const seatNum of mySeats) {
                if (theirSeats.has(seatNum)) return true;
            }
            return false;
        }

        return true;
    }

    //checks required fields and purpose length; returns { isValid, errors } for form feedback
    validate() {
        const errors = [];

        if (!this.roomId) errors.push('Room is required');
        if (!this.date) errors.push('Date is required');
        if (!this.period) errors.push('Period is required');
        if (!this.purpose || this.purpose.length < 5) {
            errors.push('Purpose must be at least 5 characters');
        }
        if (!this.userId) errors.push('User is required');

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    //plain object for storage and for recurring instance copy
    toDataObject() {
        return {
            id: this.id,
            type: 'booking',
            roomId: this.roomId,
            roomName: this.roomName,
            date: this.date,
            period: this.period,
            purpose: this.purpose,
            userId: this.userId,
            userName: this.userName,
            seats: this.seats,
            isRecurring: false,
            recurrenceId: '',
            date_created: this.date_created
        };
    }
}

//extends booking for weekly/biweekly repeats; generates multiple dates skipping holidays and weekends
class RecurringBooking extends Booking {
    //builds recurring booking with frequency and max weeks
    constructor(data) {
        super(data);
        this.isRecurring = true;
        this.frequency = data.frequency || 'weekly';
        this.recurrenceId = data.recurrenceId || data.recurrence_id || this.generateRecurrenceId();
        this.maxWeeks = 8;
    }

    //unique id for this recurrence series so instances can be grouped
    generateRecurrenceId() {
        return 'REC-' + Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    //produces up to maxWeeks booking instances on school days (no holiday or weekend)
    generateInstances() {
        const instances = [];
        const daysToAdd = this.frequency === 'weekly' ? 7 : 14;
        const currentDate = new Date(this.date);

        for (let week = 0; week < this.maxWeeks * 2; week++) {
            if (instances.length >= this.maxWeeks) break;

            if (week > 0) {
                currentDate.setDate(currentDate.getDate() + daysToAdd);
            }

            if (!isHoliday(currentDate) && !isWeekend(currentDate)) {
                instances.push({
                    ...this.toDataObject(),
                    date: formatDate(currentDate),
                    isRecurring: true,
                    recurrenceId: this.recurrenceId
                });
            }
        }

        return instances;
    }

    //plain object for storage including recurrence id
    toDataObject() {
        return {
            ...super.toDataObject(),
            isRecurring: true,
            recurrenceId: this.recurrenceId
        };
    }
}

const NotificationPriority = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
};

//FIFO queue with priority for today/urgent reminders and booking confirmations
class NotificationQueue {
    //creates empty queue
    constructor() {
        this.queue = [];
    }

    //adds notification
    enqueue(message, priority, bookingId, kind, triggerAt) {
        let kindValue = kind;
        let triggerAtValue = triggerAt;

        if (kindValue && typeof kindValue === "object") {
            triggerAtValue = kindValue.triggerAt;
            kindValue = kindValue.kind;
        }

        const notification = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            message,
            priority: priority || NotificationPriority.LOW,
            bookingId: bookingId || null,
            kind: kindValue || "scheduled",
            triggerAt: triggerAtValue || new Date().toISOString(),
            timestamp: new Date().toISOString(),
            dismissed: false
        };

        this.queue.push(notification);
        this.sortByPriority(); //ensures it is ordered by priority
        return notification;
    }

    //true if queue has no notifications
    isEmpty() {
        return this.queue.length === 0;
    }

    //number of notifications in queue
    size() {
        return this.queue.length;
    }

    //sorts queue by priority (highest first), then by trigger time and timestamp for tiebreakers
    sortByPriority() {
        this.queue.sort((a, b) => {
            const priorityDiff = (b.priority || 0) - (a.priority || 0);
            if (priorityDiff !== 0) return priorityDiff;

            const ta = a.triggerAt ? new Date(a.triggerAt).getTime() : 0;
            const tb = b.triggerAt ? new Date(b.triggerAt).getTime() : 0;
            if (ta !== tb) return ta - tb;

            const sa = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const sb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return sa - sb;
        });
    }

    //removes one notification by id (e.g. when user dismisses)
    dismiss(notificationId) {
        const index = this.queue.findIndex(n => n.id === notificationId);
        if (index !== -1) this.queue.splice(index, 1);
    }

    //returns copy of all notifications
    getAll() {
        return [...this.queue];
    }

    //empties the queue
    clear() {
        this.queue = [];
    }

    //replaces whole queue (e.g. when refreshing reminders but keeping confirmations)
    setAll(notifications) {
        this.queue = Array.isArray(notifications) ? [...notifications] : [];
        this.sortByPriority();
    }
}

//LIFO stack for last 5 booking create/delete actions so user can undo
class UndoStack {
    //creates stack with given max size (5)
    constructor(maxSize) {
        this.stack = [];
        this.maxSize = maxSize || 5;
    }
    //stores action with snapshot of booking data (oldest is dropped if over max size)
    push(action, bookingData, userId) {
        const undoAction = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            action, // 'CREATE', 'DELETE', 'MODIFY'
            bookingData: { ...bookingData },
            userId,
            timestamp: new Date().toISOString()
        };
        this.stack.push(undoAction);
        if (this.stack.length > this.maxSize) {
            this.stack.shift();
        }
        return undoAction;
    }
    //removes and returns most recent undo action
    pop() {
        if (this.isEmpty()) return null;
        return this.stack.pop();
    }
    //returns latest action without removing (for undo button label)
    peek() {
        if (this.isEmpty()) return null;
        return this.stack[this.stack.length - 1];
    }
    //true if no undo actions available
    isEmpty() {
        return this.stack.length === 0;
    }
    //clears all undo actions
    clear() {
        this.stack = [];
    }
}

//static regex-based validators and error messages for registration and booking forms
class ValidationUtils {
    static patterns = {
        email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        initials: /^[A-Z]{3}$/,
        roomCodes: /^(sports-hall|comp-lab-[1-4])$/,
        date: /^\d{4}-\d{2}-\d{2}$/,
        purpose: /^[A-Za-z0-9\s,.\-']{5,100}$/,
        periodId: /^(before|p[1-5]|break|lunch|after)$/,
        name: /^[A-Za-z\s'-]{2,50}$/,
        password: /^.{8,}$/
    };

    static messages = {
        email: 'Please enter a valid email address (e.g., name@herschel.slough.sch.uk)',
        initials: 'Initials must be exactly 3 uppercase letters (e.g., JAS)',
        roomCodes: 'Invalid room code',
        date: 'Date must be in YYYY-MM-DD format',
        purpose: 'Purpose must be 5-100 characters, letters/numbers/spaces only',
        periodId: 'Invalid period selection',
        name: 'Name must be 2-50 characters, letters only',
        password: 'Password must be at least 8 characters'
    };

    //tests email against pattern, returns { isValid, message }
    static validateEmail(email) {
        const isValid = this.patterns.email.test(email);
        return {
            isValid,
            message: isValid ? '' : this.messages.email
        };
    }

    //validates 3 uppercase letters; returns normalized value for storage
    static validateInitials(initials) {
        const normalized = initials.toUpperCase();
        const isValid = this.patterns.initials.test(normalized);
        return {
            isValid,
            message: isValid ? '' : this.messages.initials,
            value: normalized
        };
    }

    //validates room code against allowed ids
    static validateRoomCode(code) {
        const isValid = this.patterns.roomCodes.test(code);
        return {
            isValid,
            message: isValid ? '' : this.messages.roomCodes
        };
    }

    //validates YYYY-MM-DD date string
    static validateDate(date) {
        const isValid = this.patterns.date.test(date);
        return {
            isValid,
            message: isValid ? '' : this.messages.date
        };
    }

    //validates purpose length and allowed characters
    static validatePurpose(purpose) {
        const isValid = this.patterns.purpose.test(purpose);
        return {
            isValid,
            message: isValid ? '' : this.messages.purpose
        };
    }

    //validates period id against allowed values
    static validatePeriod(periodId) {
        const isValid = this.patterns.periodId.test(periodId);
        return {
            isValid,
            message: isValid ? '' : this.messages.periodId
        };
    }

    //validates name length and allowed characters
    static validateName(name) {
        const isValid = this.patterns.name.test(name);
        return {
            isValid,
            message: isValid ? '' : this.messages.name
        };
    }

    //validates password meets minimum length
    static validatePassword(password) {
        const isValid = this.patterns.password.test(password);
        return {
            isValid,
            message: isValid ? '' : this.messages.password
        };
    }

    //attaches live feedback to input: green border when valid, red when invalid, based on validationType
    static addValidationFeedback(inputElement, validationType) {
        inputElement.addEventListener('input', (e) => {
            const value = e.target.value;
            let result;

            switch(validationType) {
                case 'email':
                    result = this.validateEmail(value);
                    break;
                case 'initials':
                    result = this.validateInitials(value);
                    if (result.isValid) e.target.value = result.value;
                    break;
                case 'purpose':
                    result = this.validatePurpose(value);
                    break;
                case 'name':
                    result = this.validateName(value);
                    break;
                case 'password':
                    result = this.validatePassword(value);
                    break;
                case 'roomCode':
                    result = this.validateRoomCode(value);
                    break;
                case 'date':
                    result = this.validateDate(value);
                    break;
                case 'period':
                    result = this.validatePeriod(value);
                    break;
                default:
                    return;
            }

            //update border colour only when user has typed something
            if (value.length > 0) {
                if (result.isValid) {
                    e.target.classList.remove('border-red-500');
                    e.target.classList.add('border-green-500');
                } else {
                    e.target.classList.remove('border-green-500');
                    e.target.classList.add('border-red-500');
                }
            } else {
                e.target.classList.remove('border-red-500', 'border-green-500');
            }
        });
    }
}