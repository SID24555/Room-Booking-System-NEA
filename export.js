//export.js - CSV export of current user's upcoming bookings

//downloads CSV of current user's upcoming bookings
function exportToCSV() {
    const bookings = getBookings().filter(
        b => b.userId === (appState.currentUser ? appState.currentUser.id : null)
    );

    const sortedBookings = mergeSort(bookings, 'date');

    //same as My Bookings: today and future only
    const futureBookings = sortedBookings.filter(b => b.date >= formatDate(new Date()));

    if (futureBookings.length === 0) {
        //edge case handling
        showToast('No upcoming bookings to export', 'warning');
        return;
    }

    let csv = 'Date,Room,Period,Purpose,Seats\n';

    futureBookings.forEach(b => {
        const period = PERIODS.find(p => p.id === b.period);
        csv += '"' + b.date + '","' + b.roomName + '","' +
            (period ? period.name : b.period) + '","' +
            b.purpose + '","' + (b.seats || 'N/A') + '"\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'herschel_bookings_' + formatDate(new Date()) + '.csv';
    link.click();

    showToast('Upcoming bookings exported successfully');
}
