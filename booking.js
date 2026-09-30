//booking.js - booking modal, room/seat selection, create/delete booking, recurring, teacher limit

//returns true if candidate booking conflicts with existing; O(1) occupiedSlotKeys for exclusive-slot rooms, hasConflict for computer rooms
function bookingHasConflictWithExisting(candidate) {
    const candidateBooking = candidate instanceof Booking ? candidate : new Booking(candidate);
    const slotKey = makeSlotKey(candidateBooking.roomId, candidateBooking.date, candidateBooking.period);

    if (isExclusiveSlotRoom(candidateBooking.roomId)) {
        return !!(appState.bookingIndexes && appState.bookingIndexes.occupiedSlotKeys && appState.bookingIndexes.occupiedSlotKeys.has(slotKey));
    }

    const existingForSlot = getBookings().filter(b =>
        b.roomId === candidateBooking.roomId && b.date === candidateBooking.date && b.period === candidateBooking.period
    );
    return existingForSlot.some(b => candidateBooking.hasConflict(b));
}

//shows modal when teacher has reached maximum bookings
function showTeacherLimitModal(message) {
    const modal = document.getElementById('teacher-limit-modal');
    const msg = document.getElementById('teacher-limit-message');
    const okBtn = document.getElementById('teacher-limit-ok');

    //safe fallback if modal elements are missing
    if (!modal || !msg || !okBtn) {
        alert(message);
        return;
    }

    msg.textContent = message;
    modal.classList.remove('hidden');

    okBtn.onclick = () => {
        modal.classList.add('hidden');
    };
}

//shows partial recurrence conflict modal (same format as teacher limit); onProceed/onCancel called when user clicks
function showPartialConflictModal(message, onProceed, onCancel) {
    const modal = document.getElementById('partial-conflict-modal');
    const msg = document.getElementById('partial-conflict-message');
    const cancelBtn = document.getElementById('partial-conflict-cancel');
    const proceedBtn = document.getElementById('partial-conflict-proceed');

    if (!modal || !msg || !cancelBtn || !proceedBtn) {
        if (confirm(message)) (onProceed || (() => {}))();
        return;
    }

    msg.textContent = message;
    modal.classList.remove('hidden');

    const hide = () => modal.classList.add('hidden');

    cancelBtn.onclick = () => {
        hide();
        if (onCancel) onCancel();
    };

    proceedBtn.onclick = () => {
        hide();
        if (onProceed) onProceed();
    };
}

//opens booking modal for given date and period with room list and existing bookings
function openBookingModal(date, period) {
    const periodInfo = PERIODS.find(p => p.id === period);
    const dateObj = new Date(date);

    const limitNote = document.getElementById('teacher-booking-limit-note');
    if (limitNote) {
        const isTeacher = appState.currentUser && appState.currentUser.role === 'teacher';
        limitNote.classList.toggle('hidden', !isTeacher);
    }


    appState.selectedSlot = { date, period };
    appState.selectedSeats = [];

    document.getElementById('modal-title').textContent = 'Book a Room';
    document.getElementById('modal-subtitle').textContent =
        formatDateDisplay(dateObj) + ' - ' + (periodInfo ? periodInfo.name : period);

    const existingBookings = getBookings().filter(b => b.date === date && b.period === period);
    const existingContainer = document.getElementById('existing-bookings');
    const existingList = document.getElementById('existing-bookings-list');

    if (existingBookings.length > 0) {
        existingContainer.classList.remove('hidden');
        existingList.innerHTML = '';
        existingBookings.forEach(b => {
            existingList.innerHTML += `
            <div class="text-sm">
              <span class="font-medium">${getRoomDisplayName(b)}</span> - ${b.userName}
              ${b.seats ? '(Seats: ' + b.seats + ')' : ''}
            </div>
          `;
        });
    } else {
        existingContainer.classList.add('hidden');
    }

    const roomSelect = document.getElementById('booking-room');
    roomSelect.innerHTML = '<option value="">Select a room</option>';
    ROOMS.forEach(room => {
        roomSelect.innerHTML += '<option value="' + room.id + '">' + room.name + '</option>';
    });

    const roomFilter = document.getElementById('room-filter');
    if (roomFilter.value !== 'all') {
        roomSelect.value = roomFilter.value;
        handleRoomSelection(roomFilter.value, date, period);
    }

    document.getElementById('seat-selection').classList.add('hidden');
    document.getElementById('seat-count-container').classList.add('hidden');

    const canBook = appState.currentUser ? appState.currentUser.canBook() : false;
    document.getElementById('booking-form-container').classList.toggle('hidden', !canBook);
    document.getElementById('view-only-container').classList.toggle('hidden', canBook);

    document.getElementById('booking-purpose').value = '';
    document.getElementById('booking-recurrence').value = 'none';
    document.getElementById('seat-count-input').value = '';
    document.getElementById('booking-error').classList.add('hidden');
    document.getElementById('recurrence-preview').classList.add('hidden');

    document.getElementById('booking-modal').classList.remove('hidden');
}

