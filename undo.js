//undo.js - undo stack for last booking create/delete, button visibility

    //shows or hides undo button and sets label from last stack action
    function updateUndoButton() {
        const undoBtn = document.getElementById('undo-btn');
        const undoText = document.getElementById('undo-text');

        if (!appState.currentUser || !appState.currentUser.canBook()) {
            undoBtn.classList.add('hidden');
            return;
        }

        const lastAction = appState.undoStack.peek();

        if (lastAction) {
            undoBtn.classList.remove('hidden');
            undoText.textContent = 'Undo ' + lastAction.action.toLowerCase();
        } else {
            undoBtn.classList.add('hidden');
        }
    }

    //reverses last create or delete booking and refreshes UI
    function executeUndo() {
        const action = appState.undoStack.pop();
        if (!action) return;

        //if booking create, then delete the booking just created
        if (action.action === 'CREATE') {
            const booking = getBookings().find(b =>
                b.roomId === action.bookingData.roomId &&
                b.date === action.bookingData.date &&
                b.period === action.bookingData.period &&
                b.userId === action.bookingData.userId
            );

            if (booking) {
                deleteBooking(booking);
                logAudit('BOOKING_UNDONE', 'Undid creation of ' + booking.roomName + ' booking');
                showToast('Booking creation undone');
            }
            //if booking delete, then create the booking just deleted
        } else if (action.action === 'DELETE') {
            createBooking(action.bookingData);
            logAudit('BOOKING_RESTORED', 'Restored ' + action.bookingData.roomName + ' booking');
            showToast('Booking deletion undone');
        }

        //refreshes following for real time availability
        updateUndoButton();
        rerender();
        renderMyBookings();
    }
