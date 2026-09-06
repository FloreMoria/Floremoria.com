import type ExcelJS from 'exceljs';

export interface ColumnDefinition<T> {
    header: string;
    key: string;
    width?: number;
    format?: 'currency' | 'date' | 'string' | 'number';
    getValue: (item: T) => string | number | null | undefined;
}

const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D6F42' }, // Excel green
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: 'FFFFFFFF' },
    size: 11,
    name: 'Calibri',
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    left: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    bottom: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    right: { style: 'thin', color: { argb: 'FFD6D3D1' } },
};

const EUR_FORMAT = '€ #,##0.00;[Red]-€ #,##0.00;€ 0.00';

export async function exportToExcel<T>({
    filename,
    sheetName,
    title,
    subtitle,
    columns,
    data,
    summarySums,
}: {
    filename: string;
    sheetName: string;
    title: string;
    subtitle?: string;
    columns: ColumnDefinition<T>[];
    data: T[];
    summarySums?: string[]; // keys of columns to sum at the bottom
}) {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FloreMoria Contabilità';
    workbook.created = new Date();

    const ws = workbook.addWorksheet(sheetName.slice(0, 31), {
        views: [{ showGridLines: true }],
    });

    // 1. Title block
    const titleRow = ws.addRow([title]);
    titleRow.font = { bold: true, size: 14, color: { argb: 'FF1E293B' }, name: 'Calibri' };
    ws.addRow([]);

    if (subtitle) {
        const subRow = ws.addRow([subtitle]);
        subRow.font = { italic: true, size: 10, color: { argb: 'FF64748B' }, name: 'Calibri' };
        ws.addRow([]);
    }

    // 2. Table Headers
    const headerRowValues = columns.map((c) => c.header);
    const headerRow = ws.addRow(headerRowValues);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = THIN_BORDER;
    });

    // 3. Data Rows
    const dataStartRowIndex = ws.rowCount + 1;
    data.forEach((item, rowIdx) => {
        const rowValues = columns.map((col) => col.getValue(item));
        const row = ws.addRow(rowValues);
        row.height = 20;

        const isEven = rowIdx % 2 === 0;
        const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const colDef = columns[colNumber - 1];
            cell.border = THIN_BORDER;
            cell.font = { size: 10, name: 'Calibri' };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: rowBgColor },
            };

            if (colDef?.format === 'currency') {
                cell.numFmt = EUR_FORMAT;
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            } else if (colDef?.format === 'number') {
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            } else if (colDef?.format === 'date') {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
        });
    });
    const dataEndRowIndex = ws.rowCount;

    // 4. Summary / Total Row
    if (summarySums && summarySums.length > 0 && data.length > 0) {
        const sumRowValues: (string | { formula: string })[] = [];
        let labelPlaced = false;

        columns.forEach((col, idx) => {
            if (summarySums.includes(col.key)) {
                const colLetter = ws.getColumn(idx + 1).letter;
                sumRowValues.push({
                    formula: `SUM(${colLetter}${dataStartRowIndex}:${colLetter}${dataEndRowIndex})`,
                });
            } else if (!labelPlaced) {
                sumRowValues.push('TOTALE');
                labelPlaced = true;
            } else {
                sumRowValues.push('');
            }
        });

        const sumRow = ws.addRow(sumRowValues);
        sumRow.height = 24;
        sumRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const colDef = columns[colNumber - 1];
            cell.border = {
                top: { style: 'medium', color: { argb: 'FF1E293B' } },
                bottom: { style: 'double', color: { argb: 'FF1E293B' } },
                left: THIN_BORDER.left,
                right: THIN_BORDER.right,
            };
            cell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF1E293B' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF1F5F9' },
            };
            if (colDef?.format === 'currency') {
                cell.numFmt = EUR_FORMAT;
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });
    }

    // 5. Column widths auto-fit
    columns.forEach((colDef, idx) => {
        const wsCol = ws.getColumn(idx + 1);
        if (colDef.width) {
            wsCol.width = colDef.width;
        } else {
            let maxLen = colDef.header.length + 3;
            data.forEach((item) => {
                const val = colDef.getValue(item);
                const str = val == null ? '' : typeof val === 'number' ? (colDef.format === 'currency' ? `€ ${val.toFixed(2)}` : String(val)) : String(val);
                if (str.length > maxLen) maxLen = Math.min(50, str.length + 2);
            });
            wsCol.width = Math.max(12, maxLen);
        }
    });

    // 6. Generate buffer & trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