//shows or hides seat grid when user selects a computer lab or hall
function handleRoomSelection(roomId, date, period) {
    const roomSelect = document.getElementById('booking-room');
    const selectedOption = roomSelect && roomSelect.selectedIndex > -1 ? roomSelect.options[roomSelect.selectedIndex] : null;
    const nameHint = selectedOption ? selectedOption.textContent : '';

    //resolve room by name when possible so we get correct capacity/type
    const selectedRoom = getRoomByIdWithBinarySearch(roomId, nameHint);
    if (!selectedRoom) return;

    const seatSelection = document.getElementById('seat-selection');
    const seatCountContainer = document.getElementById('seat-count-container');

    appState.selectedSeats = [];
    document.getElementById('seat-count-input').value = '';

    if (selectedRoom.type === 'computer') {
        seatSelection.classList.remove('hidden');
        renderCinemaSeatGrid(selectedRoom.id, date, period);

        seatCountContainer.classList.remove('hidden');
    } else {
        seatSelection.classList.add('hidden');
        seatCountContainer.classList.add('hidden');
        appState.selectedSeats = [];
    }
}

//renders selectable seat grid for computer lab with booked seats disabled
function renderCinemaSeatGrid(roomId, date, period) {
    const grid = document.getElementById('seat-grid');
    grid.innerHTML = '';

    const allBookings = getBookings();
    let bookedSeats = getBookedSeatsForSlot(allBookings, roomId, date, period);

    if (!bookedSeats || typeof bookedSeats.has !== 'function') {
        const bookings = allBookings.filter(b =>
            b.date === date && b.period === period && b.roomId === roomId
        );

        bookedSeats = new Set();
        bookings.forEach(b => {
            seatsToSet(b.seats).forEach(seatNum => bookedSeats.add(seatNum));
        });
    }

    const rows = ['A', 'B', 'C', 'D'];
    const seatsPerRow = 8;
    let seatNumber = 1;

    rows.forEach((rowLabel) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'flex items-center justify-center gap-2';

        const leftLabel = document.createElement('div');
        leftLabel.className = 'row-label';
        leftLabel.textContent = rowLabel;
        rowDiv.appendChild(leftLabel);

        for (let i = 0; i < seatsPerRow; i++) {
            const btn = document.createElement('button');
            btn.className = 'seat-btn';
            btn.textContent = seatNumber;
            btn.dataset.seat = seatNumber;
            btn.title = 'Seat ' + rowLabel + (i + 1) + ' (#' + seatNumber + ')';

            if (bookedSeats.has(seatNumber)) {
                btn.classList.add('seat-booked');
                btn.disabled = true;
            } else {
                btn.classList.add('seat-available');
                const currentSeatNum = seatNumber;
                btn.addEventListener('click', () => toggleSeat(currentSeatNum, btn));
            }

            rowDiv.appendChild(btn);
            seatNumber++;
        }

        const rightLabel = document.createElement('div');
        rightLabel.className = 'row-label';
        rightLabel.textContent = rowLabel;
        rowDiv.appendChild(rightLabel);

        grid.appendChild(rowDiv);
    });
}

//toggles seat in or out of selected seats and updates label
function toggleSeat(seatNum, btn) {
    const index = appState.selectedSeats.indexOf(seatNum);
    if (index > -1) {
        appState.selectedSeats.splice(index, 1);
        btn.classList.remove('seat-selected');
        btn.classList.add('seat-available');
    } else {
        appState.selectedSeats.push(seatNum);
        btn.classList.remove('seat-available');
        btn.classList.add('seat-selected');
    }

    document.getElementById('selected-seats-count').textContent =
        appState.selectedSeats.length + ' seat' + (appState.selectedSeats.length !== 1 ? 's' : '') + ' selected';
}

//closes booking modal and clears selected slot and seats
function closeBookingModal() {
    document.getElementById('booking-modal').classList.add('hidden');
    appState.selectedSlot = null;
    appState.selectedSeats = [];
}

