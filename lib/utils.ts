export function exportToCSV<T extends Record<string, any>>(data: T[], filename: string) {
    if (data.length === 0) {
        alert("Nessun dato da esportare.");
        return;
    }

    // Extract headers
    const headers = Object.keys(data[0]);

    // Format row
    const csvRows = [
        headers.join(','), // Header row
        ...data.map(row =>
            headers.map(header => {
                let cell = row[header] === null || row[header] === undefined ? '' : row[header];
                if (typeof cell === 'object') {
                    cell = JSON.stringify(cell);
                }
                const cellString = String(cell).replace(/"/g, '""'); // Escape quotes
                return `"${cellString}"`;
            }).join(',')
        )
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