//validates form, checks conflicts and teacher limit then creates single or recurring booking
function confirmBooking() {
    const purpose = document.getElementById('booking-purpose').value.trim();
    const recurrence = document.getElementById('booking-recurrence').value;
    const roomId = document.getElementById('booking-room').value;

    if (!roomId) {
        document.getElementById('booking-error').textContent = 'Please select a room';
        document.getElementById('booking-error').classList.remove('hidden');
        return;
    }

    const roomSelect = document.getElementById('booking-room');
    const selectedOption = roomSelect && roomSelect.selectedIndex > -1 ? roomSelect.options[roomSelect.selectedIndex] : null;
    const nameHint = selectedOption ? selectedOption.textContent : '';

    const selectedRoom = getRoomByIdWithBinarySearch(roomId, nameHint);
    if (!selectedRoom) {
        document.getElementById('booking-error').textContent = 'Invalid room selection';
        document.getElementById('booking-error').classList.remove('hidden');
        return;
    }

    const candidateForValidation = {
        roomId: selectedRoom.id,
        date: appState.selectedSlot.date,
        period: appState.selectedSlot.period,
        purpose,
        userId: appState.currentUser.id
    };
    const validation = new Booking(candidateForValidation).validate();
    if (!validation.isValid) {
        document.getElementById('booking-error').textContent = validation.errors[0];
        document.getElementById('booking-error').classList.remove('hidden');
        return;
    }

    if (selectedRoom.type === 'computer') {
        const seatCountInput = document.getElementById('seat-count-input').value;
        const seatCount = parseInt(seatCountInput);

        if (!seatCountInput || isNaN(seatCount) || seatCount < 1) {
            document.getElementById('booking-error').textContent = 'Please enter the number of seats (minimum 1)';
            document.getElementById('booking-error').classList.remove('hidden');
            return;
        }

        if (seatCount > 32) {
            document.getElementById('booking-error').textContent = 'Maximum 32 seats allowed per booking';
            document.getElementById('booking-error').classList.remove('hidden');
            return;
        }

        const existingBookings = getBookings().filter(b =>
            b.date === appState.selectedSlot.date &&
            b.period === appState.selectedSlot.period &&
            b.roomId === selectedRoom.id
        );

        let bookedSeatsCount = 0;
        existingBookings.forEach(b => {
            bookedSeatsCount += seatsToSet(b.seats).size;
        });

        const availableSeats = 32 - bookedSeatsCount;
        if (seatCount > availableSeats) {
            document.getElementById('booking-error').textContent = 'Only ' + availableSeats + ' seats available in this room for this time slot';
            document.getElementById('booking-error').classList.remove('hidden');
            return;
        }

        if (appState.selectedSeats.length === 0) {
            const allSeats = Array.from({length: 32}, (_, i) => i + 1);

            let bookedSeatsForSlot = getBookedSeatsForSlot(getBookings(), selectedRoom.id, appState.selectedSlot.date, appState.selectedSlot.period);

            if (!bookedSeatsForSlot || typeof bookedSeatsForSlot.has !== 'function') {
                bookedSeatsForSlot = new Set();
                existingBookings.forEach(b => {
                    seatsToSet(b.seats).forEach(seatNum => bookedSeatsForSlot.add(seatNum));
                });
            }

            const availableSeatNumbers = allSeats.filter(seatNum => !bookedSeatsForSlot.has(seatNum));
            appState.selectedSeats = availableSeatNumbers.slice(0, seatCount);
        } else if (appState.selectedSeats.length !== seatCount) {
            document.getElementById('booking-error').textContent = 'You selected ' + appState.selectedSeats.length + ' seats but entered ' + seatCount + '. Please match the numbers or clear your selection.';
            document.getElementById('booking-error').classList.remove('hidden');
            return;
        }
    }

    if (!appState.currentUser.canBook()) {
        document.getElementById('booking-error').textContent = 'You do not have permission to make bookings';
        document.getElementById('booking-error').classList.remove('hidden');
        return;
    }

    const conflictCandidate = new Booking({
        roomId: selectedRoom.id,
        date: appState.selectedSlot.date,
        period: appState.selectedSlot.period,
        seats: selectedRoom.type === 'computer' ? appState.selectedSeats.slice().sort((a, b) => a - b).join(',') : ''
    });
    if (bookingHasConflictWithExisting(conflictCandidate)) {
        document.getElementById('booking-error').textContent = selectedRoom.type === 'hall'
            ? 'This room is already booked for this slot'
            : 'Selected seats are no longer available for this slot';
        document.getElementById('booking-error').classList.remove('hidden');
        return;
    }

    if (selectedRoom.type === 'computer' && appState.selectedSeats.length === 0) {
        document.getElementById('booking-error').textContent = 'Please select at least one seat';
        document.getElementById('booking-error').classList.remove('hidden');
        return;
    }

    const bookingData = {
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        date: appState.selectedSlot.date,
        period: appState.selectedSlot.period,
        purpose: purpose,
        userId: appState.currentUser.id,
        userName: appState.currentUser.name,
        seats: appState.selectedSeats.sort((a, b) => a - b).join(','),
        date_created: new Date().toISOString(),

        dismissedTodayReminder: false,
        dismissedUrgentReminder: false
    };

    if (appState.currentUser.role === 'teacher') {
        const todayISO = formatDate(new Date());

        const activeCount = getBookings().filter(b =>
            b.userId === appState.currentUser.id && b.date >= todayISO
        ).length;

        const limit = appState.currentUser.getBookingLimit(); // 10
        const remaining = limit - activeCount;

        if (remaining <= 0) {
            showTeacherLimitModal('Maximum number of bookings reached');
            return;
        }

        if (recurrence !== 'none') {
            const tmpRecurring = new RecurringBooking({ ...bookingData, frequency: recurrence });
            const instances = tmpRecurring.generateInstances();

            if (instances.length > remaining) {
                showTeacherLimitModal(
                    'Maximum number of bookings reached. You have only ' +
                    remaining +
                    ' more booking(s) available'
                );
                return;
            }
        }
    }

    if (recurrence !== 'none') {
        const recurringBooking = new RecurringBooking({
            ...bookingData,
            frequency: recurrence
        });

        const instances = recurringBooking.generateInstances();

        let conflictCount = 0;
        let validCount = 0;
        for (const instance of instances) {
            if (bookingHasConflictWithExisting(instance)) conflictCount++;
            else validCount++;
        }

        if (validCount === 0) {
            return;
        }

        const doCreateAndFinish = () => {
            let successCount = 0;
            for (const instance of instances) {
                if (bookingHasConflictWithExisting(instance)) continue;

                const success = createBooking(instance);
                if (success) {
                    if (successCount === 0) {
                        appState.undoStack.push('CREATE', instance, appState.currentUser.id);
                    }
                    successCount++;
                }
            }
            if (successCount > 0) {
                showToast('Successfully created ' + successCount + ' recurring booking(s)');
                if (typeof window.enqueueBookingConfirmation === 'function' && instances.length > 0) {
                    window.enqueueBookingConfirmation(selectedRoom.name, instances[0].date, instances[0].period);
                }
                closeBookingModal();
                rerender();
                updateUndoButton();
            }
        };

        if (conflictCount > 0 && validCount > 0) {
            const msg = conflictCount + ' of your ' + instances.length + ' recurring bookings conflict with existing bookings. Only ' + validCount + ' can be created. Do you want to proceed?';
            showPartialConflictModal(msg, doCreateAndFinish, () => {});
            return;
        }

        doCreateAndFinish();
    } else {
        const success = createBooking(bookingData);

        if (success) {
            appState.undoStack.push('CREATE', bookingData, appState.currentUser.id);
            updateUndoButton();

            showToast('Booking created successfully');

            if (typeof window.enqueueBookingConfirmation === 'function') {
                window.enqueueBookingConfirmation(selectedRoom.name, appState.selectedSlot.date, appState.selectedSlot.period);
            }

            closeBookingModal();
            rerender();
        } else {
            document.getElementById('booking-error').textContent = 'Failed to create booking';
            document.getElementById('booking-error').classList.remove('hidden');
        }
    }
}

//shows delete confirmation modal for given booking
function confirmDeleteBooking(booking) {
    appState.bookingToDelete = booking;
    document.getElementById('delete-message').textContent =
        'Are you sure you want to cancel your booking for ' + getRoomDisplayName(booking) + ' on ' + formatDateDisplay(new Date(booking.date)) + '?';
    document.getElementById('delete-modal').classList.remove('hidden');
}

//pushes undo then deletes selected booking and refreshes UI
function executeDeleteBooking() {
    if (appState.bookingToDelete) {
        const bookingData = { ...appState.bookingToDelete };
        appState.undoStack.push('DELETE', bookingData, appState.currentUser.id);

        const success = deleteBooking(appState.bookingToDelete);
        if (success) {
            showToast('Booking cancelled successfully');
            renderMyBookings();
            rerender();
            updateUndoButton();
        } else {
            showToast('Failed to cancel booking', 'error');
        }
    }
    document.getElementById('delete-modal').classList.add('hidden');
    appState.bookingToDelete = null;
}

//dev-console test (Test 7.6): after admin books Computer Lab 1 on 2026-01-07 (seats 1–32) and teacher creates recurring weekly from 2025-12-31 (seats 1–10), the 2026-01-07 instance must be rejected. verify: getBookings().filter(b => b.roomId === 'comp-lab-1' && b.date === '2026-01-07' && b.period === 'p1').length === 1
